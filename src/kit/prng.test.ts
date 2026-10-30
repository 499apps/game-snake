import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng, hashSeed } from './prng';

describe('createRng', () => {
  it('replays identically for the same seed', () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string()), fc.integer({ min: 1, max: 200 }), (seed, n) => {
        const a = createRng(seed);
        const b = createRng(seed);
        for (let i = 0; i < n; i++) {
          expect(a.next()).toBe(b.next());
        }
        expect(a.state()).toBe(b.state());
      }),
    );
  });

  it('produces floats in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 100; i++) {
          const v = rng.next();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }),
    );
  });

  it('int(min, max) stays inside the inclusive range in any order', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (seed, a, b) => {
          const rng = createRng(seed);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          for (let i = 0; i < 50; i++) {
            const v = rng.int(a, b);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(lo);
            expect(v).toBeLessThanOrEqual(hi);
          }
        },
      ),
    );
  });

  it('different seeds give different streams', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 8 }, () => a.next());
    const sb = Array.from({ length: 8 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('shuffle keeps the same multiset and does not mutate the input', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.integer()), (seed, list) => {
        const copy = list.slice();
        const out = createRng(seed).shuffle(list);
        expect(list).toEqual(copy);
        expect(out.slice().sort((x, y) => x - y)).toEqual(copy.slice().sort((x, y) => x - y));
      }),
    );
  });

  it('pick returns a member and throws on empty', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.string(), { minLength: 1 }), (seed, list) => {
        expect(list).toContain(createRng(seed).pick(list));
      }),
    );
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('continuing from state() reproduces the stream', () => {
    const a = createRng('level-3');
    for (let i = 0; i < 10; i++) a.next();
    const resumed = createRng(a.state());
    // createRng(state) hashes a number to itself, so the next outputs line up.
    expect(resumed.next()).toBe(a.next());
  });

  it('hashSeed is stable and unsigned', () => {
    expect(hashSeed('snake')).toBe(hashSeed('snake'));
    expect(hashSeed(-5)).toBeGreaterThanOrEqual(0);
    expect(hashSeed(Number.NaN)).toBe(1);
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});
