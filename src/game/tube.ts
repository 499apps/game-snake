/**
 * The snake body: one smooth tube mesh, rebuilt in place every frame from the spine samples
 * (no allocation per frame). Segment bands and a warm belly come from vertex colours; normals
 * follow the radius profile so the rounded tail tip shades smoothly.
 */
import * as THREE from 'three';

export interface TubeColors {
  main: THREE.ColorRepresentation;
  stripe: THREE.ColorRepresentation;
  belly: THREE.ColorRepresentation;
}

export interface TubeFrame {
  x: Float32Array;
  z: Float32Array;
  tx: Float32Array;
  tz: Float32Array;
  /** Arc length of each sample from the head (drives the stripes). */
  s: Float32Array;
  /** Ring radius per sample. */
  radius: Float32Array;
  /** Height of each ring centre above the board origin. */
  y: Float32Array;
  count: number;
}

export class SnakeTube {
  readonly geometry: THREE.BufferGeometry;
  private readonly radial: number;
  private readonly maxRings: number;
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly col: Float32Array;
  private readonly main = new THREE.Color();
  private readonly stripe = new THREE.Color();
  private readonly belly = new THREE.Color();
  private readonly cosT: Float32Array;
  private readonly sinT: Float32Array;

  constructor(maxRings: number, radial: number, colors: TubeColors) {
    this.radial = radial;
    this.maxRings = maxRings;
    const ringVerts = radial + 1;
    const verts = maxRings * ringVerts;
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.cosT = new Float32Array(ringVerts);
    this.sinT = new Float32Array(ringVerts);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      this.cosT[k] = Math.cos(a);
      this.sinT[k] = Math.sin(a);
    }
    this.setColors(colors);

    const quads = (maxRings - 1) * radial;
    const index = verts > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);
    let o = 0;
    for (let j = 0; j < maxRings - 1; j++) {
      for (let k = 0; k < radial; k++) {
        const a = j * ringVerts + k;
        const b = a + ringVerts;
        const c = a + 1;
        const d = b + 1;
        // Wound so the faces point outward.
        index[o++] = a;
        index[o++] = c;
        index[o++] = b;
        index[o++] = c;
        index[o++] = d;
        index[o++] = b;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(index, 1));
    const usage = THREE.DynamicDrawUsage;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(usage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(usage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(usage));
    g.setDrawRange(0, 0);
    // The body moves every frame; a generous fixed bound avoids recomputing it.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = g;
  }

  setColors(c: TubeColors): void {
    this.main.set(c.main);
    this.stripe.set(c.stripe);
    this.belly.set(c.belly);
  }

  update(f: TubeFrame): void {
    const rings = Math.min(f.count, this.maxRings);
    const rv = this.radial + 1;
    const pos = this.pos;
    const nrm = this.nrm;
    const col = this.col;
    const m = this.main;
    const st = this.stripe;
    const be = this.belly;
    for (let j = 0; j < rings; j++) {
      const cx = f.x[j] as number;
      const cz = f.z[j] as number;
      const cy = f.y[j] as number;
      const r = f.radius[j] as number;
      const tx = f.tx[j] as number;
      const tz = f.tz[j] as number;
      // Side vector: horizontal, at right angles to the tangent. Up is +y.
      const sx = tz;
      const sz = -tx;
      // Normals lean along the tangent where the radius changes (dr/ds), so the tapered tail and
      // its round tip shade as a dome. The last ring of a closed tip points straight back.
      const a = Math.max(0, j - 1);
      const b = Math.min(rings - 1, j + 1);
      const ds = (f.s[b] as number) - (f.s[a] as number);
      const slope = ds > 1e-6 ? ((f.radius[b] as number) - (f.radius[a] as number)) / ds : 0;
      const tipEnd = j === rings - 1 && r < 1e-3;
      const inv = tipEnd ? 0 : 1 / Math.sqrt(1 + slope * slope);
      const lean = tipEnd ? 1 : -slope * inv;
      // Segment shading: one soft band per cell along the body.
      const band = 0.5 + 0.5 * Math.cos((f.s[j] as number) * Math.PI * 2);
      const k0 = band * band * band;
      const rr = m.r + (st.r - m.r) * k0;
      const rg = m.g + (st.g - m.g) * k0;
      const rb = m.b + (st.b - m.b) * k0;
      for (let k = 0; k < rv; k++) {
        const c = this.cosT[k] as number;
        const s = this.sinT[k] as number;
        const nx = c * sx;
        const ny = s;
        const nz = c * sz;
        const i = (j * rv + k) * 3;
        pos[i] = cx + nx * r;
        pos[i + 1] = cy + ny * r;
        pos[i + 2] = cz + nz * r;
        nrm[i] = nx * inv + tx * lean;
        nrm[i + 1] = ny * inv;
        nrm[i + 2] = nz * inv + tz * lean;
        // Cream belly on the underside.
        const kb = Math.min(1, Math.max(0, (-s - 0.15) * 2.2));
        col[i] = rr + (be.r - rr) * kb;
        col[i + 1] = rg + (be.g - rg) * kb;
        col[i + 2] = rb + (be.b - rb) * kb;
      }
    }
    const g = this.geometry;
    g.setDrawRange(0, rings > 1 ? (rings - 1) * this.radial * 6 : 0);
    for (const name of ['position', 'normal', 'color']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, rings * rv * 3);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
