/**
 * Seeded pseudo-random numbers (mulberry32). All game randomness goes through here so that
 * a seed plus an input script replays identically.
 */

export interface Rng {
  /** The normalised 32-bit seed this generator started from. */
  readonly seed: number;
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element. Throws on an empty list. */
  pick<T>(list: readonly T[]): T;
  /** Shuffle a copy of the list (Fisher-Yates). */
  shuffle<T>(list: readonly T[]): T[];
  /** Current internal state; feed it to createRng to continue the same stream. */
  state(): number;
}

/** Hash any seed (string or number) into an unsigned 32-bit integer (xmur3 for strings). */
export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) return 1;
    return Math.floor(seed) >>> 0;
  }
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number | string = 1): Rng {
  const start = hashSeed(seed);
  let a = start;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    seed: start,
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(list) {
      if (list.length === 0) throw new Error('pick: empty list');
      return list[Math.floor(next() * list.length)] as (typeof list)[number];
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[j] as (typeof out)[number];
        out[j] = tmp;
      }
      return out;
    },
    state() {
      return a;
    },
  };
  return rng;
}
