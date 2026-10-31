/**
 * Touchpad steering (no click needed). On a laptop touchpad or a Magic Trackpad, gliding one finger
 * moves the pointer without pressing, and a two-finger swipe arrives as wheel events. Both are
 * turned into steering here, so children can steer by just moving a finger.
 *
 * The gesture logic is pure (HoverSteer, WheelSteer, deltaToDirection) and unit tested; the DOM
 * wiring (attachTouchpadSteer) feeds them pointer and wheel deltas while a round is running.
 */
import type { Direction } from './kit/input';

/** Finger travel (css px) before a glide counts as a turn. */
export const HOVER_THRESHOLD = 24;
/** A pause longer than this (ms) forgets the partial glide, so slow drift never adds up. */
export const HOVER_IDLE_MS = 180;
/** Two-finger swipe travel (css px of scroll) before it counts as a turn. */
export const WHEEL_THRESHOLD = 40;
/** A gap longer than this (ms) between wheel events ends one swipe (and its momentum). */
export const WHEEL_GESTURE_GAP_MS = 140;
/** Within one swipe, a new direction needs at least this long (ms) after the last turn. */
export const WHEEL_COOLDOWN_MS = 180;
/** The main axis must beat the other one by this factor, so a diagonal wobble does not turn. */
export const DOMINANCE = 1.2;

/**
 * Classify accumulated finger travel (screen coordinates, +y is down). Returns null while the
 * travel is short or too diagonal to call.
 */
export function deltaToDirection(
  dx: number,
  dy: number,
  threshold = HOVER_THRESHOLD,
  dominance = DOMINANCE,
): Direction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const major = Math.max(ax, ay);
  if (major < threshold) return null;
  if (major < Math.min(ax, ay) * dominance) return null;
  if (ax >= ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Wheel deltas to finger travel. macOS uses natural scrolling by default: fingers moving up
 * scroll the page down (deltaY > 0), so the finger moved the opposite way to the scroll.
 * Line and page delta modes are scaled to pixels.
 */
export function wheelToFinger(
  deltaX: number,
  deltaY: number,
  deltaMode = 0,
  pageHeight = 800,
): { dx: number; dy: number } {
  const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  const dx = Number.isFinite(deltaX) ? -deltaX * scale : 0;
  const dy = Number.isFinite(deltaY) ? -deltaY * scale : 0;
  return { dx: dx === 0 ? 0 : dx, dy: dy === 0 ? 0 : dy };
}

/** One-finger glide (pointer moves with no button pressed) to turns. */
export class HoverSteer {
  private ax = 0;
  private ay = 0;
  private lastT = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly threshold = HOVER_THRESHOLD,
    private readonly idleMs = HOVER_IDLE_MS,
    private readonly dominance = DOMINANCE,
  ) {}

  /** Add one move (css px, +y down) at time t (ms). Returns a direction when a turn is due. */
  feed(dx: number, dy: number, t: number): Direction | null {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(t)) return null;
    if (t - this.lastT > this.idleMs) this.reset();
    this.lastT = t;
    this.ax += dx;
    this.ay += dy;
    const dir = deltaToDirection(this.ax, this.ay, this.threshold, this.dominance);
    if (dir) {
      this.ax = 0;
      this.ay = 0;
      return dir;
    }
    // A long diagonal that never settles: start over rather than grow without limit.
    if (Math.hypot(this.ax, this.ay) > this.threshold * 3) {
      this.ax = 0;
      this.ay = 0;
    }
    return null;
  }

  reset(): void {
    this.ax = 0;
    this.ay = 0;
    this.lastT = Number.NEGATIVE_INFINITY;
  }
}

/**
 * Two-finger swipe (wheel events) to turns. Each swipe turns once; its momentum tail (more wheel
 * events the same way) is absorbed. A clear change of direction within the same stream turns
 * again after a short cooldown, so swipe-up-then-right works without waiting.
 */
export class WheelSteer {
  private ax = 0;
  private ay = 0;
  private lastT = Number.NEGATIVE_INFINITY;
  private lastEmitT = Number.NEGATIVE_INFINITY;
  private lastDir: Direction | null = null;

  constructor(
    private readonly threshold = WHEEL_THRESHOLD,
    private readonly gapMs = WHEEL_GESTURE_GAP_MS,
    private readonly cooldownMs = WHEEL_COOLDOWN_MS,
    private readonly dominance = DOMINANCE,
  ) {}

