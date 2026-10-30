#!/usr/bin/env node
// Scan the repo for secrets, absolute user paths and personal e-mail addresses.
// Usage: node scan-secrets.mjs [--root .]   Exit code 1 when anything is found.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, toPosix, walk } from './lib/fsutil.mjs';
import { capture } from './lib/run.mjs';
import { findSecrets } from './lib/secret-patterns.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(String(args.root ?? '.'));

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'site',
  'test-results',
  'playwright-report',
  'e2e-results',
  'blob-report',
  'coverage',
  '.pnpm-store',
];
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf',
  '.zip', '.gz', '.tgz', '.wasm', '.pdf', '.mp3', '.ogg', '.wav', '.mp4', '.webm',
]);

const files = walk(root, {
  ignoreDirs: IGNORE_DIRS,
  ignoreFiles: (rel) => BINARY_EXT.has(path.extname(rel).toLowerCase()),
});

const findings = [];
for (const file of files) {
  let text;
  try {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) continue; // binary
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  const rel = toPosix(path.relative(root, file));
  for (const f of findSecrets(text)) findings.push({ file: rel, ...f });
}

// Commit messages (bodies only; author metadata is not part of the tree).
if (fs.existsSync(path.join(root, '.git'))) {
  const log = capture('git', ['log', '--all', '--format=%H%n%s%n%b%n----'], { cwd: root });
  if (log) {
    for (const f of findSecrets(log)) findings.push({ file: '(git commit messages)', ...f });
  }
}

if (findings.length > 0) {
  console.error(`[scan:secrets] ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.name}  ${f.snippet}`);
  process.exit(1);
}
console.log(`[scan:secrets] clean (${files.length} files scanned)`);
