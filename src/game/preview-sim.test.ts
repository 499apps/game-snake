import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIRECTIONS, oppositeDirection, type Direction } from '../kit/input';
import { createRng } from '../kit/prng';
import { inBounds, sameCell } from './grid';
import {
  MAX_LENGTH,
  MAX_QUEUED_TURNS,
  START_LENGTH,
  advance,
  createPreviewState,
  queueTurn,
  type PreviewState,
} from './preview-sim';

type Step = { kind: 'turn'; dir: Direction } | { kind: 'tick' };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.constantFrom(...DIRECTIONS).map((dir) => ({ kind: 'turn' as const, dir })),
  fc.constant({ kind: 'tick' as const }),
);

function run(seed: number, script: readonly Step[]): PreviewState {
  const rng = createRng(seed);
  let s = createPreviewState(rng);
  for (const step of script) {
    if (step.kind === 'turn') s = queueTurn(s, step.dir);
    else s = advance(s, rng).state;
  }
  return s;
}

describe('preview simulation', () => {
  it('starts with a short snake and an apple off the body', () => {
    const s = createPreviewState(createRng(1));
    expect(s.body).toHaveLength(START_LENGTH);
    expect(s.body.some((c) => sameCell(c, s.apple))).toBe(false);
  });

  it('keeps every invariant for any input script (property)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(stepArb, { maxLength: 300 }), (seed, script) => {
        const rng = createRng(seed);
        let s = createPreviewState(rng);
        let prevDir = s.dir;
        for (const step of script) {
          if (step.kind === 'turn') {
            s = queueTurn(s, step.dir);
            expect(s.queued.length).toBeLessThanOrEqual(MAX_QUEUED_TURNS);
          } else {
            const r = advance(s, rng);
            expect(r.state.dir).not.toBe(oppositeDirection(prevDir));
            prevDir = r.state.dir;
            s = r.state;
          }
          expect(s.body.length).toBeGreaterThanOrEqual(START_LENGTH);
          expect(s.body.length).toBeLessThanOrEqual(MAX_LENGTH);
          for (const c of s.body) expect(inBounds(c, s.size)).toBe(true);
          expect(inBounds(s.apple, s.size)).toBe(true);
          expect(s.body.some((c) => sameCell(c, s.apple))).toBe(false);
        }
      }),
    );
  });

  it('replays identically from a seed and an input script (deterministic)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(stepArb, { maxLength: 200 }), (seed, script) => {
        expect(JSON.stringify(run(seed, script))).toBe(JSON.stringify(run(seed, script)));
      }),
    );
  });

  it('eats the apple, grows by one and places a new apple', () => {
    const rng = createRng(7);
    let s = createPreviewState(rng);
    const head = s.body[0];
    if (!head) throw new Error('no head');
    s = { ...s, apple: { x: (head.x + 1) % s.size, y: head.y } };
    const r = advance(s, rng);
    expect(r.ate).toBe(true);
    expect(r.state.eaten).toBe(1);
    expect(r.state.body).toHaveLength(START_LENGTH + 1);
    expect(r.state.body.some((c) => sameCell(c, r.state.apple))).toBe(false);
  });
});
