/**
 * Preview simulation for the Snake scaffold (pure, seeded). The snake wraps at the edges and
 * never loses: it is a gentle placeholder until G2 builds the full rules.
 */
import type { Direction } from '../kit/input';
import type { Rng } from '../kit/prng';
import { sameCell, stepCell, turn, type Cell } from './grid';

export const BOARD_SIZE = 9;
export const START_LENGTH = 3;
export const MAX_LENGTH = 14;
export const MAX_QUEUED_TURNS = 2;

export interface PreviewState {
  size: number;
  /** Head first. */
  body: Cell[];
  dir: Direction;
  queued: Direction[];
  apple: Cell;
  eaten: number;
  tick: number;
}

/** A random free cell for the apple. The board always has a free cell (MAX_LENGTH < size^2). */
export function placeApple(body: readonly Cell[], size: number, rng: Rng): Cell {
  const free: Cell[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!body.some((c) => c.x === x && c.y === y)) free.push({ x, y });
    }
  }
  return rng.pick(free);
}

export function createPreviewState(rng: Rng, size = BOARD_SIZE): PreviewState {
  const mid = Math.floor(size / 2);
  const body: Cell[] = [];
  for (let i = 0; i < START_LENGTH; i++) body.push({ x: mid - i, y: mid });
  return { size, body, dir: 'right', queued: [], apple: placeApple(body, size, rng), eaten: 0, tick: 0 };
}

/** Queue a turn. Reversals and repeats (against the last queued heading) are ignored. */
export function queueTurn(s: PreviewState, requested: Direction): PreviewState {
  const last = s.queued.length > 0 ? (s.queued[s.queued.length - 1] as Direction) : s.dir;
  const next = turn(last, requested);
  if (next === last || s.queued.length >= MAX_QUEUED_TURNS) return s;
  return { ...s, queued: [...s.queued, next] };
}

export interface AdvanceResult {
  state: PreviewState;
  ate: boolean;
}

export function advance(s: PreviewState, rng: Rng): AdvanceResult {
  const [nextDir, ...rest] = s.queued;
  const dir = nextDir ?? s.dir;
  const head = s.body[0] as Cell;
  const newHead = stepCell(head, dir, s.size);
  const ate = sameCell(newHead, s.apple);
  const grow = ate && s.body.length < MAX_LENGTH;
  const body = [newHead, ...(grow ? s.body : s.body.slice(0, -1))];
  const apple = ate ? placeApple(body, s.size, rng) : s.apple;
  return {
    state: {
      ...s,
      body,
      dir,
      queued: rest,
      apple,
      eaten: s.eaten + (ate ? 1 : 0),
      tick: s.tick + 1,
    },
    ate,
  };
}
