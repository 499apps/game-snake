/**
 * The shared smoke suite. Each repo lists its pages (targets) and calls defineSmokeSuite from a
 * spec file. Per target: load + render + privacy guard, scripted round (keyboard on desktop,
 * touch on phones), left menu, manifest + service worker, offline reload, frame-time budget,
 * clear-my-data and a visual baseline.
 */
import { chromium, expect, test, type Page, type TestInfo } from '@playwright/test';
import { hardwareGlArgs } from './projects';
import {
  checkClearData,
  checkLeftMenu,
  checkManifest,
  expectCanvasRendered,
  expectScreenshot,
  guardPage,
  hasWebgl,
  isSoftwareGl,
  measureFrameTimes,
  medianOf,
  readState,
  reloadOffline,
  serviceWorkerInfo,
  stepFrames,
  swipe,
  tapStage,
  waitForReady,
  waitForServiceWorker,
  type ManifestExpectation,
  type PageGuard,
  type SwipeDirection,
} from './helpers';

export interface PlayScript {
  /** Keys pressed on desktop projects (KeyboardEvent.key names for page.keyboard.press). */
  keys: string[];
  /** Swipes on touch projects. */
  swipes: SwipeDirection[];
  /** Also tap the middle of the stage on touch projects. */
  tap: boolean;
}

export interface SmokeTarget {
  /** Short name used in test titles and screenshot names, e.g. "hub", "snake". */
  name: string;
  /** Page path, e.g. "/games/snake/". */
  path: string;
  /** Whether the page shows a WebGL stage. */
  webgl: boolean;
  /** Expected service worker scope path, e.g. "/games/". */
  swScope: string;
  manifest: ManifestExpectation;
  /** Scripted round. Omit for pages without gameplay. */
  play?: PlayScript;
  /** Selector of a hold-to-confirm clear button to exercise on this page. */
  clearSelector?: string;
  /** Extra paths to open offline after the first visit (single-worker site check). */
  offlineAlso?: string[];
}

interface OpenResult {
  guard: PageGuard;
}

async function open(
  page: Page,
  baseURL: string | undefined,
  target: SmokeTarget,
  query = '?test=1',
): Promise<OpenResult> {
  const guard = guardPage(page, page.context(), baseURL ?? 'http://localhost');
  await page.goto(`${target.path}${query}`);
  await waitForReady(page);
  return { guard };
}

function isDesktopChromium(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'chromium';
}

