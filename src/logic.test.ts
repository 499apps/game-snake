import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIRECTIONS, oppositeDirection, type Direction } from './kit/input';
import { createRng } from './kit/prng';
import { inBounds, sameCell, type Cell } from './game/grid';
import {
  BOARD_SIZE,
  COMBO_WINDOW,
  DEFAULT_MODE,
  GARDEN_BUSHES,
  MAX_COMBO,
  MAX_QUEUED_TURNS,
  MODES,
  MODE_RULES,
  START_LENGTH,
  bestKey,
  createState,
  freeCells,
  isMode,
  modeFromStored,
  nextCombo,
  nextHead,
  nextMode,
  placeBushes,
  placeFood,
  queueTurn,
  replay,
  runFixedSteps,
  sanitizeBest,
  start,
  step,
  stepInterval,
  type Mode,
  type SnakeState,
} from './logic';

type Op = { kind: 'turn'; dir: Direction } | { kind: 'tick' };

const dirArb = fc.constantFrom(...DIRECTIONS);
const modeArb = fc.constantFrom(...MODES);
const opArb: fc.Arbitrary<Op> = fc.oneof(
  dirArb.map((dir) => ({ kind: 'turn' as const, dir })),
  fc.constant({ kind: 'tick' as const }),
  fc.constant({ kind: 'tick' as const }),
);

function playing(over: Partial<SnakeState> = {}, mode: Mode = 'normal'): SnakeState {
  return { ...start(createState(createRng(1), mode)), ...over };
}

/** Two cells touch (one step apart), across the edge when the board wraps. */
function adjacent(a: Cell, b: Cell, size: number, wrap: boolean): boolean {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (wrap) {
    dx = Math.min(dx, size - dx);
    dy = Math.min(dy, size - dy);
  }
  return dx + dy === 1;
}

describe('createState', () => {
  it('starts ready, short, facing right, with food off the body', () => {
    const s = createState(createRng(3));
    expect(s.phase).toBe('ready');
    expect(s.size).toBe(BOARD_SIZE);
    expect(s.body).toHaveLength(START_LENGTH);
    expect(s.dir).toBe('right');
    expect(s.food).not.toBeNull();
    expect(s.body.some((c) => s.food !== null && sameCell(c, s.food))).toBe(false);
    expect(s.score).toBe(0);
  });

  it('does not move before start', () => {
    const s = createState(createRng(3));
    const r = step(s, createRng(3));
    expect(r.state).toBe(s);
    expect(r.ended).toBe(false);
  });

  it('start only leaves the ready phase', () => {
    const s = createState(createRng(3));
    expect(start(s).phase).toBe('playing');
    const over = { ...s, phase: 'over' as const };
    expect(start(over)).toBe(over);
  });
});

describe('modes', () => {
  it('cycles through every mode', () => {
    expect(nextMode('easy')).toBe('normal');
    expect(nextMode('normal')).toBe('fast');
    expect(nextMode('fast')).toBe('easy');
  });

  it('recognises modes', () => {
    for (const m of MODES) expect(isMode(m)).toBe(true);
    for (const v of ['', 'hard', 1, null, undefined]) expect(isMode(v)).toBe(false);
  });

  it('starts a first run in Easy (walls wrap), and keeps a stored choice', () => {
    expect(DEFAULT_MODE).toBe('easy');
    expect(MODE_RULES[DEFAULT_MODE].wrap).toBe(true);
    for (const v of [null, undefined, '', 'hard', 3, {}]) expect(modeFromStored(v)).toBe('easy');
    for (const m of MODES) expect(modeFromStored(m)).toBe(m);
  });

  it('easy is slower than normal, fast is quicker', () => {
    expect(stepInterval('easy', 0)).toBeGreaterThan(stepInterval('normal', 0));
    expect(stepInterval('fast', 0)).toBeLessThan(stepInterval('normal', 0));
    expect(MODE_RULES.easy.wrap).toBe(true);
    expect(MODE_RULES.normal.wrap).toBe(false);
    expect(MODE_RULES.fast.wrap).toBe(false);
  });

  it('speeds up with meals but never past the floor (property)', () => {
    fc.assert(
      fc.property(modeArb, fc.nat(500), (mode, eaten) => {
        const a = stepInterval(mode, eaten);
        const b = stepInterval(mode, eaten + 1);
        expect(b).toBeLessThanOrEqual(a);
        expect(a).toBeGreaterThanOrEqual(MODE_RULES[mode].minStep);
        expect(a).toBeLessThanOrEqual(MODE_RULES[mode].step);
      }),
    );
  });
});

