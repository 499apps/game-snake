#!/usr/bin/env node
// Local CI runner (no GitHub Actions anywhere).
//  1. static checks + unit tests in parallel: typecheck, lint, test, scan:secrets (fail fast)
//  2. build
//  3. e2e (sharded Playwright through run-e2e.mjs)
// Usage: node ci-local.mjs [--no-build] [--no-e2e] [--only typecheck,lint]
import fs from 'node:fs';
import path from 'node:path';
import { formatMs, parseArgs } from './lib/fsutil.mjs';
import { killTree, spawnTask } from './lib/run.mjs';

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};
const only = typeof args.only === 'string' ? args.only.split(',').map((s) => s.trim()) : null;

const PARALLEL = ['typecheck', 'lint', 'test', 'scan:secrets'];
const t0 = Date.now();
const counts = { unit: 0, e2e: 0 };
const bold = (s) => `\u001b[1m${s}\u001b[22m`;
const green = (s) => `\u001b[32m${s}\u001b[39m`;
const red = (s) => `\u001b[31m${s}\u001b[39m`;
const dim = (s) => `\u001b[2m${s}\u001b[22m`;

function has(name) {
  return typeof scripts[name] === 'string' && (!only || only.includes(name));
}

function parseUnitCount(output) {
  const m = /Tests\s+(\d+)\s+passed/.exec(output);
  return m ? Number(m[1]) : 0;
}

function parseE2eSummary(output) {
  const m = /E2E_SUMMARY\s+(\{.*\})/.exec(output);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function runParallel(names) {
  console.log(bold(`\n▶ ${names.join(', ')} (parallel)`));
  const tasks = names.map((name) => {
    const started = Date.now();
    const task = spawnTask('pnpm', ['--silent', 'run', name], { cwd: root, capture: true });
    return { name, started, task };
  });
  let failed = null;
  await Promise.all(
    tasks.map(async (t) => {
      const code = await t.task.done;
      const ms = Date.now() - t.started;
      if (code === 0) {
        console.log(`  ${green('✔')} ${t.name} ${dim(formatMs(ms))}`);
        if (t.name === 'test') counts.unit = parseUnitCount(t.task.output());
      } else if (!failed) {
        failed = t;
        console.log(`  ${red('✖')} ${t.name} ${dim(formatMs(ms))}`);
        for (const other of tasks) if (other !== t) killTree(other.task.child);
      }
    }),
  );
  if (failed) {
    console.log(red(`\n${failed.name} failed. Output:\n`));
    console.log(failed.task.output());
    return false;
  }
  return true;
}

async function runSerial(name, extraEnv = {}) {
  console.log(bold(`\n▶ ${name}`));
  const started = Date.now();
  const task = spawnTask('pnpm', ['--silent', 'run', name], {
    cwd: root,
    capture: true,
    env: extraEnv,
    onData: (d) => process.stdout.write(d),
  });
  const code = await task.done;
  const ms = Date.now() - started;
  if (code !== 0) {
    console.log(`  ${red('✖')} ${name} ${dim(formatMs(ms))}`);
    return { ok: false, output: task.output() };
  }
  console.log(`  ${green('✔')} ${name} ${dim(formatMs(ms))}`);
  return { ok: true, output: task.output() };
}

const parallel = PARALLEL.filter(has);
let ok = parallel.length === 0 ? true : await runParallel(parallel);

if (ok && has('build') && args['no-build'] !== true) {
  ok = (await runSerial('build')).ok;
}
if (ok && has('e2e') && args['no-e2e'] !== true) {
  const r = await runSerial('e2e');
  ok = r.ok;
  const summary = parseE2eSummary(r.output);
  if (summary) counts.e2e = summary.passed ?? 0;
}

const total = Date.now() - t0;
console.log('');
console.log(bold(ok ? green('CI passed') : red('CI failed')));
console.log(`  unit tests passed: ${counts.unit}`);
console.log(`  e2e tests passed:  ${counts.e2e}`);
console.log(`  wall clock:        ${formatMs(total)}`);
process.exit(ok ? 0 : 1);
