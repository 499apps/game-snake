/**
 * Minimal PNG decoder for smoke tests (8-bit, non-interlaced, colour types 0/2/4/6).
 * Used to prove a WebGL canvas screenshot is not blank, in any browser engine.
 */
import zlib from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: Uint8Array;
}

export function decodePng(buf: Buffer): DecodedPng {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) throw new Error('not a PNG');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let bitDepth = 8;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] as number;
      colorType = data[9] as number;
      interlace = data[12] as number;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++] as number;
    for (let i = 0; i < stride; i++) cur[i] = raw[p + i] as number;
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? (cur[i - channels] as number) : 0;
      const b = prev[i] as number;
      const c = i >= channels ? (prev[i - channels] as number) : 0;
      let v = cur[i] as number;
      switch (filter) {
        case 1:
          v = (v + a) & 255;
          break;
        case 2:
          v = (v + b) & 255;
          break;
        case 3:
          v = (v + Math.floor((a + b) / 2)) & 255;
          break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pred) & 255;
          break;
        }
        default:
          break;
      }
      cur[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (channels === 1) {
        out[o] = out[o + 1] = out[o + 2] = cur[s] as number;
        out[o + 3] = 255;
      } else if (channels === 2) {
        out[o] = out[o + 1] = out[o + 2] = cur[s] as number;
        out[o + 3] = cur[s + 1] as number;
      } else if (channels === 3) {
        out[o] = cur[s] as number;
        out[o + 1] = cur[s + 1] as number;
        out[o + 2] = cur[s + 2] as number;
        out[o + 3] = 255;
      } else {
        out[o] = cur[s] as number;
        out[o + 1] = cur[s + 1] as number;
        out[o + 2] = cur[s + 2] as number;
        out[o + 3] = cur[s + 3] as number;
      }
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

export interface ImageStats {
  total: number;
  /** Distinct colours after quantising to 5 bits per channel. */
  distinct: number;
  /** Share of sampled pixels that differ from the most common colour (0..1). */
  nonDominant: number;
}

export function imageStats(png: DecodedPng, step = 4): ImageStats {
  const counts = new Map<number, number>();
  let total = 0;
  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const i = (y * png.width + x) * 4;
      const q =
        (((png.data[i] as number) >> 3) << 10) |
        (((png.data[i + 1] as number) >> 3) << 5) |
        ((png.data[i + 2] as number) >> 3);
      counts.set(q, (counts.get(q) ?? 0) + 1);
      total++;
    }
  }
  let mode = 0;
  for (const c of counts.values()) if (c > mode) mode = c;
  return { total, distinct: counts.size, nonDominant: total === 0 ? 0 : (total - mode) / total };
}