describe('queueTurn (input buffering)', () => {
  it('buffers up to two turns and drops the third', () => {
    let s = playing();
    s = queueTurn(s, 'up');
    s = queueTurn(s, 'left');
    s = queueTurn(s, 'down');
    expect(s.queued).toEqual(['up', 'left']);
  });

  it('ignores a reversal and a repeat', () => {
    const s = playing();
    expect(queueTurn(s, 'left').queued).toEqual([]);
    expect(queueTurn(s, 'right').queued).toEqual([]);
    const up = queueTurn(s, 'up');
    expect(queueTurn(up, 'down').queued).toEqual(['up']);
    expect(queueTurn(up, 'up').queued).toEqual(['up']);
  });

  it('lets a quick double turn make a U-turn over two steps', () => {
    const rng = createRng(5);
    let s = playing({ food: { x: 0, y: 0 } });
    s = queueTurn(queueTurn(s, 'up'), 'left');
    s = step(s, rng).state;
    expect(s.dir).toBe('up');
    s = step(s, rng).state;
    expect(s.dir).toBe('left');
    expect(s.phase).toBe('playing');
  });

  it('is ignored after the round ends', () => {
    const s = playing({ phase: 'over' });
    expect(queueTurn(s, 'up')).toBe(s);
  });

  it('never queues more than the limit or a reversal (property)', () => {
    fc.assert(
      fc.property(fc.array(dirArb, { maxLength: 12 }), (dirs) => {
        let s = playing();
        for (const d of dirs) s = queueTurn(s, d);
        expect(s.queued.length).toBeLessThanOrEqual(MAX_QUEUED_TURNS);
        let prev = s.dir;
        for (const q of s.queued) {
          expect(q).not.toBe(oppositeDirection(prev));
          expect(q).not.toBe(prev);
          prev = q;
        }
      }),
    );
  });
});

