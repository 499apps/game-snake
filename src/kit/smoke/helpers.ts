/**
 * Playwright smoke helpers shared by every repo: external-request guard, console guard,
 * readiness, service worker control, offline reload, canvas pixel checks, left-menu checks,
 * manifest validation, frame-time measurement and screenshot baselines.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { decodePng, imageStats, type ImageStats } from './png-decode';

interface G499TestWindow {
  __g499?: {
    ready?: boolean;
    step?: (frames: number) => void;
    idle?: () => Promise<void>;
    state?: () => unknown;
  };
}

export const STAGE_SELECTOR = 'canvas.g499-stage';

export interface PageGuard {
  /** Every request URL seen in the browser context. */
  readonly requests: string[];
  /** Requests to any origin other than the server under test. */
  readonly external: string[];
  /** console.error messages and uncaught page errors. */
  readonly consoleErrors: string[];
  /** Assert no external request, no console error, no cookie. */
  assertClean(): Promise<void>;
}

function isAllowedUrl(url: string, origin: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Record requests, console errors and page errors. Attach before the first navigation. */
export function guardPage(page: Page, context: BrowserContext, baseURL: string): PageGuard {
  const origin = new URL(baseURL).origin;
  const requests: string[] = [];
  const external: string[] = [];
  const consoleErrors: string[] = [];
  context.on('request', (req) => {
    const url = req.url();
    requests.push(url);
    if (!isAllowedUrl(url, origin)) external.push(url);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  return {
    requests,
    external,
    consoleErrors,
    async assertClean() {
      expect(external, 'requests to other hosts').toEqual([]);
      expect(consoleErrors, 'console errors').toEqual([]);
      expect(await context.cookies(), 'cookies').toEqual([]);
      if (!page.isClosed()) {
        expect(await page.evaluate(() => document.cookie), 'document.cookie').toBe('');
      }
    },
  };
}

/** Wait until the page called markReady() (after its first frame is drawn). */
export async function waitForReady(page: Page, timeout = 45_000): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-g499-ready', '1', { timeout });
}

/** True when the page started WebGL (data-g499-gl="1"). */
export async function hasWebgl(page: Page): Promise<boolean> {
  return (await page.getAttribute('html', 'data-g499-gl')) === '1';
}

/**
 * Advance the frozen test clock by a number of frames and wait until they are consumed and
 * drawn (the page draws on demand), plus one frame so the picture is on screen.
 */
export async function stepFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(async (n) => {
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const api = (window as unknown as G499TestWindow).__g499;
    api?.step?.(n);
    if (api?.idle) {
      await api.idle();
    } else {
      for (let i = 0; i < 4; i++) await nextFrame();
    }
    await nextFrame();
  }, frames);
}

/** Read the page's test state object (window.__g499.state()). */
export async function readState<T = Record<string, unknown>>(page: Page): Promise<T> {
  return (await page.evaluate(() => {
    const w = window as unknown as G499TestWindow;
    return w.__g499?.state ? w.__g499.state() : {};
  })) as T;
}

/** Pixel statistics of the stage canvas, from a real screenshot (works in every engine). */
export async function canvasStats(page: Page, selector = STAGE_SELECTOR): Promise<ImageStats> {
  await page.evaluate(async () => {
    const api = (window as unknown as G499TestWindow).__g499;
    if (api?.idle) await api.idle();
  });
  const shot = await page
    .locator(selector)
    .first()
    .screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
  return imageStats(decodePng(shot), 4);
}

/**
 * Assert the WebGL stage shows a real picture. When the engine has no WebGL on this host, only
 * this assertion is marked fixme (with the reason); the rest of the test still runs.
 */
export async function expectCanvasRendered(page: Page, testInfo: TestInfo): Promise<void> {
  if (!(await hasWebgl(page))) {
    testInfo.annotations.push({
      type: 'fixme',
      description: `WebGL is not available in ${testInfo.project.name} on this host; pixel check skipped.`,
    });
    await expect(page.locator('.g499-nogl')).toBeVisible();
    return;
  }
  await stepFrames(page, 2);
  const stats = await canvasStats(page);
  expect(stats.distinct, 'distinct colours in the canvas').toBeGreaterThanOrEqual(8);
  expect(stats.nonDominant, 'share of non-background pixels').toBeGreaterThan(0.05);
}

/**
 * Wait until a service worker controls the page. Reloads once when the first load stayed
 * uncontrolled. Returns false when the engine never hands control to the worker.
 */
export async function waitForServiceWorker(page: Page, timeout = 30_000): Promise<boolean> {
  const supported = await page.evaluate(() => 'serviceWorker' in navigator);
  if (!supported) return false;
  const ready = await page.evaluate(async (ms) => {
    const timer = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms));
    const reg = navigator.serviceWorker.ready.then(() => true);
    return Promise.race([reg, timer]);
  }, timeout);
  if (!ready) return false;
  const controlled = async (ms: number) => {
    try {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
        timeout: ms,
      });
      return true;
    } catch {
      return false;
    }
  };
  if (await controlled(10_000)) return true;
  await page.reload();
  await waitForReady(page);
  return controlled(10_000);
}

