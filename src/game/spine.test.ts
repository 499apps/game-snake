import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CORNER_RADIUS, Spine, polylineLength } from './spine';

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