  /** Add finger travel (see wheelToFinger) at time t (ms). Returns a direction when a turn is due. */
  feed(dx: number, dy: number, t: number): Direction | null {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(t)) return null;
    if (t - this.lastT > this.gapMs) {
      this.ax = 0;
      this.ay = 0;
      this.lastDir = null;
    }
    this.lastT = t;
    this.ax += dx;
    this.ay += dy;
    const dir = deltaToDirection(this.ax, this.ay, this.threshold, this.dominance);
    if (!dir) return null;
    this.ax = 0;
    this.ay = 0;
    if (dir === this.lastDir) return null;
    if (this.lastDir !== null && t - this.lastEmitT < this.cooldownMs) return null;
    this.lastDir = dir;
    this.lastEmitT = t;
    return dir;
  }

  reset(): void {
    this.ax = 0;
    this.ay = 0;
    this.lastT = Number.NEGATIVE_INFINITY;
    this.lastEmitT = Number.NEGATIVE_INFINITY;
    this.lastDir = null;
  }
}

export interface TouchpadSteerOptions {
  /** The play surface (the canvas): pointer lock target and wheel target. */
  surface: HTMLElement;
  /** True while a round is running and not paused: only then do glides and swipes steer. */
  active: () => boolean;
  /** Turn the snake. */
  steer: (dir: Direction) => void;
  /** Elements whose hover never steers (the menu rail), so reaching for a menu is safe. */
  ignore?: readonly HTMLElement[];
}

export interface TouchpadSteer {
  /**
   * Lock the pointer to the board while playing (hides the cursor and stops it at the screen
   * edge from swallowing the glide). Call from a user gesture (click or key). No-op on touch
   * screens, when unsupported, or when the last input was not a mouse/touchpad.
   */
  lock(): void;
  /** Give the cursor back (pause, game over). */
  unlock(): void;
  dispose(): void;
}

/** True on devices with a hovering, precise pointer (laptop touchpad, Magic Trackpad, mouse). */
export function hasFinePointer(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

export function attachTouchpadSteer(opts: TouchpadSteerOptions): TouchpadSteer {
  const hover = new HoverSteer();
  const wheel = new WheelSteer();
  let last: { x: number; y: number } | null = null;
  let mouseSeen = false;

  const locked = () => document.pointerLockElement === opts.surface;
  const ignored = (target: EventTarget | null) =>
    target instanceof Node && (opts.ignore ?? []).some((el) => el.contains(target));

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    mouseSeen = true;
    const isLocked = locked();
    // Movement since the last event: movementX/Y under pointer lock (the cursor stands still),
    // otherwise the change in position.
    let dx: number;
    let dy: number;
    if (isLocked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
      last = null;
    } else {
      const prev = last;
      last = { x: e.clientX, y: e.clientY };
      if (!prev) return;
      dx = e.clientX - prev.x;
      dy = e.clientY - prev.y;
    }
    // A pressed button is a click-drag swipe: the kit's swipe handles that.
    if (e.buttons !== 0 || !opts.active() || (!isLocked && ignored(e.target))) {
      hover.reset();
      return;
    }
    const dir = hover.feed(dx, dy, e.timeStamp || performance.now());
    if (dir) opts.steer(dir);
  };

  const onWheel = (e: WheelEvent) => {
    // Pinch-zoom arrives as ctrl+wheel; menus may scroll.
    if (e.ctrlKey || !opts.active() || ignored(e.target)) {
      wheel.reset();
      return;
    }
    e.preventDefault();
    const f = wheelToFinger(e.deltaX, e.deltaY, e.deltaMode, window.innerHeight);
    const dir = wheel.feed(f.dx, f.dy, e.timeStamp || performance.now());
    if (dir) opts.steer(dir);
  };

  const onLockChange = () => {
    hover.reset();
    last = null;
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('pointerlockchange', onLockChange);

  let lockAsked = 0;
  return {
    lock() {
      if (!mouseSeen || !hasFinePointer() || locked()) return;
      const el = opts.surface as HTMLElement & { requestPointerLock?: () => unknown };
      if (typeof el.requestPointerLock !== 'function') return;
      const now = performance.now();
      if (now - lockAsked < 1200) return;
      lockAsked = now;
      try {
        const r = el.requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') {
          (r as Promise<void>).catch(() => {
            /* refused (no user gesture, or too soon after Esc): plain glides still steer */
          });
        }
      } catch {
        /* unsupported */
      }
    },
    unlock() {
      if (locked()) {
        try {
          document.exitPointerLock();
        } catch {
          /* ignore */
        }
      }
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
