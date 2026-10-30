/**
 * Board glow levels (pure, unit tested). The meal flash lights the rim and a small ring at the
 * eaten cell; the grid itself stays below the bloom threshold, so the snake and the next food
 * never disappear in a mint wash (review S1).
 */

/** Snake page bloom threshold (main.ts). Rest values stay below it. */
export const SNAKE_BLOOM_THRESHOLD = 1.05;
/** Largest bloom boost during a meal flash (x1.15). */
export const MAX_BLOOM_PULSE = 1.15;

/** Grid colour multiplier: `glow` 1 is normal, lower dims (asleep, paused). Capped at 1. */
export function gridLevel(glow: number): number {
  return 0.35 + 0.55 * Math.min(1, Math.max(0, glow));
}

/** Grid opacity for the same glow value. */
export function gridOpacity(glow: number): number {
  return 0.35 + 0.25 * Math.min(1, Math.max(0, glow));
}

/** Rim emissive intensity: base glow plus the meal flash (0..1, already scaled by motion). */
export function rimLevel(glow: number, flash: number): number {
  return 0.25 + 0.35 * Math.max(0, glow) + 0.45 * Math.min(1, Math.max(0, flash));
}

/** Bloom strength factor during a meal flash; 1 with reduced motion. */
export function bloomPulse(eatPulse: number, motion: number): number {
  const e = Math.min(1, Math.max(0, eatPulse));
  return 1 + (MAX_BLOOM_PULSE - 1) * e * (motion > 0 ? 1 : 0);
}

export interface RingLook {
  /** Ring scale (1 = one cell). */
  scale: number;
  opacity: number;
}

/**
 * The ring at the eaten cell: it grows from one cell to about two and fades out. With reduced
 * motion it stays one cell wide and only fades.
 */
export function ringLook(flash: number, motion: number): RingLook {
  const f = Math.min(1, Math.max(0, flash));
  return { scale: 1 + (1 - f) * 0.9 * (motion > 0 ? 1 : 0), opacity: 0.85 * f };
}
