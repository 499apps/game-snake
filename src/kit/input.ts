/**
 * Input: keyboard, touch (tap + swipe), pointer and gamepad, all mapped to a small set of
 * actions. The mapping functions are pure so they can be unit tested; InputManager wires
 * them to the DOM.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Action = Direction | 'primary' | 'secondary' | 'pause' | 'menu' | 'mute';
export type InputSource = 'keyboard' | 'touch' | 'pointer' | 'gamepad' | 'ui';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const KEY_MAP: Readonly<Record<string, Action>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'primary',
  Enter: 'primary',
  KeyX: 'secondary',
  ShiftLeft: 'secondary',
  ShiftRight: 'secondary',
  KeyP: 'pause',
  Escape: 'menu',
  KeyM: 'mute',
};

/** Standard gamepad mapping: face buttons, start/select and the d-pad. */
export const GAMEPAD_BUTTON_MAP: Readonly<Record<number, Action>> = {
  0: 'primary',
  1: 'secondary',
  8: 'menu',
  9: 'pause',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

export function isDirection(a: Action | null | undefined): a is Direction {
  return a === 'up' || a === 'down' || a === 'left' || a === 'right';
}

export function keyToAction(code: string): Action | null {
  if (!Object.prototype.hasOwnProperty.call(KEY_MAP, code)) return null;
  return KEY_MAP[code] ?? null;
}

export function oppositeDirection(d: Direction): Direction {
  switch (d) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

export function directionVector(d: Direction): { x: number; y: number } {
  switch (d) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

/**
 * Classify a swipe. Screen coordinates: +y is down. Returns null for short moves.
 * Ties (|dx| == |dy|) resolve to the horizontal axis.
 */
export function swipeToDirection(dx: number, dy: number, minDistance = 24): Direction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < minDistance) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Classify an analog stick position; +y is down (standard gamepad axes). */
export function axesToDirection(x: number, y: number, deadzone = 0.5): Direction | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.hypot(x, y) < deadzone) return null;
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

/**
 * Map raw gamepad state to the set of actions currently held (no duplicates, stable order).
 */
export function gamepadToActions(
  axes: readonly number[],
  pressed: readonly boolean[],
  deadzone = 0.5,
): Action[] {
  const out: Action[] = [];
  const add = (a: Action | null) => {
    if (a && !out.includes(a)) out.push(a);
  };
  add(axesToDirection(axes[0] ?? 0, axes[1] ?? 0, deadzone));
  for (let i = 0; i < pressed.length; i++) {
    if (pressed[i]) add(GAMEPAD_BUTTON_MAP[i] ?? null);
  }
  return out;
}

export type ActionHandler = (action: Action, source: InputSource) => void;

export interface InputOptions {
  /** Element that receives pointer/touch gestures (the play surface). */
  element: HTMLElement;
  /** Keyboard target. Defaults to window. */
  keyboardTarget?: EventTarget;
  swipeMinDistance?: number;
  tapMaxDistance?: number;
  tapMaxMs?: number;
  gamepadDeadzone?: number;
  /** Call preventDefault on handled key events (default true). */
  preventDefault?: boolean;
}

interface PointerTrack {
  id: number;
  x: number;
  y: number;
  t: number;
  source: InputSource;
}

/**
 * Wires DOM and Gamepad input to action handlers. Call update() once per frame to poll
 * gamepads. Call dispose() on page exit.
 */
export class InputManager {
  private readonly handlers = new Set<ActionHandler>();
  private readonly opts: Required<Omit<InputOptions, 'keyboardTarget'>> & {
    keyboardTarget: EventTarget;
  };
  private track: PointerTrack | null = null;
  private lastPointerPos: { x: number; y: number } | null = null;
  private heldGamepad = new Set<Action>();
  private disposed = false;

  constructor(options: InputOptions) {
    this.opts = {
      element: options.element,
      keyboardTarget: options.keyboardTarget ?? window,
      swipeMinDistance: options.swipeMinDistance ?? 24,
      tapMaxDistance: options.tapMaxDistance ?? 12,
      tapMaxMs: options.tapMaxMs ?? 400,
      gamepadDeadzone: options.gamepadDeadzone ?? 0.5,
      preventDefault: options.preventDefault ?? true,
    };
    const el = this.opts.element;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('contextmenu', this.onContextMenu);
    this.opts.keyboardTarget.addEventListener('keydown', this.onKeyDown as EventListener);
  }

  /** Last known pointer position in element coordinates (css px). */
  get pointer(): { x: number; y: number } | null {
    return this.lastPointerPos;
  }

  on(handler: ActionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Emit an action from UI code (on-screen buttons). */
  emit(action: Action, source: InputSource = 'ui'): void {
    for (const h of this.handlers) h(action, source);
  }

  /** Poll gamepads. Emits each action once per press (edge triggered). */
  update(): void {
    if (this.disposed || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pads: (Gamepad | null)[] = [];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      return;
    }
    const held = new Set<Action>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const pressed = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      for (const a of gamepadToActions(pad.axes, pressed, this.opts.gamepadDeadzone)) held.add(a);
    }
    for (const a of held) {
      if (!this.heldGamepad.has(a)) this.emit(a, 'gamepad');
    }
    this.heldGamepad = held;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const el = this.opts.element;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    this.opts.keyboardTarget.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.handlers.clear();
  }

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.opts.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    const p = this.toLocal(e);
    this.lastPointerPos = p;
    this.track = {
      id: e.pointerId,
      x: p.x,
      y: p.y,
      t: performance.now(),
      source: e.pointerType === 'touch' ? 'touch' : 'pointer',
    };
    try {
      this.opts.element.setPointerCapture(e.pointerId);
    } catch {
      /* capture not supported */
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const p = this.toLocal(e);
    this.lastPointerPos = p;
    const t = this.track;
    if (!t || t.id !== e.pointerId) return;
    // Early swipe: fire as soon as the finger travels far enough, feels snappier.
    const dir = swipeToDirection(p.x - t.x, p.y - t.y, this.opts.swipeMinDistance);
    if (dir) {
      this.track = null;
      this.releaseCapture(e.pointerId);
      this.emit(dir, t.source);
    }
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const t = this.track;
    this.releaseCapture(e.pointerId);
    if (!t || t.id !== e.pointerId) return;
    this.track = null;
    const p = this.toLocal(e);
    const dist = Math.hypot(p.x - t.x, p.y - t.y);
    const dt = performance.now() - t.t;
    const dir = swipeToDirection(p.x - t.x, p.y - t.y, this.opts.swipeMinDistance);
    if (dir) {
      this.emit(dir, t.source);
    } else if (dist <= this.opts.tapMaxDistance && dt <= this.opts.tapMaxMs) {
      this.emit('primary', t.source);
    }
  };

  private readonly onPointerCancel = (e: PointerEvent) => {
    this.releaseCapture(e.pointerId);
    this.track = null;
  };

  private releaseCapture(id: number): void {
    try {
      if (this.opts.element.hasPointerCapture(id)) this.opts.element.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const action = keyToAction(e.code);
    if (!action) return;
    // Let Enter/Space activate focused buttons and links normally.
    if (
      action === 'primary' &&
      target &&
      (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SUMMARY')
    ) {
      return;
    }
    if (this.opts.preventDefault) e.preventDefault();
    this.emit(action, 'keyboard');
  };
}