describe('step', () => {
  it('moves one cell and keeps the length', () => {
    const s = playing({ food: { x: 0, y: 0 } });
    const r = step(s, createRng(1));
    expect(r.state.body[0]).toEqual({ x: 6, y: 5 });
    expect(r.state.body).toHaveLength(START_LENGTH);
    expect(r.state.tick).toBe(1);
    expect(r.ate).toBeNull();
  });

  it('eats, grows by one, scores and places new food off the body', () => {
    const s = playing({ food: { x: 6, y: 5 } });
    const r = step(s, createRng(1));
    expect(r.ate).toEqual({ x: 6, y: 5 });
    expect(r.state.eaten).toBe(1);
    expect(r.state.body).toHaveLength(START_LENGTH + 1);
    expect(r.state.combo).toBe(1);
    expect(r.points).toBe(MODE_RULES.normal.points);
    expect(r.state.score).toBe(MODE_RULES.normal.points);
    const food = r.state.food;
    expect(food).not.toBeNull();
    if (food) expect(r.state.body.some((c) => sameCell(c, food))).toBe(false);
  });

  it('ends the round gently at a wall in normal and fast modes', () => {
    for (const mode of ['normal', 'fast'] as const) {
      const body = [
        { x: 10, y: 5 },
        { x: 9, y: 5 },
        { x: 8, y: 5 },
      ];
      const s = playing({ body, food: { x: 0, y: 0 }, mode });
      const r = step(s, createRng(1));
      expect(r.ended).toBe(true);
      expect(r.state.phase).toBe('over');
      expect(r.state.cause).toBe('wall');
      // The snake stays where it was.
      expect(r.state.body).toEqual(body);
      // Nothing moves after the end.
      expect(step(r.state, createRng(1)).state).toBe(r.state);
    }
  });

  it('wraps around the edges in easy mode', () => {
    const body = [
      { x: 10, y: 5 },
      { x: 9, y: 5 },
      { x: 8, y: 5 },
    ];
    const s = playing({ body, food: { x: 3, y: 3 } }, 'easy');
    const r = step(s, createRng(1));
    expect(r.state.phase).toBe('playing');
    expect(r.state.body[0]).toEqual({ x: 0, y: 5 });
  });

  it('ends the round when the head meets the body', () => {
    // A hook shape: the head turns down into its own body.
    const body = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
    ];
    const s = playing({ body, dir: 'left', queued: ['down'], food: { x: 0, y: 0 } });
    const r = step(s, createRng(1));
    expect(r.state.phase).toBe('over');
    expect(r.state.cause).toBe('self');
  });

  it('may move into the cell the tail leaves', () => {
    // A tight square: the head follows the tail.
    const body = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    const s = playing({ body, dir: 'left', queued: ['down'], food: { x: 0, y: 0 } });
    const r = step(s, createRng(1));
    expect(r.state.phase).toBe('playing');
    expect(r.state.body[0]).toEqual({ x: 5, y: 6 });
  });

  it('ends with a win when the snake fills the board', () => {
    // 2x2 board: three cells of snake, the food in the last one.
    const s: SnakeState = {
      ...playing(),
      size: 2,
      body: [
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      dir: 'down',
      queued: ['right'],
      food: { x: 1, y: 1 },
    };
    const r = step(s, createRng(1));
    expect(r.ate).toEqual({ x: 1, y: 1 });
    expect(r.state.phase).toBe('over');
    expect(r.state.cause).toBe('full');
    expect(r.state.food).toBeNull();
    expect(r.ended).toBe(true);
  });

  it('nextHead leaves the board only without wrap', () => {
    expect(nextHead({ x: 0, y: 0 }, 'up', 5, false)).toEqual({ x: 0, y: -1 });
    expect(nextHead({ x: 0, y: 0 }, 'up', 5, true)).toEqual({ x: 0, y: 4 });
  });
});

describe('combo and score', () => {
  it('raises the combo for quick meals and resets after a slow one', () => {
    expect(nextCombo(0, -1, 5)).toBe(1);
    expect(nextCombo(1, 10, 10 + COMBO_WINDOW)).toBe(2);
    expect(nextCombo(2, 10, 11 + COMBO_WINDOW)).toBe(1);
    expect(nextCombo(MAX_COMBO, 10, 12)).toBe(MAX_COMBO);
  });

  it('multiplies the points by the combo', () => {
    const rng = createRng(1);
    let s = playing({ food: { x: 6, y: 5 } });
    s = step(s, rng).state;
    s = { ...s, food: { x: 8, y: 5 } };
    s = step(s, rng).state;
    const r = step(s, rng);
    expect(r.state.combo).toBe(2);
    expect(r.points).toBe(MODE_RULES.normal.points * 2);
    expect(r.state.score).toBe(MODE_RULES.normal.points * 3);
  });
});

describe('food placement', () => {
  it('never puts food on the snake (property)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 2, max: 8 }),
        fc.array(fc.nat(63), { maxLength: 64 }),
        (seed, size, picks) => {
          const body = picks.map((p) => ({ x: p % size, y: Math.floor(p / size) % size }));
          const food = placeFood(body, size, createRng(seed));
          const free = freeCells(body, size);
          if (free.length === 0) {
            expect(food).toBeNull();
          } else {
            expect(food).not.toBeNull();
            if (food) {
              expect(inBounds(food, size)).toBe(true);
              expect(body.some((c) => sameCell(c, food))).toBe(false);
            }
          }
        },
      ),
    );
  });

  it('lists free cells exactly', () => {
    const free = freeCells([{ x: 0, y: 0 }], 2);
    expect(free).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});

