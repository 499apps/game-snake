/**
 * 499apps Games theme: the one palette, lighting recipe and layout tokens.
 * Every repo imports these values from its vendored kit so the look stays consistent.
 */

export const palette = {
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
} as const;

export type PaletteName = keyof typeof palette;

/** Fun colors for game pieces, in a pleasant order. */
export const funColors: readonly string[] = [
  palette.coral,
  palette.tangerine,
  palette.lemon,
  palette.lime,
  palette.mint,
  palette.sky,
  palette.lavender,
  palette.bubblegum,
];

/** Lighting recipe shared by every 3D scene ("cozy playroom" look). */
export const lighting = {
  hemisphereSky: '#d6e9ff',
  hemisphereGround: '#4a3a7a',
  hemisphereIntensity: 1.15,
  keyColor: '#fff1dc',
  keyIntensity: 2.8,
  keyPosition: [6, 10, 6] as const,
  rimColor: '#8ec5ff',
  rimIntensity: 2.2,
  rimPosition: [-8, 6, -6] as const,
  fillColor: '#ffb8d1',
  fillIntensity: 28,
  fillPosition: [-3, 3, 5] as const,
  exposure: 1.05,
  bloom: { strength: 0.5, radius: 0.55, threshold: 0.82 },
  vignette: 0.32,
} as const;

/** Layout tokens (px unless noted). */
export const tokens = {
  railWidth: 72,
  drawerWidth: 272,
  touchTarget: 56,
  radius: 18,
  phoneMaxWidth: 719,
  themeColor: palette.night,
  backgroundColor: palette.night,
  fontStack:
    '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", "Noto Sans", Arial, sans-serif',
} as const;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse "#rrggbb" into 0..1 components. Returns black for bad input. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1] as string, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Format 0..1 components as "#rrggbb". */
export function rgbToHex(c: Rgb): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

/** Linear blend of two hex colors (t = 0 gives a, t = 1 gives b). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

/** Write the palette and tokens as CSS custom properties on an element (default: <html>). */
export function applyThemeCss(root?: HTMLElement): void {
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;
  for (const [name, value] of Object.entries(palette)) {
    el.style.setProperty(`--g499-${name}`, value);
  }
  el.style.setProperty('--g499-rail-width', `${tokens.railWidth}px`);
  el.style.setProperty('--g499-drawer-width', `${tokens.drawerWidth}px`);
  el.style.setProperty('--g499-touch', `${tokens.touchTarget}px`);
  el.style.setProperty('--g499-radius', `${tokens.radius}px`);
  el.style.setProperty('--g499-font', tokens.fontStack);
}
