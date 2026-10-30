// Original icon art drawn with code (signed-distance shapes), rasterised to RGBA and
// also emitted as SVG. Coordinates are in a 0..1 unit square.

const P = {
  night: '#1b1740',
  plum: '#2d2259',
  ink: '#17132b',
  coral: '#ff6b6b',
  tangerine: '#ffa94d',
  lemon: '#ffe66d',
  lime: '#8ce99a',
  mint: '#63e6be',
  sky: '#74c0fc',
  lavender: '#b197fc',
  bubblegum: '#f783ac',
  cream: '#fff7e6',
  white: '#ffffff',
};

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */

function hex(h, a = 1) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

const circle = (cx, cy, r, fill, alpha = 1) => ({ type: 'circle', cx, cy, r, fill, alpha });
const rrect = (x, y, w, h, rx, fill, alpha = 1) => ({ type: 'rrect', x, y, w, h, rx, fill, alpha });
const capsule = (x1, y1, x2, y2, r, fill, alpha = 1) => ({ type: 'capsule', x1, y1, x2, y2, r, fill, alpha });
const gradient = (from, to, c1, c2) => ({ gradient: true, from, to, c1, c2 });

function highlight(cx, cy, r) {
  return circle(cx - r * 0.35, cy - r * 0.38, r * 0.3, P.white, 0.6);
}

/** Background + gloss. Maskable icons fill the whole square (OS applies its own mask). */
function background(maskable) {
  const rx = maskable ? 0 : 0.21;
  return [
    rrect(0, 0, 1, 1, rx, gradient([0, 0], [1, 1], P.plum, P.night)),
    rrect(0.04, 0.04, 0.92, 0.42, maskable ? 0.1 : 0.18, P.white, 0.06),
  ];
}

function hubArt(maskable) {
  const k = maskable ? 0.82 : 1;
  const c = (v) => 0.5 + (v - 0.5) * k;
  const r = 0.17 * k;
  return [
    ...background(maskable),
    circle(c(0.36), c(0.41), r, gradient([0.2, 0.25], [0.5, 0.6], P.coral, P.bubblegum)),
    highlight(c(0.36), c(0.41), r),
    circle(c(0.64), c(0.41), r, gradient([0.5, 0.25], [0.8, 0.6], P.lemon, P.tangerine)),
    highlight(c(0.64), c(0.41), r),
    circle(c(0.5), c(0.64), r, gradient([0.35, 0.5], [0.65, 0.85], P.sky, P.lavender)),
    highlight(c(0.5), c(0.64), r),
    capsule(c(0.5), c(0.28), c(0.5), c(0.3), 0.02 * k, P.white, 0.9),
  ];
}

function snakeArt(maskable) {
  const k = maskable ? 0.8 : 1;
  const c = (v) => 0.5 + (v - 0.5) * k;
  const body = gradient([0.2, 0.3], [0.8, 0.8], P.lime, P.mint);
  const pts = [
    [0.24, 0.72],
    [0.38, 0.78],
    [0.52, 0.7],
    [0.58, 0.56],
    [0.48, 0.44],
    [0.52, 0.33],
  ];
  const shapes = [...background(maskable)];
  const rad = 0.075 * k;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    shapes.push(capsule(c(x1), c(y1), c(x2), c(y2), rad * (1 - i * 0.04), body));
  }
  // head
  const hx = c(0.64);
  const hy = c(0.3);
  shapes.push(circle(hx, hy, 0.12 * k, gradient([0.55, 0.2], [0.8, 0.4], P.lime, P.mint)));
  shapes.push(highlight(hx, hy, 0.12 * k));
  shapes.push(circle(hx + 0.035 * k, hy - 0.03 * k, 0.03 * k, P.white));
  shapes.push(circle(hx + 0.042 * k, hy - 0.03 * k, 0.015 * k, P.ink));
  shapes.push(circle(hx - 0.045 * k, hy - 0.03 * k, 0.03 * k, P.white));
  shapes.push(circle(hx - 0.038 * k, hy - 0.03 * k, 0.015 * k, P.ink));
  shapes.push(capsule(hx + 0.11 * k, hy + 0.02 * k, hx + 0.17 * k, hy + 0.04 * k, 0.012 * k, P.coral));
  // apple
  shapes.push(circle(c(0.76), c(0.72), 0.075 * k, gradient([0.7, 0.65], [0.82, 0.8], P.coral, P.bubblegum)));
  shapes.push(highlight(c(0.76), c(0.72), 0.075 * k));
  shapes.push(capsule(c(0.76), c(0.64), c(0.78), c(0.6), 0.012 * k, P.lime));
  return shapes;
}

function coloringArt(maskable) {
  const k = maskable ? 0.8 : 1;
  const c = (v) => 0.5 + (v - 0.5) * k;
  const shapes = [...background(maskable)];
  // palette blob
  shapes.push(circle(c(0.44), c(0.56), 0.3 * k, gradient([0.2, 0.3], [0.7, 0.9], P.cream, '#f3dfc0')));
  shapes.push(circle(c(0.52), c(0.6), 0.06 * k, P.plum, 0.25)); // thumb hole shadow
  shapes.push(circle(c(0.52), c(0.6), 0.05 * k, P.night));
  const dabs = [
    [0.3, 0.42, P.coral],
    [0.44, 0.33, P.lemon],
    [0.58, 0.4, P.sky],
    [0.26, 0.6, P.lime],
    [0.34, 0.76, P.lavender],
  ];
  for (const [x, y, col] of dabs) {
    shapes.push(circle(c(x), c(y), 0.062 * k, col));
    shapes.push(highlight(c(x), c(y), 0.062 * k));
  }
  // brush: handle, ferrule, tip
  shapes.push(capsule(c(0.9), c(0.18), c(0.66), c(0.5), 0.035 * k, gradient([0.6, 0.5], [0.9, 0.2], P.tangerine, P.coral)));
  shapes.push(capsule(c(0.66), c(0.5), c(0.6), c(0.58), 0.036 * k, '#d9d9e3'));
  shapes.push(capsule(c(0.6), c(0.58), c(0.53), c(0.68), 0.03 * k, P.plum));
  shapes.push(circle(c(0.52), c(0.7), 0.028 * k, P.sky));
  return shapes;
}

