#!/usr/bin/env node
// Validate a build output and write the service worker with a content-hashed precache list.
// Usage: node gen-precache.mjs --dist dist --base /games/snake/ [--scope /games/snake/] [--force]
// With VITE_ASSEMBLED=1 (and no --force) the sw.js is NOT written: the hub worker covers the game.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, sha256, toPosix, walk } from './lib/fsutil.mjs';
import {
  SW_FILE,
  buildPrecacheManifest,
  checkHtmlForLiquid,
  checkHtmlMeta,
  checkOutputNames,
  isAssembled,
  renderServiceWorker,
} from './lib/precache.mjs';

const args = parseArgs(process.argv.slice(2));
const dist = path.resolve(String(args.dist ?? 'dist'));
const base = String(args.base ?? '/');
const scope = String(args.scope ?? base);
const force = args.force === true;

if (!fs.existsSync(dist)) {
  console.error(`[precache] dist folder not found: ${dist}`);
  process.exit(1);
}

const files = walk(dist);
const rel = files.map((f) => toPosix(path.relative(dist, f)));
const problems = [...checkOutputNames(rel)];
for (const f of files) {
  if (!f.endsWith('.html')) continue;
  const html = fs.readFileSync(f, 'utf8');
  const label = toPosix(path.relative(dist, f));
  problems.push(...checkHtmlForLiquid(html, label), ...checkHtmlMeta(html, label));
}
if (rel.includes('CNAME')) problems.push('CNAME must not exist');
if (problems.length > 0) {
  console.error('[precache] output verification failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (isAssembled() && !force) {
  const swPath = path.join(dist, SW_FILE);
  if (fs.existsSync(swPath)) fs.rmSync(swPath);
  console.log(`[precache] assembled build: ${rel.length} files verified, no ${SW_FILE} written (hub worker covers ${base}).`);
  process.exit(0);
}

const entries = files
  .filter((f) => toPosix(path.relative(dist, f)) !== SW_FILE)
  .map((f) => ({ path: toPosix(path.relative(dist, f)), hash: sha256(fs.readFileSync(f)) }));
const manifest = buildPrecacheManifest(entries, base);
const source = renderServiceWorker({ scope, version: manifest.version, assets: manifest.assets });
fs.writeFileSync(path.join(dist, SW_FILE), source);
const bytes = entries.reduce((n, e) => n + fs.statSync(path.join(dist, e.path)).size, 0);
console.log(
  `[precache] wrote ${SW_FILE} (scope ${scope}, version ${manifest.version}) with ${manifest.assets.length} files, ${(bytes / 1024).toFixed(0)} KiB`,
);
