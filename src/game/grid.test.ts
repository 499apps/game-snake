import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIRECTIONS, oppositeDirection } from '../kit/input';
import { inBounds, stepCell, turn } from './grid';

const dir = fc.constantFrom(...DIRECTIONS);

describe('turn', () => {
  it('never reverses straight back (property)', () => {
    fc.assert(
      fc.property(dir, dir, (current, requested) => {
        const next = turn(current, requested);
        expect(next).not.toBe(oppositeDirection(current));
        if (requested !== oppositeDirection(current)) expect(next).toBe(requested);
      }),
    );
  });
});

describe('stepCell', () => {
  it('stays on the board and moves exactly one cell, with wrap (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), fc.nat(), fc.nat(), dir, (size, a, b, d) => {
        const cell = { x: a % size, y: b % size };
        const next = stepCell(cell, d, size);
        expect(inBounds(next, size)).toBe(true);
        const dx = Math.min(Math.abs(next.x - cell.x), size - Math.abs(next.x - cell.x));
        const dy = Math.min(Math.abs(next.y - cell.y), size - Math.abs(next.y - cell.y));
        expect(dx + dy).toBe(1);
      }),
    );
  });

  it('wraps at the edges', () => {
    expect(stepCell({ x: 0, y: 3 }, 'left', 9)).toEqual({ x: 8, y: 3 });
    expect(stepCell({ x: 8, y: 3 }, 'right', 9)).toEqual({ x: 0, y: 3 });
    expect(stepCell({ x: 2, y: 0 }, 'up', 9)).toEqual({ x: 2, y: 8 });
  });

  it('round-trips with the opposite direction (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), fc.nat(), fc.nat(), dir, (size, a, b, d) => {
        const cell = { x: a % size, y: b % size };
        expect(stepCell(stepCell(cell, d, size), oppositeDirection(d), size)).toEqual(cell);
      }),
    );
  });
});
