// Small cross-platform file helpers for the kit scripts (Node >= 20, ESM).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Recursively list files below dir. Returns absolute paths, sorted.
 * @param {string} dir
 * @param {{ ignoreDirs?: string[], ignoreFiles?: (rel: string) => boolean }} [opts]
 */
export function walk(dir, opts = {}) {
  const ignoreDirs = new Set(opts.ignoreDirs ?? []);
  const out = [];
  const visit = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        visit(full);
      } else if (entry.isFile()) {
        const rel = toPosix(path.relative(dir, full));
        if (opts.ignoreFiles && opts.ignoreFiles(rel)) continue;
        out.push(full);
      }
    }
  };
  visit(dir);
  return out.sort();
}

/**
 * Copy a directory tree. filter(relPosixPath, isDir) returns false to skip.
 */
export function copyDir(src, dst, filter) {
  ensureDir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    const rel = toPosix(path.relative(src, from));
    if (filter && !filter(rel, entry.isDirectory())) continue;
    if (entry.isDirectory()) copyDir(from, to, filter ? (r, d) => filter(`${rel}/${r}`, d) : undefined);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

export function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function dirExists(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Parse "--name value" and "--flag" arguments into an object. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
