/**
 * Snake rules (pure, seeded). No DOM and no three.js: the controller drives this module and the
 * scene only reads its state. Screen-style grid: +x right, +y down (toward the player).
 *
 * Modes:
 * - easy: the walls wrap around to the other side, slow steps;
 * - normal: touching a wall ends the round gently;
 * - fast: like normal, with quick steps.
 */
import { directionVector, type Direction } from './kit/input';
import type { Rng } from './kit/prng';
import { inBounds, sameCell, stepCell, turn, type Cell } from './game/grid';

export type Mode = 'easy' | 'normal' | 'fast';
export const MODES: readonly Mode[] = ['easy', 'normal', 'fast'];

export interface ModeRules {
  /** The walls wrap around to the other side. */
  wrap: boolean;
  /** Seconds per step at the start of a round. */
  step: number;
  /** The fastest step a round speeds up to. */
  minStep: number;
  /** Seconds taken off the step for each food eaten. */
  speedUp: number;
  /** Points for one food before the combo multiplier. */
  points: number;
}

export const MODE_RULES: Readonly<Record<Mode, ModeRules>> = {
  easy: { wrap: true, step: 0.22, minStep: 0.15, speedUp: 0.002, points: 5 },
  normal: { wrap: false, step: 0.16, minStep: 0.1, speedUp: 0.002, points: 10 },
  fast: { wrap: false, step: 0.105, minStep: 0.07, speedUp: 0.0015, points: 15 },
};

export const BOARD_SIZE = 11;
export const START_LENGTH = 3;
export const MAX_QUEUED_TURNS = 2;
/** Eat again within this many steps of the last meal to raise the combo. */
export const COMBO_WINDOW = 16;
export const MAX_COMBO = 5;

export type Phase = 'ready' | 'playing' | 'over';
/** Why a round ended: a wall bump, the snake's own body, or a full board (a win). */
export type EndCause = 'wall' | 'self' | 'full';

export interface SnakeState {
  readonly size: number;
  readonly mode: Mode;
  readonly phase: Phase;
  /** Head first. */
  readonly body: readonly Cell[];
  readonly dir: Direction;
  readonly queued: readonly Direction[];
  /** Null only when the snake fills the whole board. */
  readonly food: Cell | null;
  readonly score: number;
  readonly eaten: number;
  /** 0 before the first meal, then 1..MAX_COMBO. */
  readonly combo: number;
  /** Tick of the last meal, -1 before the first one. */
  readonly lastMealTick: number;
  readonly tick: number;
  readonly cause: EndCause | null;
}

export function isMode(v: unknown): v is Mode {
  return v === 'easy' || v === 'normal' || v === 'fast';
}

export function nextMode(m: Mode): Mode {
  return MODES[(MODES.indexOf(m) + 1) % MODES.length] as Mode;
}

/** Every cell the snake does not cover, in row order. */
export function freeCells(body: readonly Cell[], size: number): Cell[] {
  const taken = new Set<number>();
  for (const c of body) taken.add(c.y * size + c.x);
  const out: Cell[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!taken.has(y * size + x)) out.push({ x, y });
    }
  }
  return out;
}

/** A random free cell for the food, or null when the snake covers the board. */
export function placeFood(body: readonly Cell[], size: number, rng: Rng): Cell | null {
  const free = freeCells(body, size);
  return free.length === 0 ? null : rng.pick(free);
}

export function createState(rng: Rng, mode: Mode = 'normal', size = BOARD_SIZE): SnakeState {
  const mid = Math.floor(size / 2);
  const body: Cell[] = [];
  for (let i = 0; i < START_LENGTH; i++) body.push({ x: mid - i, y: mid });
  return {
    size,
    mode,
    phase: 'ready',
    body,
    dir: 'right',
    queued: [],
    food: placeFood(body, size, rng),
    score: 0,
    eaten: 0,
    combo: 0,
    lastMealTick: -1,
    tick: 0,
    cause: null,
  };
}

/** Leave the ready phase. Does nothing in the other phases. */
export function start(s: SnakeState): SnakeState {
  return s.phase === 'ready' ? { ...s, phase: 'playing' } : s;
}

/**
 * Buffer a turn. Up to MAX_QUEUED_TURNS turns wait for the next steps, so two quick presses
 * (for example up then left) both count. A reversal or a repeat of the last queued heading is
 * ignored, so the snake never turns straight back into its neck.
 */
export function queueTurn(s: SnakeState, requested: Direction): SnakeState {
  if (s.phase === 'over') return s;
  const last = s.queued.length > 0 ? (s.queued[s.queued.length - 1] as Direction) : s.dir;
  const next = turn(last, requested);
  if (next === last || s.queued.length >= MAX_QUEUED_TURNS) return s;
  return { ...s, queued: [...s.queued, next] };
}

