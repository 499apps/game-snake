/**
 * Food: a glossy apple, a sparkling gem and a berry cluster take turns. Each bobs, spins and pops
 * in with a springy overshoot, over a soft additive glow on the board.
 */
import * as THREE from 'three';
import { candyMaterial, easeOutBack } from '../kit/scene-helpers';
import { mixHex, palette } from '../kit/theme';

export type FoodKind = 'apple' | 'gem' | 'berry';
export const FOOD_KINDS: readonly FoodKind[] = ['apple', 'gem', 'berry'];
/** A deeper blue than palette.sky: the pastel gem read as a white blob under bloom (review S3). */
export const GEM_COLOR = '#3d8bfd';
/** A deep violet: the pastel lavender berry read as a white blob (S10). */
export const BERRY_COLOR = '#8f5bf0';
export const FOOD_COLORS: Readonly<Record<FoodKind, string>> = {
  apple: palette.coral,
  gem: GEM_COLOR,
  berry: BERRY_COLOR,
};

/** The food kind for the n-th meal (a fixed rotation, no randomness). */
export function foodKindFor(eaten: number): FoodKind {
  return FOOD_KINDS[((eaten % FOOD_KINDS.length) + FOOD_KINDS.length) % FOOD_KINDS.length] as FoodKind;
}

/** A radial glow sprite generated in code (no image files). */
export function makeGlowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - half, y - half) / half;
      const a = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function apple(): THREE.Group {
  const g = new THREE.Group();
  const fruit = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 30, 22),
    candyMaterial(palette.coral, { emissive: palette.coral, emissiveIntensity: 0.45 }),
  );
  fruit.scale.set(1.05, 0.95, 1.05);
  fruit.castShadow = true;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.034, 0.17, 10),
    candyMaterial(mixHex(palette.tangerine, palette.ink, 0.55), { roughness: 0.5 }),
  );
  stem.position.y = 0.3;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), candyMaterial(palette.lime));
  leaf.scale.set(1.6, 0.32, 0.8);
  leaf.position.set(0.11, 0.33, 0);
  leaf.rotation.z = -0.45;
  g.add(fruit, stem, leaf);
  return g;
}

function gem(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: GEM_COLOR,
    emissive: new THREE.Color(GEM_COLOR),
    emissiveIntensity: 0.2,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    flatShading: true,
    envMapIntensity: 0.6,
  });
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
  stone.scale.set(1, 1.3, 1);
  stone.castShadow = true;
  g.add(stone);
  return g;
}

function berry(): THREE.Group {
  const g = new THREE.Group();
  const mat = candyMaterial(BERRY_COLOR, { emissive: BERRY_COLOR, emissiveIntensity: 0.15 });
  mat.envMapIntensity = 0.5;
  const geo = new THREE.SphereGeometry(0.17, 22, 16);
  const spots: Array<[number, number, number]> = [
    [-0.12, -0.04, 0.06],
    [0.12, -0.04, 0.06],
    [0, -0.04, -0.13],
    [0, 0.13, 0],
  ];
  for (const [x, y, z] of spots) {
    const b = new THREE.Mesh(geo, mat);
    b.position.set(x, y, z);
    b.castShadow = true;
    g.add(b);
  }
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), candyMaterial(palette.mint));
  leaf.scale.set(1.5, 0.3, 0.9);
  leaf.position.set(0.05, 0.3, 0);
  leaf.rotation.z = -0.4;
  g.add(leaf);
  return g;
}

export class Food {
  readonly group = new THREE.Group();
  private readonly holder = new THREE.Group();
  private readonly models: Record<FoodKind, THREE.Group>;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private kindNow: FoodKind = 'apple';
  /** 0..1 progress of the pop-in. */
  private spawn = 1;

  constructor(glowTexture: THREE.Texture) {
    this.models = { apple: apple(), gem: gem(), berry: berry() };
    for (const k of FOOD_KINDS) this.holder.add(this.models[k]);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: FOOD_COLORS.apple,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), this.glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.11;
    this.glow.renderOrder = 2;
    this.group.add(this.holder, this.glow);
    this.setKind('apple');
  }

  get kind(): FoodKind {
    return this.kindNow;
  }

  setKind(k: FoodKind): void {
    this.kindNow = k;
    for (const key of FOOD_KINDS) this.models[key].visible = key === k;
    this.glowMat.color.set(FOOD_COLORS[k]);
  }

  /** Move to a board position; animate the pop-in when `pop` is set. */
  place(x: number, z: number, pop: boolean): void {
    this.group.position.set(x, 0, z);
    this.spawn = pop ? 0 : 1;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** `motion` is 0 with reduced motion (no bob, spin or pulse), 1 otherwise. */
  update(dt: number, t: number, motion: number): void {
    this.spawn = Math.min(1, this.spawn + dt / 0.45);
    const pop = this.spawn >= 1 ? 1 : Math.max(0.001, easeOutBack(this.spawn));
    this.holder.scale.setScalar(pop);
    this.holder.position.y = 0.46 + Math.sin(t * 2.6) * 0.08 * motion;
    const spin = this.kindNow === 'gem' ? 1.8 : 1.1;
    this.holder.rotation.y = t * spin * motion + (this.kindNow === 'gem' ? 0.4 : 0);
    this.glowMat.opacity = (0.6 + Math.sin(t * 3.1) * 0.12 * motion) * Math.min(1, pop);
  }
}
