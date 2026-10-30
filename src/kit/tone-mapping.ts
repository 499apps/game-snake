/**
 * Tone-mapping choice for the kit renderer. Pure, so unit tests do not load the composer.
 */
import * as THREE from 'three';

/** ACES Filmic: the default "cozy playroom" look. */
export const DEFAULT_TONE_MAPPING: THREE.ToneMapping = THREE.ACESFilmicToneMapping;

/** Tone mapping for these renderer options (Coloring passes Neutral for true paint colours). */
export function resolveToneMapping(o: { toneMapping?: THREE.ToneMapping }): THREE.ToneMapping {
  return o.toneMapping ?? DEFAULT_TONE_MAPPING;
}
