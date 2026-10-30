import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DIRECTIONS,
  GAMEPAD_BUTTON_MAP,
  KEY_MAP,
  axesToDirection,
  directionVector,
  gamepadToActions,
  keyToAction,
  oppositeDirection,
  swipeToDirection,
} from './input';

describe('keyToAction', () => {
  it('maps arrows and WASD to directions', () => {
    expect(keyToAction('ArrowUp')).toBe('up');
    expect(keyToAction('KeyW')).toBe('up');
    expect(keyToAction('ArrowLeft')).toBe('left');
    expect(keyToAction('KeyD')).toBe('right');
    expect(keyToAction('Space')).toBe('primary');
    expect(keyToAction('Escape')).toBe('menu');
    expect(keyToAction('KeyM')).toBe('mute');
  });

  it('returns null for unmapped keys', () => {
    fc.assert(
      fc.property(fc.string(), (code) => {
        const expected = Object.prototype.hasOwnProperty.call(KEY_MAP, code) ? KEY_MAP[code] : null;
        expect(keyToAction(code)).toBe(expected ?? null);
      }),
    );
  });
});

describe('swipeToDirection', () => {
  it('ignores short moves', () => {
    fc.assert(
      fc.property(fc.double({ min: -20, max: 20, noNaN: true }), fc.double({ min: -20, max: 20, noNaN: true }), (dx, dy) => {
        fc.pre(Math.hypot(dx, dy) < 24);
        expect(swipeToDirection(dx, dy, 24)).toBeNull();
      }),
    );
  });

  it('picks the dominant axis', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (dx, dy) => {
          fc.pre(Math.hypot(dx, dy) >= 24);
          const d = swipeToDirection(dx, dy, 24);
          if (Math.abs(dx) >= Math.abs(dy)) {
            expect(d).toBe(dx > 0 ? 'right' : 'left');
          } else {
            expect(d).toBe(dy > 0 ? 'down' : 'up');
          }
        },
      ),
    );
  });

  it('is symmetric: reversing the swipe reverses the direction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500, max: 500, noNaN: true }),
        fc.double({ min: -500, max: 500, noNaN: true }),
        (dx, dy) => {
          fc.pre(Math.hypot(dx, dy) >= 24 && dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy));
          const a = swipeToDirection(dx, dy);
          const b = swipeToDirection(-dx, -dy);
          expect(a).not.toBeNull();
          expect(b).toBe(oppositeDirection(a as NonNullable<typeof a>));
        },
      ),
    );
  });

  it('rejects non-finite input', () => {
    expect(swipeToDirection(Number.NaN, 10)).toBeNull();
    expect(swipeToDirection(Number.POSITIVE_INFINITY, 0)).toBeNull();
  });
});

describe('directions', () => {
  it('opposite is an involution', () => {
    for (const d of DIRECTIONS) expect(oppositeDirection(oppositeDirection(d))).toBe(d);
  });
  it('vectors are unit axis vectors and opposites negate', () => {
    for (const d of DIRECTIONS) {
      const v = directionVector(d);
      const o = directionVector(oppositeDirection(d));
      expect(Math.abs(v.x) + Math.abs(v.y)).toBe(1);
      expect(o).toEqual({ x: 0 - v.x, y: 0 - v.y });
    }
  });
});

describe('gamepad mapping', () => {
  it('applies the deadzone to the stick', () => {
    expect(axesToDirection(0.2, 0.2)).toBeNull();
    expect(axesToDirection(0.9, 0)).toBe('right');
    expect(axesToDirection(0, -0.9)).toBe('up');
  });

  it('merges stick and buttons without duplicates', () => {
    const pressed: boolean[] = [];
    pressed[0] = true;
    pressed[12] = true;
    const actions = gamepadToActions([0, -1], pressed);
    expect(actions).toEqual(['up', 'primary']);
  });

  it('never returns duplicates and only known actions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { maxLength: 4 }),
        fc.array(fc.boolean(), { maxLength: 17 }),
        (axes, pressed) => {
          const actions = gamepadToActions(axes, pressed);
          expect(new Set(actions).size).toBe(actions.length);
          const known = new Set([...Object.values(GAMEPAD_BUTTON_MAP), ...DIRECTIONS]);
          for (const a of actions) expect(known.has(a)).toBe(true);
        },
      ),
    );
  });
});
