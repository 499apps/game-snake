import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_TONE_MAPPING, resolveToneMapping } from './tone-mapping';

describe('tone mapping option', () => {
  it('defaults to ACES Filmic', () => {
    expect(DEFAULT_TONE_MAPPING).toBe(THREE.ACESFilmicToneMapping);
    expect(resolveToneMapping({})).toBe(THREE.ACESFilmicToneMapping);
  });

  it('uses the page choice when given', () => {
    expect(resolveToneMapping({ toneMapping: THREE.NeutralToneMapping })).toBe(THREE.NeutralToneMapping);
    expect(resolveToneMapping({ toneMapping: THREE.NoToneMapping })).toBe(THREE.NoToneMapping);
  });
});