/** Seconds per step: the round speeds up a little with every meal. */
export function stepInterval(mode: Mode, eaten: number): number {
  const r = MODE_RULES[mode];
  return Math.max(r.minStep, r.step - Math.max(0, eaten) * r.speedUp);
}

/** The next head cell. Without wrap it can be off the board (a wall bump). */
export function nextHead(head: Cell, dir: Direction, size: number, wrap: boolean): Cell {
  if (wrap) return stepCell(head, dir, size);
  const v = directionVector(dir);
  return { x: head.x + v.x, y: head.y + v.y };
}

/** Combo after a meal on `tick`: quick meals raise it, a slow one starts again at 1. */
export function nextCombo(combo: number, lastMealTick: number, tick: number): number {
  if (lastMealTick >= 0 && tick - lastMealTick <= COMBO_WINDOW) return Math.min(MAX_COMBO, combo + 1);
  return 1;
}

export interface StepResult {
  state: SnakeState;
  /** The cell of the food eaten this step, if any. */
  ate: Cell | null;
  points: number;
  /** True on the step that ended the round. */
  ended: boolean;
}

/** Advance one step. Only the playing phase moves. */
export function step(s: SnakeState, rng: Rng): StepResult {
  if (s.phase !== 'playing') return { state: s, ate: null, points: 0, ended: false };
  const rules = MODE_RULES[s.mode];
  const [queuedDir, ...rest] = s.queued;
  const dir = queuedDir ?? s.dir;
  const head = s.body[0] as Cell;
  const target = nextHead(head, dir, s.size, rules.wrap);
  const tick = s.tick + 1;

  if (!inBounds(target, s.size)) {
    // A gentle stop: the snake stays where it is, facing the wall.
    return {
      state: { ...s, dir, queued: [], phase: 'over', cause: 'wall', tick },
      ate: null,
      points: 0,
      ended: true,
    };
  }

  const eats = s.food !== null && sameCell(target, s.food);
  // The tail moves away this step unless the snake grows, so its cell is free to enter.
  const blockers = eats ? s.body : s.body.slice(0, -1);
  if (blockers.some((c) => sameCell(c, target))) {
    return {
      state: { ...s, dir, queued: [], phase: 'over', cause: 'self', tick },
      ate: null,
      points: 0,
      ended: true,
    };
  }

  const body = [target, ...(eats ? s.body : s.body.slice(0, -1))];
  if (!eats) {
    return { state: { ...s, body, dir, queued: rest, tick }, ate: null, points: 0, ended: false };
  }

  const combo = nextCombo(s.combo, s.lastMealTick, tick);
  const points = rules.points * combo;
  const food = placeFood(body, s.size, rng);
  const full = food === null;
  return {
    state: {
      ...s,
      body,
      dir,
      queued: full ? [] : rest,
      food,
      score: s.score + points,
      eaten: s.eaten + 1,
      combo,
      lastMealTick: tick,
      tick,
      phase: full ? 'over' : 'playing',
      cause: full ? 'full' : null,
    },
    ate: target,
    points,
    ended: full,
  };
}

/**
 * Fixed-timestep driver. Adds dt to the accumulator and runs whole steps while it holds at least
 * one interval (read again after each step, as meals speed the snake up). `onStep` returns false
 * to stop early (the round ended). Returns the new accumulator; the render interpolation factor is
 * accumulator / interval.
 */
export function runFixedSteps(
  acc: number,
  dt: number,
  interval: () => number,
  onStep: () => boolean,
  maxSteps = 4,
): number {
  let a = acc + (Number.isFinite(dt) && dt > 0 ? dt : 0);
  let n = 0;
  while (a >= interval() && n < maxSteps) {
    a -= interval();
    n++;
    if (!onStep()) return 0;
  }
  // After a long stall, drop the backlog instead of fast-forwarding.
  const i = interval();
  if (a >= i) a %= i;
  return a;
}

/** localStorage key (under the kit's g499: prefix) of the best score for a mode. */
export function bestKey(mode: Mode): string {
  return `snake:best:${mode}`;
}

/** Read a stored best score safely: a whole number >= 0, anything else is 0. */
export function sanitizeBest(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

export interface ScriptedTurn {
  /** Queue the turn before the step with this index (0 = before the first step). */
  at: number;
  dir: Direction;
}

/** Replay a round from a seed and an input script (tests and debugging). */
export function replay(
  rng: Rng,
  mode: Mode,
  turns: readonly ScriptedTurn[],
  steps: number,
  size = BOARD_SIZE,
): SnakeState {
  let s = start(createState(rng, mode, size));
  for (let i = 0; i < steps && s.phase === 'playing'; i++) {
    for (const t of turns) if (t.at === i) s = queueTurn(s, t.dir);
    s = step(s, rng).state;
  }
  return s;
}
