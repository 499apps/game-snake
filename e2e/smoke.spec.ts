import { expect, test, type Page } from '@playwright/test';
import {
  guardPage,
  hasWebgl,
  readState,
  stepFrames,
  swipe,
  tapStage,
  waitForReady,
  type SwipeDirection,
} from '../src/kit/smoke/helpers';
import { defineSmokeSuite } from '../src/kit/smoke/suite';

defineSmokeSuite([
  {
    name: 'snake',
    path: '/games/snake/',
    webgl: true,
    swScope: '/games/snake/',
    manifest: { scope: '/games/snake/', startUrl: '/games/snake/' },
    // ArrowUp / swipe up starts the round heading up, then a left turn; Space / tap pauses.
    play: { keys: ['ArrowUp', 'ArrowLeft', 'Space'], swipes: ['up', 'left'], tap: true },
    clearSelector: '[data-menu-id="clear"]',
  },
]);

interface SnakeTestState {
  actions: number;
  phase: 'ready' | 'playing' | 'over';
  dir: SwipeDirection;
  queued: number;
  head: { x: number; y: number } | null;
  food: { x: number; y: number } | null;
  score: number;
  eaten: number;
  tick: number;
  paused: boolean;
  stepFrames: number;
}

const KEYS: Record<SwipeDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const OPPOSITE: Record<SwipeDirection, SwipeDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** Greedy steering toward the food that never reverses (the board is 11 x 11, centre 5). */
function towardFood(s: SnakeTestState): SwipeDirection | null {
  if (!s.head || !s.food) return null;
  const dx = s.food.x - s.head.x;
  const dy = s.food.y - s.head.y;
  const wants: SwipeDirection[] = [];
  const h: SwipeDirection | null = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
  const v: SwipeDirection | null = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
  if (Math.abs(dx) >= Math.abs(dy)) wants.push(...[h, v].filter((d): d is SwipeDirection => d !== null));
  else wants.push(...[v, h].filter((d): d is SwipeDirection => d !== null));
  // Food straight behind: side-step toward the middle of the board first.
  wants.push(s.head.y > 5 ? 'up' : 'down', s.head.x > 5 ? 'left' : 'right');
  return wants.find((d) => d !== OPPOSITE[s.dir]) ?? null;
}

async function steer(page: Page, hasTouch: boolean, dir: SwipeDirection): Promise<void> {
  if (hasTouch) await swipe(page, dir);
  else await page.keyboard.press(KEYS[dir]);
}

async function renders(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = (window as unknown as { __g499?: { renders?: () => number } }).__g499;
    return api?.renders ? api.renders() : 0;
  });
}

test.describe('snake round', () => {
  test('starts, glides, eats and scores with no errors', async ({ page, baseURL, hasTouch }) => {
    const guard = guardPage(page, page.context(), baseURL ?? 'http://localhost');
    await page.goto('/games/snake/?test=1');
    await waitForReady(page);
    test.fixme(
      !(await hasWebgl(page)),
      'WebGL is not available in this engine on this host, so the game loop does not run',
    );
    let s = await readState<SnakeTestState>(page);
    expect(s.phase).toBe('ready');
    expect(s.score).toBe(0);
    const framesBefore = await renders(page);

    // Start: tap on phones, Space on desktop.
    if (hasTouch) await tapStage(page);
    else await page.keyboard.press('Space');
    await stepFrames(page, s.stepFrames * 2 + 2);
    s = await readState<SnakeTestState>(page);
    expect(s.phase).toBe('playing');
    expect(s.tick).toBeGreaterThan(0);

    // Steer to the food. At most one step happens per loop (stepFrames < one step), so every
    // decision sees the latest head position.
    for (let i = 0; i < 80 && s.eaten === 0; i++) {
      const dir = towardFood(s);
      if (dir && dir !== s.dir && s.queued === 0) await steer(page, hasTouch, dir);
      await stepFrames(page, s.stepFrames);
      s = await readState<SnakeTestState>(page);
      expect(s.phase, 'the snake is still playing').toBe('playing');
    }
    expect(s.eaten, 'food eaten').toBeGreaterThan(0);
    expect(s.score).toBeGreaterThan(0);
    await expect(page.locator('#score')).toHaveText(String(s.score));
    expect(await renders(page)).toBeGreaterThan(framesBefore);

    // Pause holds the snake still.
    await page.keyboard.press('KeyP');
    await stepFrames(page, 2);
    s = await readState<SnakeTestState>(page);
    expect(s.paused).toBe(true);
    await expect(page.locator('#pause')).toBeVisible();
    const tick = s.tick;
    await stepFrames(page, 60);
    expect((await readState<SnakeTestState>(page)).tick).toBe(tick);

    await guard.assertClean();
  });
});
