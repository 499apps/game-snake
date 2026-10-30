#!/usr/bin/env node
// Vendor the shared kit: copy ../games-kit/src into ./src/kit and record the kit git sha.
// Usage (from a consumer repo): node scripts/kit-sync.mjs [--source ../games-kit]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
// Walk up from this script until a package.json marks the consumer repo root.
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, '..');
}
const repoRoot = findRepoRoot(here);

const argv = process.argv.slice(2);
const sourceArg = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : undefined;
const source = path.resolve(repoRoot, sourceArg ?? path.join('..', 'games-kit'));
const target = path.join(repoRoot, 'src', 'kit');

if (!fs.existsSync(path.join(source, 'src', 'index.ts'))) {
  console.error(`[kit:sync] games-kit not found at ${source} (expected a sibling checkout).`);
  process.exit(1);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: source, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

const sha = git(['rev-parse', 'HEAD']) ?? 'unknown';
const dirty = (git(['status', '--porcelain']) ?? '') !== '';

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(a, b);
    else if (entry.isFile()) fs.copyFileSync(a, b);
  }
}

fs.rmSync(target, { recursive: true, force: true });
copyTree(path.join(source, 'src'), target);
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
// Keep this bootstrap script itself in sync with the canonical copy.
const canonical = path.join(source, 'src', 'scripts', 'kit-sync.mjs');
const local = path.join(repoRoot, 'scripts', 'kit-sync.mjs');
if (fs.existsSync(canonical) && path.resolve(local) !== path.resolve(canonical)) {
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.copyFileSync(canonical, local);
}

const lock = {
  source: 'https://github.com/499apps/games-kit',
  sha: dirty ? `${sha}-dirty` : sha,
  syncedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(repoRoot, 'kit.lock'), JSON.stringify(lock, null, 2) + '\n');
console.log(`[kit:sync] vendored games-kit ${lock.sha} into src/kit`);
if (dirty) console.warn('[kit:sync] warning: games-kit has uncommitted changes; commit it and re-sync before release.');
