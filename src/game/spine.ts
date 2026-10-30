/**
 * Snake spine (pure, allocation-free per frame). Takes the body path as a polyline through cell
 * centres (head first, board units on the x/z plane), rounds every corner with a quarter curve
 * and resamples it at an even spacing. The tube mesh puts one ring on each sample.
 */

/** Corner radius in cells: 0.5 gives the softest turn that still passes through every cell. */
export const CORNER_RADIUS = 0.5;
/** Pieces per rounded corner in the dense path. */
const CORNER_PIECES = 8;

export class Spine {
  /** Sample positions and unit tangents (pointing from the head toward the tail). */
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly tx: Float32Array;
  readonly tz: Float32Array;
  /** Arc length of each sample from the head. */
  readonly s: Float32Array;
  /** Samples in use. */
  count = 0;
  /** Total arc length of the path. */
  length = 0;
  readonly spacing: number;
  readonly maxSamples: number;

  private readonly px: Float32Array;
  private readonly pz: Float32Array;
  private readonly dx: Float32Array;
  private readonly dz: Float32Array;
  private dense = 0;

  /**
   * @param maxPoints most polyline points build() will receive
   * @param spacing distance between samples (cells)
   */
  constructor(maxPoints: number, spacing: number) {
    this.spacing = spacing;
    this.maxSamples = Math.ceil(maxPoints / spacing) + 2;
    this.x = new Float32Array(this.maxSamples);
    this.z = new Float32Array(this.maxSamples);
    this.tx = new Float32Array(this.maxSamples);
    this.tz = new Float32Array(this.maxSamples);
    this.s = new Float32Array(this.maxSamples);
    this.px = new Float32Array(maxPoints);
    this.pz = new Float32Array(maxPoints);
    const denseMax = maxPoints * (CORNER_PIECES + 2) + 2;
    this.dx = new Float32Array(denseMax);
    this.dz = new Float32Array(denseMax);
  }

  private pushDense(x: number, z: number): void {
    const n = this.dense;
    if (n >= this.dx.length) return;
    if (n > 0) {
      const ddx = x - (this.dx[n - 1] as number);
      const ddz = z - (this.dz[n - 1] as number);
      if (ddx * ddx + ddz * ddz < 1e-10) return;
    }
    this.dx[n] = x;
    this.dz[n] = z;
    this.dense = n + 1;
  }

  /**
   * Build from `n` points stored as [x0, z0, x1, z1, ...]. Points closer than 1e-4 to the previous
   * one are skipped. With fewer than two distinct points the spine holds one sample.
   */
  build(points: ArrayLike<number>, n: number): void {
    // 1. Copy distinct points.
    let m = 0;
    const cap = Math.min(n, this.px.length);
    for (let i = 0; i < cap; i++) {
      const x = points[i * 2] as number;
      const z = points[i * 2 + 1] as number;
      if (m > 0) {
        const ddx = x - (this.px[m - 1] as number);
        const ddz = z - (this.pz[m - 1] as number);
        if (ddx * ddx + ddz * ddz < 1e-8) continue;
      }
      this.px[m] = x;
      this.pz[m] = z;
      m++;
    }

    // 2. Dense path with rounded corners.
    this.dense = 0;
    if (m === 0) {
      this.count = 0;
      this.length = 0;
      return;
    }
    this.pushDense(this.px[0] as number, this.pz[0] as number);
    for (let i = 1; i < m - 1; i++) {
      const x0 = this.px[i - 1] as number;
      const z0 = this.pz[i - 1] as number;
      const x1 = this.px[i] as number;
      const z1 = this.pz[i] as number;
      const x2 = this.px[i + 1] as number;
      const z2 = this.pz[i + 1] as number;
      const la = Math.hypot(x1 - x0, z1 - z0);
      const lb = Math.hypot(x2 - x1, z2 - z1);
      const r = Math.min(CORNER_RADIUS, la / 2, lb / 2);
      const ax = (x1 - x0) / la;
      const az = (z1 - z0) / la;
      const bx = (x2 - x1) / lb;
      const bz = (z2 - z1) / lb;
      const ex = x1 - ax * r;
      const ez = z1 - az * r;
      const ox = x1 + bx * r;
      const oz = z1 + bz * r;
      this.pushDense(ex, ez);
      // Quadratic curve from the entry point, pulled by the corner, to the exit point.
      for (let k = 1; k <= CORNER_PIECES; k++) {
        const t = k / CORNER_PIECES;
        const u = 1 - t;
        this.pushDense(u * u * ex + 2 * u * t * x1 + t * t * ox, u * u * ez + 2 * u * t * z1 + t * t * oz);
      }
    }
    if (m > 1) this.pushDense(this.px[m - 1] as number, this.pz[m - 1] as number);

    // 3. Resample at an even spacing, plus the exact end point.
    const d = this.dense;
    this.x[0] = this.dx[0] as number;
    this.z[0] = this.dz[0] as number;
    this.s[0] = 0;
    if (d < 2) {
      this.tx[0] = 1;
      this.tz[0] = 0;
      this.count = 1;
      this.length = 0;
      return;
    }
    let count = 1;
    let walked = 0;
    let next = this.spacing;
    let segTx = 1;
    let segTz = 0;
    for (let i = 1; i < d; i++) {
      const x0 = this.dx[i - 1] as number;
      const z0 = this.dz[i - 1] as number;
      const x1 = this.dx[i] as number;
      const z1 = this.dz[i] as number;
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len <= 0) continue;
      segTx = (x1 - x0) / len;
      segTz = (z1 - z0) / len;
      if (i === 1) {
        this.tx[0] = segTx;
        this.tz[0] = segTz;
      }
      while (next <= walked + len && count < this.maxSamples - 1) {
        const f = (next - walked) / len;
        this.x[count] = x0 + (x1 - x0) * f;
        this.z[count] = z0 + (z1 - z0) * f;
        this.tx[count] = segTx;
        this.tz[count] = segTz;
        this.s[count] = next;
        count++;
        next += this.spacing;
      }
      walked += len;
    }
    // The tail tip lands exactly on the last point (skip a sample that is almost on top of it).
    const last = count - 1;
    if (walked - (this.s[last] as number) < this.spacing * 0.25 && last > 0) count = last;
    this.x[count] = this.dx[d - 1] as number;
    this.z[count] = this.dz[d - 1] as number;
    this.tx[count] = segTx;
    this.tz[count] = segTz;
    this.s[count] = walked;
    this.count = count + 1;
    this.length = walked;
  }
}

/** Length of a plain polyline [x0, z0, x1, z1, ...] (tests and sanity checks). */
export function polylineLength(points: ArrayLike<number>, n: number): number {
  let total = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(
      (points[i * 2] as number) - (points[i * 2 - 2] as number),
      (points[i * 2 + 1] as number) - (points[i * 2 - 1] as number),
    );
  }
  return total;
}
