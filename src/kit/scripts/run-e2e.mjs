#!/usr/bin/env node
// Run the Playwright suite, optionally in N concurrent shards, against one shared server.
// Usage: node run-e2e.mjs --config playwright.config.ts --server preview|site [--port 4173] [--root site]
// Env:  E2E_SHARDS (default 2), E2E_WORKERS (per shard; default max(1, floor(cpus * 0.25 / shards))), E2E_BROWSERS
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ensureDir, parseArgs, formatMs } from './lib/fsutil.mjs';
import { killTree, spawnTask, waitForHttp } from './lib/run.mjs';

const args = parseArgs(process.argv.slice(2));
const config = String(args.config ?? 'playwright.config.ts');
const serverKind = String(args.server ?? 'preview');
const port = Number(args.port ?? (serverKind === 'site' ? 4499 : 4173));
const siteRoot = String(args.root ?? 'site');
const readyPath = String(args['ready-path'] ?? '/');
const shards = Math.max(1, Math.min(8, Number(process.env.E2E_SHARDS ?? 2)));
const passthrough = args._;
// The frame-time test measures real frames, so it runs alone after the shards, not next to
// CPU-heavy software-GL workers.
const PERF_GREP = 'frame-time budget';
const browsers = (process.env.E2E_BROWSERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const runPerf = browsers.length === 0 || browsers.includes('chromium');

const resultsDir = path.resolve('e2e-results');
ensureDir(resultsDir);
for (const f of fs.readdirSync(resultsDir)) {
  if (f.endsWith('.json')) fs.rmSync(path.join(resultsDir, f));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const staticServer = path.join(here, 'static-server.mjs');

const t0 = Date.now();
let server = null;
const url = `http://localhost:${port}${readyPath}`;

async function startServer() {
  const already = await waitForHttp(url, 500);
  if (already) {
    console.log(`[e2e] reusing server at ${url}`);
    return;
  }
  if (serverKind === 'site') {
    server = spawnTask('node', [staticServer, '--root', siteRoot, '--port', String(port)], {
      capture: true,
    });
  } else {
    server = spawnTask(
      'pnpm',
      ['exec', 'vite', 'preview', '--port', String(port), '--strictPort'],
      { capture: true },
    );
  }
  const up = await waitForHttp(url, 60000);
  if (!up) {
    console.error(`[e2e] server did not start at ${url}\n${server.output()}`);
    killTree(server.child);
    process.exit(1);
  }
  console.log(`[e2e] server ready at ${url}`);
}

// Software WebGL (SwiftShader / llvmpipe) runs every pass on the CPU, so each worker can use
// several cores. Default: a quarter of the logical CPUs, split across the shards.
function workersPerShard() {
  if (process.env.E2E_WORKERS) return process.env.E2E_WORKERS;
  const cpus = Math.max(1, os.cpus().length);
  return String(Math.max(1, Math.floor((cpus * 0.25) / shards)));
}

async function runShards() {
  const tasks = [];
  for (let i = 1; i <= shards; i++) {
    const jsonFile = path.join(resultsDir, `shard-${i}.json`);
    const pwArgs = [
      'exec',
      'playwright',
      'test',
      '--config',
      config,
      '--reporter=list,json',
      '--workers',
      workersPerShard(),
      '--grep-invert',
      PERF_GREP,
    ];
    if (shards > 1) pwArgs.push(`--shard=${i}/${shards}`);
    pwArgs.push(...passthrough);
    const task = spawnTask('pnpm', pwArgs, {
      capture: true,
      env: {
        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
        E2E_EXTERNAL_SERVER: '1',
        E2E_SHARD: String(i),
        E2E_PORT: String(port),
        FORCE_COLOR: '1',
      },
      onData: shards === 1 ? (d) => process.stdout.write(d) : undefined,
    });
    tasks.push({ i, task, jsonFile });
  }
  const codes = await Promise.all(tasks.map((t) => t.task.done));
  if (shards > 1) {
    for (const t of tasks) {
      console.log(`\n[e2e] ── shard ${t.i}/${shards} output ──`);
      process.stdout.write(t.task.output());
    }
  }
  if (runPerf) {
    const jsonFile = path.join(resultsDir, 'perf.json');
    const task = spawnTask(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        config,
        '--reporter=list,json',
        '--workers',
        '1',
        '--project',
        'chromium',
        '--grep',
        PERF_GREP,
        ...passthrough,
      ],
      {
        capture: true,
        env: {
          PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile,
          E2E_EXTERNAL_SERVER: '1',
          E2E_PORT: String(port),
          E2E_SHARD: 'perf',
          FORCE_COLOR: '1',
        },
      },
    );
    const code = await task.done;
    console.log('\n[e2e] -- frame-time pass (alone) --');
    process.stdout.write(task.output());
    tasks.push({ i: 'perf', task, jsonFile });
    codes.push(code);
  }
  return { tasks, codes };
}

function mergeResults(tasks) {
  const merged = { passed: 0, failed: 0, flaky: 0, skipped: 0, shards: tasks.length, files: [] };
  for (const t of tasks) {
    if (!fs.existsSync(t.jsonFile)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(t.jsonFile, 'utf8'));
      const stats = data.stats ?? {};
      merged.passed += stats.expected ?? 0;
      merged.failed += stats.unexpected ?? 0;
      merged.flaky += stats.flaky ?? 0;
      merged.skipped += stats.skipped ?? 0;
      merged.files.push(path.basename(t.jsonFile));
    } catch {
      /* ignore unreadable shard report */
    }
  }
  fs.writeFileSync(path.join(resultsDir, 'merged.json'), JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

await startServer();
let exitCode = 0;
try {
  const { tasks, codes } = await runShards();
  const merged = mergeResults(tasks);
  exitCode = codes.some((c) => c !== 0) ? 1 : 0;
  console.log(
    `\n[e2e] ${merged.passed} passed, ${merged.failed} failed, ${merged.flaky} flaky, ${merged.skipped} skipped across ${shards} shard(s) in ${formatMs(Date.now() - t0)}`,
  );
  console.log(`E2E_SUMMARY ${JSON.stringify(merged)}`);
} finally {
  if (server) killTree(server.child);
}
process.exit(exitCode);
