import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIRECTIONS, type Direction } from './kit/input';
import { createRng } from './kit/prng';
import { GameController, RESTART_DELAY } from './controller';
import { MODES, stepInterval } from './logic';

const FRAME = 1 / 60;

function frames(c: GameController, n: number): void {
  for (let i = 0; i < n; i++) c.update(FRAME);
}

describe('GameController', () => {
  it('switches garden boards on and off with a fresh ready round', () => {
    let resets = 0;
    const c = new GameController(createRng(1), 'easy', { onReset: () => resets++ });
    expect(c.garden).toBe(false);
    expect(c.state.bushes).toEqual([]);
    c.primary();
    c.setGarden(true);
    expect(resets).toBe(1);
    expect(c.garden).toBe(true);
    expect(c.state.phase).toBe('ready');
    expect(c.state.bushes.length).toBeGreaterThan(0);
    c.reset();
    expect(c.state.bushes.length).toBeGreaterThan(0);
    c.setGarden(false);
    expect(c.state.bushes).toEqual([]);
    const g = new GameController(createRng(1), 'easy', {}, undefined, { garden: true });
    expect(g.state.bushes.length).toBeGreaterThan(0);
  });

  it('waits in the ready phase until started', () => {
    const c = new GameController(createRng(1), 'normal');
    frames(c, 120);
    expect(c.state.phase).toBe('ready');
    expect(c.state.tick).toBe(0);
    expect(c.primary()).toBe('start');
    frames(c, Math.ceil(stepInterval('normal', 0) / FRAME) + 1);
    expect(c.state.tick).toBe(1);
  });

  it('starts on the first steer and queues the turn', () => {
    const turns: Direction[] = [];
    const c = new GameController(createRng(1), 'normal', { onTurn: (d) => turns.push(d) });
    expect(c.steer('up')).toBe(true);
    expect(c.state.phase).toBe('playing');
    expect(turns).toEqual(['up']);
    frames(c, 12);
    expect(c.state.dir).toBe('up');
  });

  it('pauses and resumes; nothing moves while paused', () => {
    const paused: boolean[] = [];
    const c = new GameController(createRng(1), 'normal', { onPause: (p) => paused.push(p) });
    c.primary();
    expect(c.primary()).toBe('pause');
    const tick = c.state.tick;
    frames(c, 300);
    expect(c.state.tick).toBe(tick);
    expect(c.alpha).toBe(0);
    expect(c.primary()).toBe('resume');
    frames(c, 60);
    expect(c.state.tick).toBeGreaterThan(tick);
    expect(paused).toEqual([true, false]);
  });

  it('a steer resumes a paused round', () => {
    const c = new GameController(createRng(1), 'normal');
    c.primary();
    c.setPaused(true);
    c.steer('down');
    expect(c.paused).toBe(false);
  });

  it('ends at a wall, waits a moment, then a tap plays again', () => {
    let ended = 0;
    const c = new GameController(createRng(1), 'normal', { onEnd: () => ended++ });
    c.primary();
    // Straight right from the middle of an 11 wide board: the wall comes after 6 steps.
    frames(c, 60 * 3);
    expect(c.state.phase).toBe('over');
    expect(c.state.cause).toBe('wall');
    expect(ended).toBe(1);
    expect(c.alpha).toBe(1);
    expect(c.prevBody).toEqual(c.state.body);
    c.endedFor = 0;
    expect(c.primary()).toBe('wait');
    frames(c, Math.ceil(RESTART_DELAY / FRAME) + 1);
    expect(c.primary()).toBe('restart');
    expect(c.state.phase).toBe('playing');
    expect(c.state.score).toBe(0);
  });

  it('keeps alpha in [0, 1] and interpolates from the last body (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MODES),
        fc.integer(),
        fc.array(fc.oneof(fc.constantFrom(...DIRECTIONS), fc.constant(null)), { maxLength: 200 }),
        (mode, seed, script) => {
          let steps = 0;
          const c = new GameController(createRng(seed), mode, {
            onStep: (prev, s) => {
              steps++;
              expect(prev.length === s.body.length || prev.length === s.body.length - 1).toBe(true);
            },
          });
          c.primary();
          for (const d of script) {
            if (d) c.steer(d);
            c.update(FRAME * 3);
            expect(c.alpha).toBeGreaterThanOrEqual(0);
            expect(c.alpha).toBeLessThanOrEqual(1);
          }
          expect(steps).toBe(c.state.tick);
        },
      ),
    );
  });

  it('reset can switch the mode', () => {
    const c = new GameController(createRng(1), 'normal');
    c.reset('easy');
    expect(c.mode).toBe('easy');
    expect(c.state.phase).toBe('ready');
  });
});
