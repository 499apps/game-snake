import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CLIP_LEVEL, analysePixels } from './pixels';

/** RGBA buffer of w x h filled by a colour function (row 0 at the top). */
function image(w: number, h: number, colour: (x: number, y: number) => [number, number, number]) {
  const buf = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colour(x, y);
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

describe('analysePixels', () => {
  it('counts pixels with min(R, G, B) >= 240 as clipped', () => {
    // Left half white, right half deep indigo.
    const buf = image(10, 10, (x) => (x < 5 ? [255, 255, 255] : [27, 23, 64]));
    const s = analysePixels(buf, 10, 10, { step: 1 });
    expect(s.total).toBe(100);
    expect(s.clipped).toBeCloseTo(0.5, 10);
    expect(s.distinct).toBe(2);
    expect(s.nonBackground).toBe(50);
  });

  it('does not count a bright saturated colour as clipped', () => {
    const buf = image(4, 4, () => [255, 240, 120]);
    expect(analysePixels(buf, 4, 4, { step: 1 }).clipped).toBe(0);
    const edge = image(4, 4, () => [CLIP_LEVEL, CLIP_LEVEL, CLIP_LEVEL]);
    expect(analysePixels(edge, 4, 4, { step: 1 }).clipped).toBe(1);
    const below = image(4, 4, () => [CLIP_LEVEL - 1, 255, 255]);
    expect(analysePixels(below, 4, 4, { step: 1 }).clipped).toBe(0);
  });

  it('leaves the excluded rectangle out of the clip share (top-left origin)', () => {
    // Top half white paper, bottom half dark.
    const buf = image(10, 10, (_x, y) => (y < 5 ? [255, 255, 255] : [20, 20, 40]));
    const paper = { x: 0, y: 0, w: 1, h: 0.5 };
    expect(analysePixels(buf, 10, 10, { step: 1 }).clipped).toBeCloseTo(0.5, 10);
    expect(analysePixels(buf, 10, 10, { step: 1, excludeClip: paper }).clipped).toBe(0);
  });

  it('flips rows for gl.readPixels buffers (row 0 at the bottom)', () => {
    // In readPixels order the white rows come first, so they are the bottom of the screen.
    const buf = image(10, 10, (_x, y) => (y < 5 ? [255, 255, 255] : [20, 20, 40]));
    const topHalf = { x: 0, y: 0, w: 1, h: 0.5 };
    const bottomHalf = { x: 0, y: 0.5, w: 1, h: 0.5 };
    expect(analysePixels(buf, 10, 10, { step: 1, flipY: true, excludeClip: topHalf }).clipped).toBe(1);
    expect(analysePixels(buf, 10, 10, { step: 1, flipY: true, excludeClip: bottomHalf }).clipped).toBe(0);
  });

  it('keeps the share in 0..1 for any image and step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 5 }),
        fc.uint8Array({ minLength: 12 * 12 * 4, maxLength: 12 * 12 * 4 }),
        (w, h, step, data) => {
          const s = analysePixels(data.subarray(0, w * h * 4), w, h, { step });
          expect(s.clipped).toBeGreaterThanOrEqual(0);
          expect(s.clipped).toBeLessThanOrEqual(1);
          expect(s.nonBackground).toBeGreaterThanOrEqual(0);
          expect(s.nonBackground).toBeLessThan(s.total);
        },
      ),
    );
  });

  it('reports 0 when every sampled pixel is excluded', () => {
    const buf = image(4, 4, () => [255, 255, 255]);
    expect(analysePixels(buf, 4, 4, { step: 1, excludeClip: { x: 0, y: 0, w: 1, h: 1 } }).clipped).toBe(0);
  });
});
