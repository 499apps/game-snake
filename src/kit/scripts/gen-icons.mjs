#!/usr/bin/env node
// Generate PWA icons (PNG) and a favicon (SVG) from original code-drawn art.
// Usage: node gen-icons.mjs --variant hub|snake|coloring --out public/icons [--favicon public/favicon.svg]
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, parseArgs } from './lib/fsutil.mjs';
import { makeArt, rasterize, toSvg } from './lib/icon-art.mjs';
import { encodePng } from './lib/png.mjs';

const args = parseArgs(process.argv.slice(2));
const variant = String(args.variant ?? 'hub');
const outDir = path.resolve(String(args.out ?? 'public/icons'));
const favicon = args.favicon ? path.resolve(String(args.favicon)) : null;
const force = args.force === true;

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

ensureDir(outDir);
let written = 0;
for (const t of targets) {
  const file = path.join(outDir, t.file);
  if (!force && fs.existsSync(file)) continue;
  const shapes = makeArt(variant, { maskable: t.maskable });
  const rgba = rasterize(shapes, t.size);
  fs.writeFileSync(file, encodePng(t.size, t.size, rgba));
  written++;
}
if (favicon && (force || !fs.existsSync(favicon))) {
  ensureDir(path.dirname(favicon));
  fs.writeFileSync(favicon, toSvg(makeArt(variant, { maskable: false })));
  written++;
}
console.log(`[icons] variant=${variant} wrote ${written} file(s) to ${path.relative(process.cwd(), outDir) || '.'}`);