export interface SwInfo {
  controlled: boolean;
  scope: string | null;
  scriptURL: string | null;
}

export async function serviceWorkerInfo(page: Page): Promise<SwInfo> {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controlled: controller !== null,
      scope: reg ? new URL(reg.scope).pathname : null,
      scriptURL: controller ? new URL(controller.scriptURL).pathname : null,
    };
  });
}

/** Go offline and reload (or open another path) through the service worker. */
export async function reloadOffline(
  page: Page,
  context: BrowserContext,
  pathAndQuery?: string,
): Promise<void> {
  await context.setOffline(true);
  if (pathAndQuery) await page.goto(pathAndQuery);
  else await page.reload();
  await waitForReady(page);
}

async function press(locator: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await locator.tap();
  else await locator.click();
}

/**
 * Open and close the left menu and check it sits on the left: the rail or drawer box starts
 * left of one third of the viewport width. Phones use the left-edge drawer button.
 */
export async function checkLeftMenu(page: Page, hasTouch: boolean): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const vw = viewport ? viewport.width : 0;
  const toggle = page.locator('.g499-drawer-toggle');
  const rail = page.locator('nav.g499-rail');
  const drawerMode = await toggle.isVisible();
  if (drawerMode) {
    const tb = await toggle.boundingBox();
    expect(tb).not.toBeNull();
    if (tb) expect(tb.x).toBeLessThan(vw / 3);
    await press(toggle, hasTouch);
    await expect(rail).toHaveClass(/is-open/);
    await expect
      .poll(async () => (await rail.boundingBox())?.x ?? -9999, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(-1);
  } else {
    await expect(rail).toBeVisible();
  }
  const box = await rail.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeLessThan(vw / 3);
    expect(box.x + box.width).toBeLessThanOrEqual(vw * 0.9);
  }
  for (const id of ['home', 'mute', 'privacy', 'clear']) {
    await expect(page.locator(`[data-menu-id="${id}"]`)).toBeVisible();
  }
  // The mute toggle flips and persists under the g499: prefix. aria-pressed="true" means sound
  // on, so the stored mute flag is its opposite.
  const mute = page.locator('[data-menu-id="mute"]');
  const before = await mute.getAttribute('aria-pressed');
  expect(before === 'true' || before === 'false', 'mute aria-pressed').toBe(true);
  const after = before === 'true' ? 'false' : 'true';
  await press(mute, hasTouch);
  await expect(mute).toHaveAttribute('aria-pressed', after);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('g499:mute')), { timeout: 5_000 })
    .toBe(after === 'true' ? 'false' : 'true');
  if (drawerMode) {
    await press(page.locator('.g499-rail-close'), hasTouch);
    await expect(rail).not.toHaveClass(/is-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
}

/**
 * Hold-to-confirm "clear my data": a short press does nothing, a long hold wipes every g499: key
 * and leaves other keys alone. Uses the keyboard so it works the same in every engine.
 *
 * The short press runs inside the page: key down, a 250 ms page timer, key up. Measured on the
 * page clock, the release always comes before the 1200 ms hold timer, even when the main thread
 * is slow. (Timed from the test runner, a busy page can see the release late and confirm.)
 */
export async function checkClearData(page: Page, selector: string): Promise<void> {
  const button = page.locator(selector).first();
  await expect(button).toBeAttached();
  const seeded = await page.evaluate(() => {
    localStorage.setItem('g499:smoke', '"1"');
    localStorage.setItem('not-ours', 'keep');
    return localStorage.getItem('g499:smoke');
  });
  expect(seeded, 'seeded g499:smoke').toBe('"1"');

  // Short press: cancelled, nothing cleared.
  await page.evaluate(async (sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`no element ${sel}`);
    el.focus();
    const init: KeyboardEventInit = { code: 'Space', key: ' ', bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    await new Promise((resolve) => setTimeout(resolve, 250));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
  }, selector);
  await expect(button).not.toHaveClass(/is-holding/);
  // Wait past the hold time so a late confirm would show up.
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => localStorage.getItem('g499:smoke')), 'after a short press').toBe(
    '"1"',
  );

  // Long hold with the real keyboard: confirmed, g499 keys wiped, other keys kept.
  await button.focus();
  await page.keyboard.down('Space');
  // The key reached the button (is-done follows when the hold already completed).
  await expect(button).toHaveClass(/is-holding|is-done/);
  await page.waitForTimeout(1_600);
  await page.keyboard.up('Space');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('g499:smoke')), { timeout: 10_000 })
    .toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('not-ours'))).toBe('keep');
  await page.evaluate(() => localStorage.removeItem('not-ours'));
}

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/** Synthesise a touch swipe with pointer events (identical in every engine). */
export async function swipe(
  page: Page,
  direction: SwipeDirection,
  selector = STAGE_SELECTOR,
): Promise<void> {
  const d = 90;
  const delta = {
    up: { dx: 0, dy: -d },
    down: { dx: 0, dy: d },
    left: { dx: -d, dy: 0 },
    right: { dx: d, dy: 0 },
  }[direction];
  await page.evaluate(
    ({ sel, dx, dy }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element ${sel}`);
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width / 2;
      const y0 = r.top + r.height / 2;
      const base = {
        pointerId: 77,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
      };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x0, clientY: y0 }));
      for (let i = 1; i <= 6; i++) {
        el.dispatchEvent(
          new PointerEvent('pointermove', {
            ...base,
            clientX: x0 + (dx * i) / 6,
            clientY: y0 + (dy * i) / 6,
          }),
        );
      }
      el.dispatchEvent(
        new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x0 + dx, clientY: y0 + dy }),
      );
    },
    { sel: selector, dx: delta.dx, dy: delta.dy },
  );
}

/** Real touchscreen tap in the middle of the stage (needs a hasTouch context). */
export async function tapStage(page: Page, selector = STAGE_SELECTOR): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('stage has no box');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

export interface ManifestExpectation {
  /** Path of the expected scope, e.g. "/games/". */
  scope: string;
  /** Path of the expected start URL, e.g. "/games/". */
  startUrl: string;
}

interface ManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

/** Check the linked manifest: fields, scope, start URL, maskable 192/512 icons that load. */
export async function checkManifest(
  page: Page,
  request: APIRequestContext,
  expected: ManifestExpectation,
): Promise<void> {
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href ?? '', page.url());
  const res = await request.get(manifestUrl.toString());
  expect(res.status()).toBe(200);
  const data = (await res.json()) as Record<string, unknown>;
  expect(typeof data['name']).toBe('string');
  expect(typeof data['short_name']).toBe('string');
  expect(data['display']).toBe('standalone');
  expect(typeof data['theme_color']).toBe('string');
  expect(typeof data['background_color']).toBe('string');
  expect(new URL(String(data['start_url']), manifestUrl).pathname).toBe(expected.startUrl);
  expect(new URL(String(data['scope']), manifestUrl).pathname).toBe(expected.scope);
  const icons = (data['icons'] ?? []) as ManifestIcon[];
  for (const size of ['192x192', '512x512']) {
    const maskable = icons.find(
      (i) => i.sizes === size && (i.purpose ?? '').split(/\s+/).includes('maskable'),
    );
    expect(maskable, `maskable ${size} icon`).toBeTruthy();
  }
  for (const icon of icons) {
    const iconRes = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(iconRes.status(), icon.src).toBe(200);
    expect(iconRes.headers()['content-type'] ?? '').toContain('image/png');
  }
  const apple = page.locator('link[rel="apple-touch-icon"]');
  await expect(apple).toHaveCount(1);
}

/** Collect requestAnimationFrame deltas (ms) for a while. */
export async function measureFrameTimes(page: Page, durationMs = 2_000): Promise<number[]> {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = -1;
        const start = performance.now();
        const frame = (now: number) => {
          if (last >= 0) out.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame(frame);
      }),
    durationMs,
  );
}

/** True when the page's WebGL runs on a software rasteriser (SwiftShader, llvmpipe ...). */
export async function isSoftwareGl(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(
        ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
      return /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch {
      return true;
    }
  });
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Visual regression with committed baselines. When the baseline for this project and platform
 * is missing, it is written (CSS-pixel scale, same as toHaveScreenshot) and the test notes it.
 */
export async function expectScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  mask: Locator[] = [],
): Promise<void> {
  // A stable frozen frame: every queued step drawn, fonts loaded, then the shot.
  await page.evaluate(async () => {
    const api = (window as unknown as G499TestWindow).__g499;
    if (api?.idle) await api.idle();
    await document.fonts.ready;
  });
  const file = testInfo.snapshotPath(name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', scale: 'css', mask });
    testInfo.annotations.push({ type: 'baseline-created', description: file });
    return;
  }
  await expect(page).toHaveScreenshot(name, {
    mask,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
}
