/**
 * Page lifecycle helpers: reduced motion, visibility pause, resize/orientation, clocks.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/** Calls cb(true) when the page is hidden and cb(false) when it is visible again. */
export function onVisibilityChange(cb: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = () => cb(document.visibilityState === 'hidden');
  const onHide = () => cb(true);
  document.addEventListener('visibilitychange', handler);
  window.addEventListener('pagehide', onHide);
  return () => {
    document.removeEventListener('visibilitychange', handler);
    window.removeEventListener('pagehide', onHide);
  };
}

/** Resize + orientation changes, coalesced to one call per animation frame. */
export function onResize(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      cb();
    });
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', schedule);
  return () => {
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    vv?.removeEventListener('resize', schedule);
  };
}

/** True when launched from the home screen (PWA standalone display). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function isPortrait(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
}

export interface GameClock {
  /** Seconds since start (frozen clocks only advance through step()). */
  readonly elapsed: number;
  /** Seconds since the previous frame (0 while frozen). */
  readonly dt: number;
  readonly frame: number;
  readonly frozen: boolean;
  /** Fixed steps queued by step() that tick() has not consumed yet (always 0 when live). */
  readonly pending: number;
  /** Advance using a real timestamp (ms). Returns dt in seconds. */
  tick(nowMs: number): number;
  /** Advance a frozen clock by a number of fixed frames (1/60 s each). */
  step(frames: number): void;
}

export interface ClockOptions {
  frozen?: boolean;
  /** Longest dt accepted in seconds (protects against tab switches). */
  maxDt?: number;
  fixedStep?: number;
}

export function createClock(opts: ClockOptions = {}): GameClock {
  const frozen = opts.frozen ?? false;
  const maxDt = opts.maxDt ?? 1 / 15;
  const fixed = opts.fixedStep ?? 1 / 60;
  let elapsed = 0;
  let dt = 0;
  let frame = 0;
  let last: number | null = null;
  let pendingSteps = 0;
  return {
    get elapsed() {
      return elapsed;
    },
    get dt() {
      return dt;
    },
    get frame() {
      return frame;
    },
    get pending() {
      return pendingSteps;
    },
    frozen,
    tick(nowMs) {
      frame++;
      if (frozen) {
        if (pendingSteps > 0) {
          pendingSteps--;
          dt = fixed;
          elapsed += fixed;
        } else {
          dt = 0;
        }
        return dt;
      }
      if (last === null) {
        last = nowMs;
        dt = 0;
        return 0;
      }
      dt = Math.min(maxDt, Math.max(0, (nowMs - last) / 1000));
      last = nowMs;
      elapsed += dt;
      return dt;
    },
    step(frames) {
      // A live clock follows real time, so fixed steps do not apply.
      if (!frozen) return;
      pendingSteps += Math.max(0, Math.floor(Number.isFinite(frames) ? frames : 0));
    },
  };
}