describe('invariants (property)', () => {
  it('holds for any mode, seed and input script', () => {
    fc.assert(
      fc.property(modeArb, fc.integer(), fc.array(opArb, { maxLength: 400 }), (mode, seed, ops) => {
        const rng = createRng(seed);
        const wrap = MODE_RULES[mode].wrap;
        let s = start(createState(rng, mode));
        for (const op of ops) {
          if (op.kind === 'turn') {
            s = queueTurn(s, op.dir);
            continue;
          }
          const before = s;
          const r = step(s, rng);
          s = r.state;
          if (before.phase === 'playing') {
            expect(s.dir).not.toBe(oppositeDirection(before.dir));
            expect(s.tick).toBe(before.tick + 1);
          }
          expect(s.queued.length).toBeLessThanOrEqual(MAX_QUEUED_TURNS);
          expect(s.body.length).toBe(START_LENGTH + s.eaten);
          expect(s.score).toBeGreaterThanOrEqual(s.eaten * MODE_RULES[mode].points);
          const keys = new Set(s.body.map((c) => `${c.x},${c.y}`));
          expect(keys.size).toBe(s.body.length);
          for (const c of s.body) expect(inBounds(c, s.size)).toBe(true);
          for (let i = 1; i < s.body.length; i++) {
            expect(adjacent(s.body[i - 1] as Cell, s.body[i] as Cell, s.size, wrap)).toBe(true);
          }
          const food = s.food;
          if (food) expect(s.body.some((c) => sameCell(c, food))).toBe(false);
          if (wrap) expect(s.cause).not.toBe('wall');
          if (s.phase === 'over') break;
        }
      }),
    );
  });
});

