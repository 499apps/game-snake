/**
 * Pixel statistics for test read-back (blank check and the "look" gate). Pure, unit tested.
 */

/** A pixel counts as clipped when its darkest channel is at or above this value (0..255). */
export const CLIP_LEVEL = 240;

/** Rectangle in 0..1 canvas coordinates, origin top-left. */
export interface SampleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SampleOptions {
  step?: number;
  /** Pixels inside this rectangle do not count for `clipped` (for example white paper). */
  excludeClip?: SampleRect | null;
  /** True when row 0 of the buffer is the bottom row, as gl.readPixels returns it. */
  flipY?: boolean;
}

export interface PixelSample {
  total: number;
  distinct: number;
  nonBackground: number;
  /** Share (0..1) of counted pixels with min(R, G, B) >= CLIP_LEVEL: blown-out white. */
  clipped: number;
}

export function analysePixels(
  buf: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  opts: SampleOptions = {},
): PixelSample {
  const counts = new Map<number, number>();
  let total = 0;
  let clipCounted = 0;
  let clipHits = 0;
  const s = Math.max(1, Math.floor(opts.step ?? 8));
  const ex = opts.excludeClip ?? null;
  for (let y = 0; y < h; y += s) {
    const vy = (opts.flipY ? h - 1 - y : y) / h;
    for (let x = 0; x < w; x += s) {
      const i = (y * w + x) * 4;
      const r = buf[i] as number;
      const g = buf[i + 1] as number;
      const b = buf[i + 2] as number;
      const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      counts.set(q, (counts.get(q) ?? 0) + 1);
      total++;
      const vx = x / w;
      if (ex && vx >= ex.x && vx < ex.x + ex.w && vy >= ex.y && vy < ex.y + ex.h) continue;
      clipCounted++;
      if (Math.min(r, g, b) >= CLIP_LEVEL) clipHits++;
    }
  }
  let mode = 0;
  for (const c of counts.values()) if (c > mode) mode = c;
  return {
    total,
    distinct: counts.size,
    nonBackground: total - mode,
    clipped: clipCounted > 0 ? clipHits / clipCounted : 0,
  };
}
