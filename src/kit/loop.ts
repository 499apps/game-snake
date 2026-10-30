/**
 * Render loop. Live mode (real play, ?test=1&live=1) updates and renders on every animation
 * frame. On-demand mode (the frozen test clock) renders only when asked: once at start, then
 * after clock.step(), input, resize, a tier change or requestRender(). Software WebGL in
 * headless test browsers is slow, so an idle frozen page must not keep the main thread busy.
 *
 * No three.js import here, so the loop is unit tested in Node with a fake requestAnimationFrame.
 */
import type { GameClock } from './lifecycle';
import { FrameMonitor, type Tier } from './quality';

/** The part of KitRenderer the loop needs. */
export interface LoopTarget {
  readonly settings: { readonly tier: Tier };
  setTier(tier: Tier): void;
  render(): void;
  /** The loop installs its scheduler here so kit.requestRender() can wake it. */
  setRenderScheduler(fn: (() => void) | null): void;
}

export interface LoopOptions {
  kit: LoopTarget;
  clock: GameClock;
  update: (dt: number, elapsed: number) => void;
  /** Adjust the quality tier from measured frame times (off in frozen test mode). */
  adaptive?: boolean;
  /** Render only on request. Default: true when the clock is frozen. */
  onDemand?: boolean;
  monitor?: FrameMonitor;
  onTierChange?: (tier: Tier) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Ask for one more frame. Live mode renders every frame anyway. */
  requestRender(): void;
  /**
   * Resolves when the loop is idle: on demand, after every queued step is consumed and drawn;
   * live, after the next frame. Resolves at once when stopped or paused.
   */
  idle(): Promise<void>;
  readonly running: boolean;
  readonly paused: boolean;
  readonly onDemand: boolean;
  /** Frames drawn since start. */
  readonly renders: number;
  /** Last real frame durations in ms (up to 240). */
  readonly frameTimes: number[];
}

/** Upper bound of fixed steps consumed in one on-demand frame (the rest go to the next frame). */
export const MAX_STEPS_PER_FRAME = 600;

export function createLoop(o: LoopOptions): Loop {
  const monitor = o.monitor ?? new FrameMonitor();
  const onDemand = o.onDemand ?? o.clock.frozen;
  const frameTimes: number[] = [];
  let handle = 0;
  let scheduled = false;
  let running = false;
  let paused = false;
  let inFrame = false;
  let lastReal: number | null = null;
  let renders = 0;
  let waiters: Array<() => void> = [];

  const flushWaiters = () => {
    if (waiters.length === 0) return;
    const list = waiters;
    waiters = [];
    for (const resolve of list) resolve();
  };

  const schedule = () => {
    if (!running || paused || scheduled) return;
    scheduled = true;
    handle = requestAnimationFrame(frame);
  };

  const cancel = () => {
    if (scheduled) cancelAnimationFrame(handle);
    scheduled = false;
  };

  const measure = (now: number) => {
    const realDt = lastReal === null ? 0 : now - lastReal;
    lastReal = now;
    if (realDt <= 0) return;
    frameTimes.push(realDt);
    if (frameTimes.length > 240) frameTimes.shift();
    if (o.adaptive && !o.clock.frozen) {
      const next = monitor.push(realDt, o.kit.settings.tier);
      if (next) {
        o.kit.setTier(next);
        o.onTierChange?.(next);
      }
    }
  };

  function frame(now: number): void {
    scheduled = false;
    if (!running || paused) return;
    if (!onDemand) schedule();
    inFrame = true;
    try {
      if (onDemand) {
        // Consume the queued fixed steps one update each (same as one step per frame, so the
        // result is identical), then draw once.
        let steps = 0;
        do {
          const dt = o.clock.tick(now);
          o.update(dt, o.clock.elapsed);
          steps++;
        } while (o.clock.pending > 0 && steps < MAX_STEPS_PER_FRAME);
      } else {
        measure(now);
        const dt = o.clock.tick(now);
        o.update(dt, o.clock.elapsed);
      }
      o.kit.render();
      renders++;
    } finally {
      inFrame = false;
    }
    if (onDemand && o.clock.pending > 0) schedule();
    if (!onDemand || !scheduled) flushWaiters();
  }

  const requestRender = () => {
    // A request from inside update() is covered by the render at the end of this frame.
    if (inFrame) return;
    schedule();
  };

  return {
    get running() {
      return running;
    },
    get paused() {
      return paused;
    },
    get renders() {
      return renders;
    },
    onDemand,
    frameTimes,
    start() {
      if (running) return;
      running = true;
      paused = false;
      lastReal = null;
      o.kit.setRenderScheduler(requestRender);
      schedule();
    },
    stop() {
      running = false;
      cancel();
      o.kit.setRenderScheduler(null);
      flushWaiters();
    },
    pause() {
      if (!running || paused) return;
      paused = true;
      cancel();
      flushWaiters();
    },
    resume() {
      if (!running || !paused) return;
      paused = false;
      lastReal = null;
      schedule();
    },
    requestRender,
    idle() {
      if (!running || paused) return Promise.resolve();
      if (onDemand && !scheduled) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}