describe('garden boards', () => {
  const touches = (a: Cell, b: Cell) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

  it('places seeded bushes away from the edges, the start rows and each other (property)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const s = createState(createRng(seed), 'easy', BOARD_SIZE, { garden: true });
        const mid = Math.floor(BOARD_SIZE / 2);
        expect(s.bushes).toHaveLength(GARDEN_BUSHES);
        for (const b of s.bushes) {
          expect(b.x).toBeGreaterThan(0);
          expect(b.y).toBeGreaterThan(0);
          expect(b.x).toBeLessThan(BOARD_SIZE - 1);
          expect(b.y).toBeLessThan(BOARD_SIZE - 1);
          expect(Math.abs(b.y - mid)).toBeGreaterThan(1);
          expect(s.body.some((c) => sameCell(c, b))).toBe(false);
          const food = s.food;
          if (food) expect(sameCell(food, b)).toBe(false);
        }
        for (let i = 0; i < s.bushes.length; i++) {
          for (let j = i + 1; j < s.bushes.length; j++) {
            expect(touches(s.bushes[i] as Cell, s.bushes[j] as Cell)).toBe(false);
          }
        }
        // Same seed, same garden.
        const again = createState(createRng(seed), 'easy', BOARD_SIZE, { garden: true });
        expect(again.bushes).toEqual(s.bushes);
      }),
    );
  });

  it('plain boards have no bushes and draw the same food as before', () => {
    const plain = createState(createRng(7), 'normal');
    expect(plain.bushes).toEqual([]);
    expect(placeBushes(createRng(7), BOARD_SIZE, 0)).toEqual([]);
  });

  it('a bush is a gentle stop, like a wall', () => {
    const bush = { x: Math.floor(BOARD_SIZE / 2) + 1, y: Math.floor(BOARD_SIZE / 2) };
    const s = playing({ bushes: [bush], food: { x: 0, y: 0 } }, 'easy');
    const r = step(s, createRng(1));
    expect(r.ended).toBe(true);
    expect(r.state.phase).toBe('over');
    expect(r.state.cause).toBe('bush');
    expect(r.state.body).toEqual(s.body);
  });

  it('never places food on a bush, and the snake never enters one (property)', () => {
    fc.assert(
      fc.property(modeArb, fc.integer(), fc.array(opArb, { maxLength: 300 }), (mode, seed, ops) => {
        const rng = createRng(seed);
        let s = start(createState(rng, mode, BOARD_SIZE, { garden: true }));
        for (const op of ops) {
          if (op.kind === 'turn') {
            s = queueTurn(s, op.dir);
            continue;
          }
          s = step(s, rng).state;
          const food = s.food;
          for (const b of s.bushes) {
            if (food) expect(sameCell(food, b)).toBe(false);
            expect(s.body.some((c) => sameCell(c, b))).toBe(false);
          }
          if (s.phase === 'over') break;
        }
      }),
    );
  });

  it('replays a garden round identically from a seed and a script', () => {
    const turns = [
      { at: 1, dir: 'up' as const },
      { at: 3, dir: 'right' as const },
    ];
    const a = replay(createRng(42), 'easy', turns, 30, BOARD_SIZE, { garden: true });
    const b = replay(createRng(42), 'easy', turns, 30, BOARD_SIZE, { garden: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('deterministic replay', () => {
  const turnArb = fc.record({ at: fc.nat(120), dir: dirArb });

  it('replays identically from a seed and an input script (property)', () => {
    fc.assert(
      fc.property(modeArb, fc.integer(), fc.array(turnArb, { maxLength: 40 }), (mode, seed, turns) => {
        const a = replay(createRng(seed), mode, turns, 150);
        const b = replay(createRng(seed), mode, turns, 150);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
    );
  });

  it('a known script reaches a known state', () => {
    const turns = [
      { at: 2, dir: 'up' as const },
      { at: 4, dir: 'left' as const },
      { at: 6, dir: 'down' as const },
    ];
    const s = replay(createRng(499), 'easy', turns, 10);
    expect(s.tick).toBe(10);
    expect(s.dir).toBe('down');
    expect(s.phase).toBe('playing');
  });
});

describe('runFixedSteps', () => {
  it('keeps time exactly: steps * interval + rest = total (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 0.05, noNaN: true }), { maxLength: 200 }),
        fc.double({ min: 0.05, max: 0.3, noNaN: true }),
        (dts, interval) => {
          let acc = 0;
          let steps = 0;
          let total = 0;
          for (const dt of dts) {
            total += dt;
            acc = runFixedSteps(acc, dt, () => interval, () => {
              steps++;
              return true;
            });
          }
          expect(acc).toBeGreaterThanOrEqual(0);
          expect(acc).toBeLessThan(interval);
          expect(steps * interval + acc).toBeCloseTo(total, 6);
        },
      ),
    );
  });

  it('stops when a step ends the round', () => {
    let steps = 0;
    const acc = runFixedSteps(0, 1, () => 0.1, () => ++steps < 2);
    expect(steps).toBe(2);
    expect(acc).toBe(0);
  });

  it('caps the steps per frame and drops the backlog', () => {
    let steps = 0;
    const acc = runFixedSteps(0, 5, () => 0.1, () => {
      steps++;
      return true;
    });
    expect(steps).toBe(4);
    expect(acc).toBeLessThan(0.1);
  });

  it('ignores bad frame times', () => {
    expect(runFixedSteps(0.05, Number.NaN, () => 0.1, () => true)).toBeCloseTo(0.05);
    expect(runFixedSteps(0.05, -1, () => 0.1, () => true)).toBeCloseTo(0.05);
  });
});

describe('best scores', () => {
  it('uses one key per mode', () => {
    expect(new Set(MODES.map((m) => bestKey(m))).size).toBe(MODES.length);
    expect(bestKey('fast')).toBe('snake:best:fast');
  });

  it('keeps a separate best for garden boards', () => {
    const keys = [...MODES.map((m) => bestKey(m)), ...MODES.map((m) => bestKey(m, true))];
    expect(new Set(keys).size).toBe(MODES.length * 2);
    expect(bestKey('easy', true)).toBe('snake:best:easy:garden');
  });

  it('reads stored values safely', () => {
    expect(sanitizeBest(42)).toBe(42);
    expect(sanitizeBest(4.7)).toBe(4);
    for (const bad of [-1, Number.NaN, Infinity, '10', null, undefined, {}]) {
      expect(sanitizeBest(bad)).toBe(0);
    }
  });

  it('round-trips through JSON like the kit storage does (property)', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        expect(sanitizeBest(JSON.parse(JSON.stringify(n)))).toBe(n);
      }),
    );
  });
});