export const VARIANTS = {
  hub: hubArt,
  snake: snakeArt,
  coloring: coloringArt,
};

/**
 * @param {'hub'|'snake'|'coloring'} variant
 * @param {{ maskable: boolean }} o
 */
export function makeArt(variant, o) {
  const fn = VARIANTS[variant];
  if (!fn) throw new Error(`unknown icon variant: ${variant}`);
  return fn(o.maskable);
}

function fillAt(fill, alpha, x, y) {
  if (typeof fill === 'string') return hex(fill, alpha);
  const dx = fill.to[0] - fill.from[0];
  const dy = fill.to[1] - fill.from[1];
  const len2 = dx * dx + dy * dy || 1;
  let t = ((x - fill.from[0]) * dx + (y - fill.from[1]) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = hex(fill.c1);
  const b = hex(fill.c2);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: alpha,
  };
}

function inside(shape, x, y) {
  switch (shape.type) {
    case 'circle': {
      const dx = x - shape.cx;
      const dy = y - shape.cy;
      return dx * dx + dy * dy <= shape.r * shape.r;
    }
    case 'rrect': {
      const rx = Math.min(shape.rx, shape.w / 2, shape.h / 2);
      const qx = Math.abs(x - (shape.x + shape.w / 2)) - (shape.w / 2 - rx);
      const qy = Math.abs(y - (shape.y + shape.h / 2)) - (shape.h / 2 - rx);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const d = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - rx;
      return d <= 0;
    }
    case 'capsule': {
      const vx = shape.x2 - shape.x1;
      const vy = shape.y2 - shape.y1;
      const wx = x - shape.x1;
      const wy = y - shape.y1;
      const len2 = vx * vx + vy * vy || 1;
      let t = (wx * vx + wy * vy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = wx - vx * t;
      const dy = wy - vy * t;
      return dx * dx + dy * dy <= shape.r * shape.r;
    }
    default:
      return false;
  }
}

/**
 * Rasterise shapes into straight-alpha RGBA at the given size (4x4 supersampling).
 * @returns {Uint8Array}
 */
export function rasterize(shapes, size, samples = 4) {
  const out = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  const sub = 1 / samples;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) * sub) * inv;
          const y = (py + (sy + 0.5) * sub) * inv;
          // composite shapes in order over transparent
          let cr = 0;
          let cg = 0;
          let cb = 0;
          let ca = 0;
          for (const s of shapes) {
            if (!inside(s, x, y)) continue;
            const f = fillAt(s.fill, s.alpha ?? 1, x, y);
            const fa = f.a;
            cr = f.r * fa + cr * (1 - fa);
            cg = f.g * fa + cg * (1 - fa);
            cb = f.b * fa + cb * (1 - fa);
            ca = fa + ca * (1 - fa);
          }
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = samples * samples;
      const i = (py * size + px) * 4;
      // premultiplied average -> straight alpha
      const aa = a / n;
      out[i] = aa > 0 ? Math.round(r / n / aa) : 0;
      out[i + 1] = aa > 0 ? Math.round(g / n / aa) : 0;
      out[i + 2] = aa > 0 ? Math.round(b / n / aa) : 0;
      out[i + 3] = Math.round(aa * 255);
    }
  }
  return out;
}

/** SVG rendition of the same shapes (unit square scaled to viewBox 0 0 100 100). */
export function toSvg(shapes) {
  const defs = [];
  const body = [];
  let gid = 0;
  const fillAttr = (fill, alpha) => {
    const op = alpha !== undefined && alpha < 1 ? ` fill-opacity="${alpha}"` : '';
    if (typeof fill === 'string') return `fill="${fill}"${op}`;
    const id = `g${gid++}`;
    defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fill.from[0] * 100}" y1="${fill.from[1] * 100}" x2="${fill.to[0] * 100}" y2="${fill.to[1] * 100}"><stop offset="0" stop-color="${fill.c1}"/><stop offset="1" stop-color="${fill.c2}"/></linearGradient>`,
    );
    return `fill="url(#${id})"${op}`;
  };
  const n = (v) => Number((v * 100).toFixed(2));
  for (const s of shapes) {
    const f = fillAttr(s.fill, s.alpha);
    if (s.type === 'circle') body.push(`<circle cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r)}" ${f}/>`);
    else if (s.type === 'rrect')
      body.push(`<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(s.rx)}" ${f}/>`);
    else if (s.type === 'capsule') {
      const stroke = f.replace('fill=', 'stroke=').replace('fill-opacity', 'stroke-opacity');
      body.push(
        `<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" ${stroke} stroke-width="${n(s.r * 2)}" stroke-linecap="round"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><defs>${defs.join('')}</defs>${body.join('')}</svg>\n`;
}
