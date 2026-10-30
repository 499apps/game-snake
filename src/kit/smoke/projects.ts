/**
 * Shared Playwright configuration: five projects (desktop Chromium, Firefox, WebKit, iPhone and
 * Pixel emulation), fully parallel, one web server, deterministic screenshot settings.
 *
 * Environment:
 *   E2E_PORT              port of the server under test
 *   E2E_EXTERNAL_SERVER=1 do not start a server (run-e2e.mjs already started one)
 *   E2E_WORKERS           workers per Playwright process (number or percentage, default 25%)
 *   E2E_BROWSERS          comma list of project names to run, e.g. "chromium,pixel"
 *   E2E_IPHONE_ENGINE     "chromium" runs the iPhone project on Chromium (when WebKit is missing)
 */
import { devices, type PlaywrightTestConfig, type Project } from '@playwright/test';

/** Software WebGL for headless Chromium (no GPU on CI hosts). */
export const CHROMIUM_GL_ARGS: readonly string[] = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

/** Hardware WebGL for the frame-time test: real frames need the host GPU, not a rasteriser. */
export function hardwareGlArgs(platform: string = process.platform): string[] {
  const angle = platform === 'win32' ? 'd3d11' : platform === 'darwin' ? 'metal' : 'gl';
  return ['--enable-gpu', `--use-angle=${angle}`, '--ignore-gpu-blocklist'];
}

/** E2E_WORKERS as Playwright expects it: a number ("4") or a percentage ("25%"). Default 25%. */
export function parseWorkers(raw: string | undefined): number | string {
  if (raw === undefined || raw.trim() === '') return '25%';
  const v = raw.trim();
  if (/^\d+%$/.test(v)) return v;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : '25%';
}

export type KitProjectName = 'chromium' | 'firefox' | 'webkit' | 'iphone' | 'pixel';

export const KIT_PROJECT_NAMES: readonly KitProjectName[] = [
  'chromium',
  'firefox',
  'webkit',
  'iphone',
  'pixel',
];

export function kitProjects(env: NodeJS.ProcessEnv = process.env): Project[] {
  const chromiumLaunch = { args: [...CHROMIUM_GL_ARGS] };
  const iphoneOnChromium = env['E2E_IPHONE_ENGINE'] === 'chromium';
  const all: Project[] = [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iphone',
      use: iphoneOnChromium
        ? { ...devices['iPhone 15'], browserName: 'chromium', launchOptions: chromiumLaunch }
        : { ...devices['iPhone 15'] },
    },
    {
      name: 'pixel',
      use: { ...devices['Pixel 7'], launchOptions: chromiumLaunch },
    },
  ];
  const wanted = (env['E2E_BROWSERS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (wanted.length === 0) return all;
  return all.filter((p) => wanted.includes(String(p.name)));
}

export interface KitPlaywrightOptions {
  testDir: string;
  testMatch?: string | RegExp | Array<string | RegExp>;
  /** Default port (E2E_PORT overrides). */
  port: number;
  /** Command that serves the build; "{port}" is replaced. Null means an external server. */
  serverCommand: string | null;
  /** Path that answers when the server is up, e.g. "/games/". */
  readyPath: string;
  /** Host name in the base URL (default "localhost"; the static server binds 127.0.0.1). */
  host?: string;
}

export function kitPlaywrightConfig(
  o: KitPlaywrightOptions,
  env: NodeJS.ProcessEnv = process.env,
): PlaywrightTestConfig {
  const port = Number(env['E2E_PORT'] ?? o.port);
  const external = env['E2E_EXTERNAL_SERVER'] === '1';
  const host = o.host ?? 'localhost';
  const config: PlaywrightTestConfig = {
    testDir: o.testDir,
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    workers: parseWorkers(env['E2E_WORKERS']),
    timeout: 90_000,
    expect: {
      timeout: 20_000,
      toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
    },
    // Baselines are committed per project and platform.
    // A missing baseline fails the run; create baselines on purpose with --update-snapshots.
    updateSnapshots: 'none',
    snapshotPathTemplate: '{testDir}/screenshots/{projectName}-{platform}/{arg}{ext}',
    reporter: [['list']],
    // Each concurrent shard needs its own output folder, or their artifacts collide.
    outputDir: env['E2E_SHARD'] ? `test-results/shard-${env['E2E_SHARD']}` : 'test-results',
    use: {
      baseURL: `http://${host}:${port}`,
      serviceWorkers: 'allow',
      trace: 'retain-on-failure',
    },
    projects: kitProjects(env),
  };
  if (o.testMatch !== undefined) config.testMatch = o.testMatch;
  if (!external && o.serverCommand) {
    config.webServer = {
      command: o.serverCommand.replace('{port}', String(port)),
      url: `http://${host}:${port}${o.readyPath}`,
      reuseExistingServer: true,
      timeout: 120_000,
    };
  }
  return config;
}
