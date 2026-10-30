// Cross-platform process helpers. On Windows, pnpm/npx are .cmd files and need a shell.
import { spawn, spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

function quoteArg(a) {
  if (!isWin) return a;
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(a)) return a;
  return `"${String(a).replace(/"/g, '\\"')}"`;
}

/**
 * Run a command and wait. Throws on a non-zero exit code unless opts.allowFailure.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string|undefined>, stdio?: any, allowFailure?: boolean, capture?: boolean }} [opts]
 */
export function runSync(cmd, args, opts = {}) {
  const env = { ...process.env, ...(opts.env ?? {}) };
  const result = spawnSync(cmd, args.map(quoteArg), {
    cwd: opts.cwd,
    env,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : (opts.stdio ?? 'inherit'),
    shell: isWin,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !opts.allowFailure) {
    const detail = opts.capture ? `\n${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}${detail}`);
  }
  return result;
}

/** Captured stdout (trimmed) of a command, or null when it fails. */
export function capture(cmd, args, opts = {}) {
  try {
    const r = runSync(cmd, args, { ...opts, capture: true, allowFailure: true });
    if (r.status !== 0) return null;
    return String(r.stdout ?? '').trim();
  } catch {
    return null;
  }
}

/**
 * Spawn a long-running process (server or CI step). Output is buffered when capture=true.
 * @returns {{ child: import('node:child_process').ChildProcess, output: () => string, done: Promise<number> }}
 */
export function spawnTask(cmd, args, opts = {}) {
  const env = { ...process.env, ...(opts.env ?? {}) };
  const chunks = [];
  const child = spawn(cmd, args.map(quoteArg), {
    cwd: opts.cwd,
    env,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: isWin,
    windowsHide: true,
  });
  if (opts.capture) {
    child.stdout?.on('data', (d) => {
      chunks.push(d);
      opts.onData?.(String(d));
    });
    child.stderr?.on('data', (d) => {
      chunks.push(d);
      opts.onData?.(String(d));
    });
  }
  const done = new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
  return { child, output: () => Buffer.concat(chunks).toString('utf8'), done };
}

/** Kill a process tree (Windows needs taskkill to reach grandchildren through cmd.exe). */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
}

/** Wait until an HTTP URL answers (any status), or time out. */
export async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
