import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CORNER_RADIUS, Spine, TIP_RADIUS, polylineLength, tailRadius } from './spine';

const SPACING = 0.2;

function flat(cells: Array<[number, number]>): number[] {
  return cells.flatMap(([x, z]) => [x, z]);
}

describe('Spine', () => {
  it('samples a straight line evenly, end to end', () => {
    const sp = new Spine(8, SPACING);
    sp.build(flat([[0, 0], [1, 0], [2, 0], [3, 0]]), 4);
    expect(sp.length).toBeCloseTo(3, 5);
    expect(sp.x[0]).toBeCloseTo(0);
    expect(sp.x[sp.count - 1]).toBeCloseTo(3);
    for (let i = 1; i < sp.count - 1; i++) {
      expect((sp.s[i] as number) - (sp.s[i - 1] as number)).toBeCloseTo(SPACING, 5);
      expect(sp.tx[i]).toBeCloseTo(1);
      expect(sp.tz[i]).toBeCloseTo(0);
    }
  });

  it('rounds a corner: shorter than the polyline by the corner cut', () => {
    const sp = new Spine(8, SPACING);
    const pts = flat([[0, 0], [1, 0], [1, 1]]);
    sp.build(pts, 3);
    const poly = polylineLength(pts, 3);
    expect(sp.length).toBeLessThan(poly);
    // A quarter turn of radius r replaces 2r of straight line with about (pi / 2) r.
    expect(sp.length).toBeCloseTo(poly - 2 * CORNER_RADIUS + (Math.PI / 2) * CORNER_RADIUS, 1);
    // The tangent turns from +x to +z.
    expect(sp.tx[0]).toBeCloseTo(1);
    expect(sp.tz[sp.count - 1]).toBeCloseTo(1);
  });

  it('skips repeated points and handles a single point', () => {
    const sp = new Spine(8, SPACING);
    sp.build(flat([[2, 2], [2, 2], [2, 2]]), 3);
    expect(sp.count).toBe(1);
    expect(sp.length).toBe(0);
    sp.build([], 0);
    expect(sp.count).toBe(0);
  });

  it('adds tip rings that crowd toward the tail end', () => {
    const tip = { length: 0.1, samples: 6 };
    const sp = new Spine(8, SPACING, tip);
    sp.build(flat([[0, 0], [1, 0], [2, 0], [3, 0]]), 4);
    expect(sp.length).toBeCloseTo(3, 5);
    expect(sp.s[sp.count - 1]).toBeCloseTo(3, 5);
    expect(sp.x[sp.count - 1]).toBeCloseTo(3);
    // Six rings inside the tip region, plus the exact end point.
    const inTip: number[] = [];
    for (let i = 0; i < sp.count; i++) {
      if ((sp.s[i] as number) >= 3 - tip.length - 1e-6) inTip.push(sp.s[i] as number);
    }
    expect(inTip.length).toBe(tip.samples + 1);
    // Gaps shrink toward the tip.
    for (let i = 2; i < inTip.length; i++) {
      const prev = (inTip[i - 1] as number) - (inTip[i - 2] as number);
      const gap = (inTip[i] as number) - (inTip[i - 1] as number);
      expect(gap).toBeLessThanOrEqual(prev + 1e-6);
    }
    // No regular sample bunches up against the tip region.
    const before = sp.s[sp.count - 1 - inTip.length] as number;
    expect((inTip[0] as number) - before).toBeGreaterThan(SPACING * 0.2);
  });

  it('handles a path shorter than the tip region', () => {
    const sp = new Spine(4, SPACING, { length: 0.5, samples: 5 });
    sp.build(flat([[0, 0], [0.3, 0]]), 2);
    expect(sp.s[0]).toBe(0);
    expect(sp.s[sp.count - 1]).toBeCloseTo(0.3, 5);
    for (let i = 1; i < sp.count; i++) {
      expect(sp.s[i] as number).toBeGreaterThan(sp.s[i - 1] as number);
    }
  });

  it('keeps tip rings inside the buffers on any grid walk (property)', () => {
    const step = fc.constantFrom<[number, number]>([1, 0], [-1, 0], [0, 1], [0, -1]);
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 30 }), (steps) => {
        const cells: Array<[number, number]> = [[0, 0]];
        for (const [sx, sz] of steps) {
          const [lx, lz] = cells[cells.length - 1] as [number, number];
          cells.push([lx + sx, lz + sz]);
        }
        const sp = new Spine(cells.length, SPACING, { length: TIP_RADIUS, samples: 6 });
        sp.build(flat(cells), cells.length);
        expect(sp.count).toBeLessThanOrEqual(sp.maxSamples);
        expect(sp.s[sp.count - 1]).toBeCloseTo(sp.length, 5);
        for (let i = 1; i < sp.count; i++) {
          expect(sp.s[i] as number).toBeGreaterThan(sp.s[i - 1] as number);
        }
      }),
    );
  });

  it('stays within the buffers and keeps unit tangents on any grid walk (property)', () => {
    const step = fc.constantFrom<[number, number]>([1, 0], [-1, 0], [0, 1], [0, -1]);
    const walk = fc.array(step, { minLength: 1, maxLength: 40 });
    const headArb = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(walk, headArb, (steps, head) => {
        const cells: Array<[number, number]> = [[0, 0]];
        for (const [sx, sz] of steps) {
          const [lx, lz] = cells[cells.length - 1] as [number, number];
          cells.push([lx + sx, lz + sz]);
        }
        // A partial first segment, like the gliding head.
        const [ax, az] = cells[0] as [number, number];
        const [bx, bz] = cells[1] as [number, number];
        cells[0] = [bx + (ax - bx) * head, bz + (az - bz) * head];
        const pts = flat(cells);
        const sp = new Spine(cells.length, SPACING);
        sp.build(pts, cells.length);
        expect(sp.count).toBeGreaterThanOrEqual(1);
        expect(sp.count).toBeLessThanOrEqual(sp.maxSamples);
        expect(sp.length).toBeLessThanOrEqual(polylineLength(pts, cells.length) + 1e-4);
        for (let i = 0; i < sp.count; i++) {
          expect(Number.isFinite(sp.x[i])).toBe(true);
          expect(Math.hypot(sp.tx[i] as number, sp.tz[i] as number)).toBeCloseTo(1, 4);
          if (i > 0) expect(sp.s[i] as number).toBeGreaterThanOrEqual(sp.s[i - 1] as number);
        }
      }),
    );
  });
});

describe('tailRadius', () => {
  const RB = 0.24;
  const TAPER = 1.6;

  it('closes to a point at the tip and reaches the body radius after the taper', () => {
    expect(tailRadius(RB, 0, TAPER)).toBe(0);
    expect(tailRadius(RB, TIP_RADIUS, TAPER)).toBeCloseTo(TIP_RADIUS, 6);
    expect(tailRadius(RB, TIP_RADIUS + TAPER, TAPER)).toBeCloseTo(RB, 6);
    expect(tailRadius(RB, 10, TAPER)).toBeCloseTo(RB, 6);
  });

  it('ends in a half sphere, not a wedge', () => {
    // On a half sphere of radius R, r^2 + (R - d)^2 = R^2.
    for (const d of [0.01, 0.03, 0.05, 0.08]) {
      const r = tailRadius(RB, d, TAPER);
      expect(r * r + (TIP_RADIUS - d) ** 2).toBeCloseTo(TIP_RADIUS * TIP_RADIUS, 8);
    }
  });

  it('never shrinks as you move away from the tip (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 4, noNaN: true }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(tailRadius(RB, hi, TAPER)).toBeGreaterThanOrEqual(tailRadius(RB, lo, TAPER) - 1e-9);
        },
      ),
    );
  });
});
