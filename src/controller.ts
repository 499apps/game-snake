/**
 * Game controller (no DOM, no three.js): owns the rules state, the fixed-step clock and pause,
 * and maps player intents (steer, primary) to rule calls. The page wires its events to the
 * scene, the sounds and the HUD.
 */
import type { Direction } from './kit/input';
import type { Rng } from './kit/prng';
import type { Cell } from './game/grid';
import {
  BOARD_SIZE,
  createState,
  queueTurn,
  runFixedSteps,
  start,
  step,
  stepInterval,
  type Mode,
  type SnakeState,
} from './logic';

export interface ControllerEvents {
  onReset?(s: SnakeState): void;
  onStart?(s: SnakeState): void;
  /** After every step; `prev` is the body before it (for render interpolation). */
  onStep?(prev: readonly Cell[], s: SnakeState): void;
  onEat?(cell: Cell, points: number, s: SnakeState): void;
  onEnd?(s: SnakeState): void;
  onPause?(paused: boolean): void;
  onTurn?(dir: Direction): void;
}

/** What a tap / Space / A did. */
export type PrimaryResult = 'start' | 'pause' | 'resume' | 'restart' | 'wait';

/** Seconds after a round ends before a tap starts the next one (no accidental restarts). */
export const RESTART_DELAY = 0.8;

export class GameController {
  state: SnakeState;
  /** The body before the last step: the scene glides from here to `state.body`. */
  prevBody: readonly Cell[];
  /** Seconds since the round ended (0 while not over). */
  endedFor = 0;
  private acc = 0;
  private pausedFlag = false;
  private readonly rng: Rng;
  private readonly ev: ControllerEvents;
  private readonly size: number;
  /** Garden boards: seeded bushes each round (optional, off by default). */
  private gardenFlag: boolean;

  constructor(
    rng: Rng,
    mode: Mode,
    events: ControllerEvents = {},
    size = BOARD_SIZE,
    options: { garden?: boolean } = {},
  ) {
    this.rng = rng;
    this.ev = events;
    this.size = size;
    this.gardenFlag = options.garden ?? false;
    this.state = createState(rng, mode, size, { garden: this.gardenFlag });
    this.prevBody = this.state.body;
  }

  get garden(): boolean {
    return this.gardenFlag;
  }

  /** Switch garden boards on or off; starts a fresh round in the ready phase. */
  setGarden(on: boolean): void {
    this.gardenFlag = on;
    this.reset();
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  get mode(): Mode {
    return this.state.mode;
  }

  /** Seconds per step right now. */
  get interval(): number {
    return stepInterval(this.state.mode, this.state.eaten);
  }

  /** Render interpolation between prevBody (0) and the current body (1). */
  get alpha(): number {
    if (this.state.phase !== 'playing') return 1;
    return Math.min(1, this.acc / this.interval);
  }

  /** A fresh round in the ready phase (optionally in another mode). */
  reset(mode: Mode = this.state.mode): void {
    this.state = createState(this.rng, mode, this.size, { garden: this.gardenFlag });
    this.prevBody = this.state.body;
    this.acc = 0;
    this.endedFor = 0;
    this.pausedFlag = false;
    this.ev.onReset?.(this.state);
  }

  /** Leave the ready phase. Returns false in the other phases. */
  begin(): boolean {
    if (this.state.phase !== 'ready') return false;
    this.state = start(this.state);
    this.acc = 0;
    this.ev.onStart?.(this.state);
    return true;
  }

  /** Steer: starts a ready round and resumes a paused one. Returns true when a turn was queued. */
  steer(dir: Direction): boolean {
    if (this.state.phase === 'over') return false;
    if (this.state.phase === 'ready') this.begin();
    if (this.pausedFlag) this.setPaused(false);
    const before = this.state;
    this.state = queueTurn(this.state, dir);
    const queued = this.state !== before;
    if (queued) this.ev.onTurn?.(dir);
    return queued;
  }

  /** Tap / Space / A: start, pause, resume or play again. */
  primary(): PrimaryResult {
    switch (this.state.phase) {
      case 'ready':
        this.begin();
        return 'start';
      case 'playing':
        this.setPaused(!this.pausedFlag);
        return this.pausedFlag ? 'pause' : 'resume';
      case 'over':
        if (this.endedFor < RESTART_DELAY) return 'wait';
        this.reset();
        this.begin();
        return 'restart';
    }
  }

  /** Pause only means something while playing. */
  setPaused(p: boolean): void {
    const next = p && this.state.phase === 'playing';
    if (next === this.pausedFlag) return;
    this.pausedFlag = next;
    this.ev.onPause?.(next);
  }

  update(dt: number): void {
    if (this.state.phase === 'over') {
      this.endedFor += Math.max(0, dt);
      return;
    }
    if (this.state.phase !== 'playing' || this.pausedFlag) return;
    this.acc = runFixedSteps(
      this.acc,
      dt,
      () => this.interval,
      () => this.stepOnce(),
    );
  }

  private stepOnce(): boolean {
    const prev = this.state.body;
    const r = step(this.state, this.rng);
    this.state = r.state;
    this.prevBody = r.ended ? r.state.body : prev;
    this.ev.onStep?.(this.prevBody, this.state);
    if (r.ate) this.ev.onEat?.(r.ate, r.points, this.state);
    if (r.ended) {
      this.endedFor = 0;
      this.ev.onEnd?.(this.state);
    }
    return !r.ended;
  }
}
