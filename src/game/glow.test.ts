import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_BLOOM_PULSE,
  SNAKE_BLOOM_THRESHOLD,
  bloomPulse,
  gridLevel,
  gridOpacity,
  rimLevel,
  ringLook,
} from './glow';

describe('board glow', () => {
  it('keeps the grid below the bloom threshold for any glow, meal or not', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 10, noNaN: true }), (glow) => {
        expect(gridLevel(glow)).toBeLessThan(SNAKE_BLOOM_THRESHOLD);
        expect(gridLevel(glow)).toBeGreaterThan(0);
        expect(gridOpacity(glow)).toBeLessThanOrEqual(0.6);
      }),
    );
    expect(gridLevel(1)).toBeCloseTo(0.9, 10);
  });

  it('dims the grid while asleep or paused', () => {
    expect(gridLevel(0.5)).toBeLessThan(gridLevel(1));
    expect(gridLevel(0.75)).toBeLessThan(gridLevel(1));
  });

  it('flashes the rim on a meal', () => {
    expect(rimLevel(1, 1)).toBeGreaterThan(rimLevel(1, 0));
    expect(rimLevel(1, 5)).toBe(rimLevel(1, 1));
  });

  it('caps the bloom pulse at x1.15 and turns it off with reduced motion', () => {
    fc.assert(
      fc.property(fc.double({ min: -2, max: 5, noNaN: true }), (e) => {
        const p = bloomPulse(e, 1);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(MAX_BLOOM_PULSE + 1e-12);
        expect(bloomPulse(e, 0)).toBe(1);
      }),
    );
    expect(bloomPulse(1, 1)).toBeCloseTo(1.15, 10);
  });

  it('grows and fades the eat ring; reduced motion only fades it', () => {
    expect(ringLook(1, 1)).toEqual({ scale: 1, opacity: 0.85 });
    expect(ringLook(0, 1).opacity).toBe(0);
    expect(ringLook(0.5, 1).scale).toBeGreaterThan(1);
    expect(ringLook(0.5, 0).scale).toBe(1);
    expect(ringLook(0.5, 0).opacity).toBeGreaterThan(0);
  });
});
