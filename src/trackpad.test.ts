import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DOMINANCE,
  HOVER_IDLE_MS,
  HOVER_THRESHOLD,
  HoverSteer,
  WHEEL_COOLDOWN_MS,
  WHEEL_GESTURE_GAP_MS,
  WHEEL_THRESHOLD,
  WheelSteer,
  deltaToDirection,
  wheelToFinger,
} from './trackpad';
import { GameController } from './controller';
import { createRng } from './kit/prng';
import { oppositeDirection, type Direction } from './kit/input';

/** Feed a glide as small moves 8 ms apart; returns every direction it produced. */
function glide(h: HoverSteer, dx: number, dy: number, parts = 8, t0 = 0): Direction[] {
  const out: Direction[] = [];
  for (let i = 0; i < parts; i++) {
    const d = h.feed(dx / parts, dy / parts, t0 + i * 8);
    if (d) out.push(d);
  }
  return out;
}

describe('deltaToDirection', () => {
  it('maps the dominant axis (screen coordinates, +y down)', () => {
    expect(deltaToDirection(30, 2)).toBe('right');
    expect(deltaToDirection(-30, 2)).toBe('left');
    expect(deltaToDirection(3, 30)).toBe('down');
    expect(deltaToDirection(3, -30)).toBe('up');
  });

  it('waits for short or too-diagonal travel', () => {
    expect(deltaToDirection(HOVER_THRESHOLD - 1, 0)).toBeNull();
    expect(deltaToDirection(30, 29)).toBeNull();
    expect(deltaToDirection(Number.NaN, 40)).toBeNull();
    expect(deltaToDirection(40, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('never answers against the dominant axis', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500 }),
        fc.double({ min: -500, max: 500 }),
        (dx, dy) => {
          const d = deltaToDirection(dx, dy);
          if (d === null) return;
          const major = Math.max(Math.abs(dx), Math.abs(dy));
          expect(major).toBeGreaterThanOrEqual(HOVER_THRESHOLD);
          expect(major).toBeGreaterThanOrEqual(Math.min(Math.abs(dx), Math.abs(dy)) * DOMINANCE);
          if (d === 'left') expect(dx).toBeLessThan(0);
          if (d === 'right') expect(dx).toBeGreaterThan(0);
          if (d === 'up') expect(dy).toBeLessThan(0);
          if (d === 'down') expect(dy).toBeGreaterThan(0);
        },
      ),
    );
  });
});

describe('wheelToFinger', () => {
  it('follows natural scrolling: fingers up scroll down (deltaY > 0)', () => {
    expect(wheelToFinger(0, 50)).toEqual({ dx: 0, dy: -50 });
    expect(wheelToFinger(50, 0)).toEqual({ dx: -50, dy: 0 });
  });

  it('scales line and page modes to pixels and drops bad numbers', () => {
    expect(wheelToFinger(0, 3, 1)).toEqual({ dx: 0, dy: -48 });
    expect(wheelToFinger(0, 1, 2, 600)).toEqual({ dx: 0, dy: -600 });
    expect(wheelToFinger(Number.NaN, 5)).toEqual({ dx: 0, dy: -5 });
  });
});

describe('HoverSteer (one-finger glide, no click)', () => {
  it('turns once the glide passes the threshold, then starts over', () => {
    const h = new HoverSteer();
    expect(glide(h, -30, 2)).toEqual(['left']);
    expect(glide(h, 0, -30, 8, 100)).toEqual(['up']);
  });

  it('a long glide repeats the same direction (the rules ignore repeats)', () => {
    const h = new HoverSteer();
    expect(glide(h, 100, 0, 20)).toEqual(['right', 'right', 'right', 'right']);
  });

  it('forgets slow drift after an idle pause', () => {
    const h = new HoverSteer();
    expect(h.feed(15, 0, 0)).toBeNull();
    expect(h.feed(15, 0, HOVER_IDLE_MS + 50)).toBeNull();
    expect(h.feed(15, 0, HOVER_IDLE_MS + 60)).toBe('right');
  });

  it('a wobbly diagonal does not turn and does not pile up', () => {
    const h = new HoverSteer();
    for (let i = 0; i < 40; i++) expect(h.feed(5, 5, i * 8)).toBeNull();
    expect(h.feed(30, 0, 40 * 8)).toBe('right');
  });

  it('ignores bad numbers', () => {
    const h = new HoverSteer();
    expect(h.feed(Number.NaN, 0, 0)).toBeNull();
    expect(h.feed(40, 0, Number.NaN)).toBeNull();
  });
});

describe('WheelSteer (two-finger swipe)', () => {
  it('turns once per swipe and absorbs the momentum tail', () => {
    const w = new WheelSteer();
    const out: Direction[] = [];
    // Finger up for 10 events, then 40 decaying momentum events, 16 ms apart.
    for (let i = 0; i < 50; i++) {
      const d = w.feed(0, i < 10 ? -12 : -12 * Math.pow(0.93, i - 10), i * 16);
      if (d) out.push(d);
    }
    expect(out).toEqual(['up']);
  });

  it('a new swipe after a gap turns again, even the same way', () => {
    const w = new WheelSteer();
    expect(w.feed(0, -WHEEL_THRESHOLD, 0)).toBe('up');
    expect(w.feed(0, -WHEEL_THRESHOLD, WHEEL_GESTURE_GAP_MS + 1)).toBe('up');
  });

  it('a clear change of direction within the stream turns after the cooldown', () => {
    const w = new WheelSteer();
    expect(w.feed(0, -WHEEL_THRESHOLD, 0)).toBe('up');
    expect(w.feed(WHEEL_THRESHOLD, 0, 50)).toBeNull();
    expect(w.feed(WHEEL_THRESHOLD, 0, WHEEL_COOLDOWN_MS + 10)).toBe('right');
  });

  it('small scrolls do not turn', () => {
    const w = new WheelSteer();
    expect(w.feed(0, -(WHEEL_THRESHOLD - 1), 0)).toBeNull();
  });
});

describe('glides drive the game rules', () => {
  const GLIDE: Record<Direction, [number, number]> = {
    up: [0, -40],
    down: [0, 40],
    left: [-40, 0],
    right: [40, 0],
  };

  it('steers a running round and never turns the snake back into its neck', () => {
    const c = new GameController(createRng(7), 'easy');
    c.primary();
    expect(c.state.phase).toBe('playing');
    const h = new HoverSteer();
    const start = c.state.dir;
    for (const d of glide(h, ...GLIDE[oppositeDirection(start)])) c.steer(d);
    expect(c.state.queued).toEqual([]);
    const side: Direction = start === 'up' || start === 'down' ? 'left' : 'up';
    for (const d of glide(h, ...GLIDE[side], 8, 500)) c.steer(d);
    expect(c.state.queued).toEqual([side]);
  });
});