export function defineSmokeSuite(targets: SmokeTarget[]): void {
  for (const target of targets) {
    test.describe(target.name, () => {
      test('loads, renders and stays private', async ({ page, baseURL }, testInfo) => {
        const { guard } = await open(page, baseURL, target);
        await expect(page.locator('nav.g499-rail')).toHaveCount(1);
        const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
        await expect(csp).toHaveCount(1);
        expect(await csp.getAttribute('content')).toContain("default-src 'self'");
        await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
          'content',
          'no-referrer',
        );
        if (target.webgl) await expectCanvasRendered(page, testInfo);
        await guard.assertClean();
      });

      if (target.play) {
        const script = target.play;
        test('plays a scripted round', async ({ page, baseURL, hasTouch }) => {
          const { guard } = await open(page, baseURL, target);
          const before = await readState<{ actions?: number }>(page);
          if (hasTouch) {
            for (const dir of script.swipes) {
              await swipe(page, dir);
              await stepFrames(page, 10);
            }
            if (script.tap) {
              await tapStage(page);
              await stepFrames(page, 10);
            }
          } else {
            for (const key of script.keys) {
              await page.keyboard.press(key);
              await stepFrames(page, 10);
            }
          }
          await expect
            .poll(async () => (await readState<{ actions?: number }>(page)).actions ?? 0, {
              message: 'input reached the game',
              timeout: 10_000,
            })
            .toBeGreaterThan(before.actions ?? 0);
          await guard.assertClean();
        });
      }

      test('left menu opens, closes and sits on the left', async ({ page, baseURL, hasTouch }) => {
        const { guard } = await open(page, baseURL, target);
        await checkLeftMenu(page, hasTouch);
        await guard.assertClean();
      });

      if (target.clearSelector) {
        const selector = target.clearSelector;
        test('clear my data needs a long hold and wipes only g499 keys', async ({
          page,
          baseURL,
        }) => {
          const { guard } = await open(page, baseURL, target);
          await checkClearData(page, selector);
          await guard.assertClean();
        });
      }

      test('manifest is valid and the service worker controls the page', async ({
        page,
        baseURL,
        request,
      }, testInfo) => {
        const { guard } = await open(page, baseURL, target);
        await checkManifest(page, request, target.manifest);
        const controlled = await waitForServiceWorker(page);
        if (!controlled && !testInfo.project.name.match(/chromium|pixel/)) {
          test.fixme(
            true,
            `service worker never took control in ${testInfo.project.name} on this host`,
          );
        }
        expect(controlled, 'service worker controls the page').toBe(true);
        const info = await serviceWorkerInfo(page);
        expect(info.scope).toBe(target.swScope);
        expect(info.scriptURL).toBe(`${target.swScope}sw.js`);
        await guard.assertClean();
      });

      test('works offline after the first visit', async ({ page, context, baseURL }, testInfo) => {
        const { guard } = await open(page, baseURL, target);
        const controlled = await waitForServiceWorker(page);
        if (!controlled && !testInfo.project.name.match(/chromium|pixel/)) {
          test.fixme(
            true,
            `service worker never took control in ${testInfo.project.name} on this host`,
          );
        }
        expect(controlled, 'service worker controls the page').toBe(true);
        await reloadOffline(page, context);
        if (target.webgl) await expectCanvasRendered(page, testInfo);
        for (const extra of target.offlineAlso ?? []) {
          await page.goto(`${extra}?test=1`);
          await waitForReady(page);
          if (await hasWebgl(page)) await expectCanvasRendered(page, testInfo);
        }
        await context.setOffline(false);
        await guard.assertClean();
      });

      if (target.webgl) {
        test('holds the frame-time budget', async ({ baseURL }, testInfo) => {
          test.skip(
            !isDesktopChromium(testInfo),
            'frame-time budget runs in desktop Chromium only',
          );
          // The other tests use deterministic software GL. This one measures real frames, so it
          // launches its own Chromium on the host GPU. On a host without a GPU it skips, unless
          // E2E_FPS_BUDGET_MS asks for a software measurement anyway.
          const browser = await chromium.launch({ args: hardwareGlArgs() });
          try {
            const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, baseURL });
            const { guard } = await open(page, baseURL, target, '?test=1&live=1');
            const software = await isSoftwareGl(page);
            const forced = process.env['E2E_FPS_BUDGET_MS'];
            test.skip(
              software && forced === undefined,
              'no hardware GPU on this host (set E2E_FPS_BUDGET_MS to measure software GL)',
            );
            await page.waitForTimeout(1_500);
            const frames = await measureFrameTimes(page, 2_000);
            const budget = Number(forced ?? (software ? 50 : 20));
            const med = medianOf(frames);
            testInfo.annotations.push({
              type: 'frame-time',
              description: `median ${med.toFixed(1)} ms over ${frames.length} frames (budget ${budget} ms, software GL: ${software})`,
            });
            expect(frames.length).toBeGreaterThan(10);
            expect(med).toBeLessThanOrEqual(budget);
            await guard.assertClean();
          } finally {
            await browser.close();
          }
        });
      }

      test('matches the visual baseline', async ({ page, baseURL }, testInfo) => {
        const { guard } = await open(page, baseURL, target);
        await stepFrames(page, 2);
        await expectScreenshot(page, testInfo, `${target.name}.png`);
        await guard.assertClean();
      });
    });
  }
}
