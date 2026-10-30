/**
 * Scene building blocks shared by every game: studio lights, candy materials, easing.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { lighting, palette } from './theme';

export interface StudioLights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  fill: THREE.PointLight;
  /** Lights that cast shadows; the renderer toggles castShadow per quality tier. */
  shadowLights: THREE.DirectionalLight[];
  group: THREE.Group;
}

export interface StudioLightOptions {
  shadows?: boolean;
  shadowMapSize?: number;
  /** Half-size of the area covered by the key light shadow camera. */
  shadowArea?: number;
}

export function addStudioLights(scene: THREE.Scene, o: StudioLightOptions = {}): StudioLights {
  const group = new THREE.Group();
  group.name = 'studio-lights';
  const hemi = new THREE.HemisphereLight(
    lighting.hemisphereSky,
    lighting.hemisphereGround,
    lighting.hemisphereIntensity,
  );
  const key = new THREE.DirectionalLight(lighting.keyColor, lighting.keyIntensity);
  key.position.set(...lighting.keyPosition);
  key.castShadow = o.shadows ?? true;
  const size = o.shadowMapSize ?? 1024;
  key.shadow.mapSize.set(size, size);
  const area = o.shadowArea ?? 12;
  key.shadow.camera.left = -area;
  key.shadow.camera.right = area;
  key.shadow.camera.top = area;
  key.shadow.camera.bottom = -area;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;

  const rim = new THREE.DirectionalLight(lighting.rimColor, lighting.rimIntensity);
  rim.position.set(...lighting.rimPosition);

  const fill = new THREE.PointLight(lighting.fillColor, lighting.fillIntensity, 30, 2);
  fill.position.set(...lighting.fillPosition);

  group.add(hemi, key, key.target, rim, fill);
  scene.add(group);
  return { hemi, key, rim, fill, shadowLights: [key], group };
}

export interface CandyOptions {
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
}

/** Glossy toy plastic. */
export function candyMaterial(
  color: THREE.ColorRepresentation,
  o: CandyOptions = {},
): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: o.roughness ?? 0.32,
    metalness: 0,
    clearcoat: o.clearcoat ?? 1,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.08,
    // Sheen adds a white rim and costs GPU time; opt in per material.
    sheen: o.sheen ?? 0,
    sheenColor: new THREE.Color(palette.white),
    envMapIntensity: 0.9,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 0.4;
  }
  return m;
}

/** Soft matte (floors, walls, rugs). */
export function matteMaterial(
  color: THREE.ColorRepresentation,
  roughness = 0.85,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: 0.35 });
}

export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.2,
  segments = 4,
): RoundedBoxGeometry {
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

export interface RoomOptions {
  floorColor?: THREE.ColorRepresentation;
  wallColor?: THREE.ColorRepresentation;
  rugColor?: THREE.ColorRepresentation;
  size?: number;
}

/** A cozy playroom backdrop: floor, back wall, round rug. */
export function makeRoom(scene: THREE.Scene, o: RoomOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room';
  const size = o.size ?? 60;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshPhysicalMaterial({
      color: o.floorColor ?? palette.plum,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.5,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), matteMaterial(o.wallColor ?? palette.night));
  wall.position.set(0, size / 4, -size / 4);
  wall.receiveShadow = true;
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(size / 9, 48),
    matteMaterial(o.rugColor ?? palette.coral, 0.95),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  rug.receiveShadow = true;
  group.add(floor, wall, rug);
  scene.add(group);
  return group;
}

/** Dispose geometries, materials and textures below an object. */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(m: THREE.Material): void {
  const anyMat = m as unknown as Record<string, unknown>;
  for (const key of Object.keys(anyMat)) {
    const v = anyMat[key];
    if (v && typeof v === 'object' && v instanceof THREE.Texture) v.dispose();
  }
  m.dispose();
}

// Easing + math helpers (pure).
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutElastic = (t: number): number => {
  const x = clamp(t, 0, 1);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
};
/** Frame-rate independent smoothing toward a target. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Squash and stretch scale for a bounce: s = 1 at rest. */
export function squash(amount: number): THREE.Vector3 {
  const a = clamp(amount, -0.6, 0.6);
  return new THREE.Vector3(1 + a, 1 - a, 1 + a);
}
