/**
 * Camera framing: fit a set of world points (the board) into the part of the screen that the HUD,
 * the left drawer button and the d-pad leave free. The camera looks at the target from a fixed
 * pitch; a binary search finds the closest distance that fits, then a lens shift (view offset)
 * centres the board in the free rectangle without changing the perspective.
 */
import * as THREE from 'three';

/** Screen space (CSS px) taken by overlays on each side of the canvas. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FrameOptions {
  /** World points that must stay in view. */
  points: readonly THREE.Vector3[];
  /** Point the camera looks at. */
  target: THREE.Vector3;
  /** Camera pitch down from the horizon, in radians. */
  pitch: number;
  insets: Insets;
  /** Share of the free rectangle the points may fill (default 0.94). */
  fill?: number;
}

export interface FrameResult {
  /** Distance from the target to the camera. */
  distance: number;
  /** Lens shift applied, in normalised device units. */
  shiftX: number;
  shiftY: number;
  /** The free rectangle in normalised device units. */
  rect: { left: number; right: number; top: number; bottom: number };
}

const scratch = new THREE.Vector3();

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  behind: boolean;
}

function projectBox(camera: THREE.PerspectiveCamera, points: readonly THREE.Vector3[]): Box {
  const box: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, behind: false };
  for (const p of points) {
    scratch.copy(p).applyMatrix4(camera.matrixWorldInverse);
    if (scratch.z > -camera.near) box.behind = true;
    scratch.applyMatrix4(camera.projectionMatrix);
    box.minX = Math.min(box.minX, scratch.x);
    box.maxX = Math.max(box.maxX, scratch.x);
    box.minY = Math.min(box.minY, scratch.y);
    box.maxY = Math.max(box.maxY, scratch.y);
  }
  return box;
}

/** Usable insets: when overlays leave too little room, ignore them on that axis. */
export function usableInsets(width: number, height: number, insets: Insets): Insets {
  const out = { ...insets };
  if (width - out.left - out.right < width * 0.4) {
    out.left = 0;
    out.right = 0;
  }
  if (height - out.top - out.bottom < height * 0.35) {
    out.top = 0;
    out.bottom = 0;
  }
  return out;
}

export function frameCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  o: FrameOptions,
): FrameResult {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  camera.aspect = w / h;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();

  const ins = usableInsets(w, h, o.insets);
  const rect = {
    left: (ins.left / w) * 2 - 1,
    right: ((w - ins.right) / w) * 2 - 1,
    top: 1 - (ins.top / h) * 2,
    bottom: 1 - ((h - ins.bottom) / h) * 2,
  };
  const fill = o.fill ?? 0.94;
  const maxW = (rect.right - rect.left) * fill;
  const maxH = (rect.top - rect.bottom) * fill;
  const dir = new THREE.Vector3(0, Math.sin(o.pitch), Math.cos(o.pitch));

  const place = (dist: number): Box => {
    camera.position.copy(o.target).addScaledVector(dir, dist);
    camera.lookAt(o.target);
    camera.updateMatrixWorld(true);
    return projectBox(camera, o.points);
  };
  const fits = (b: Box) => !b.behind && b.maxX - b.minX <= maxW && b.maxY - b.minY <= maxH;

  let lo = 0.5;
  let hi = 400;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(place(mid))) hi = mid;
    else lo = mid;
  }
  const box = place(hi);
  const shiftX = (rect.left + rect.right) / 2 - (box.minX + box.maxX) / 2;
  const shiftY = (rect.top + rect.bottom) / 2 - (box.minY + box.maxY) / 2;
  camera.setViewOffset(w, h, (-shiftX * w) / 2, (shiftY * h) / 2, w, h);
  camera.updateProjectionMatrix();
  return { distance: hi, shiftX, shiftY, rect };
}

/** Corners of a square board (top and bottom faces) plus head room above it. */
export function boardPoints(half: number, top: number, bottom: number, headroom: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [-half, half]) {
    for (const z of [-half, half]) {
      out.push(new THREE.Vector3(x, top, z));
      out.push(new THREE.Vector3(x, bottom, z));
      out.push(new THREE.Vector3(x, top + headroom, z));
    }
  }
  return out;
}

/** Steeper in portrait (the board fills the narrow width), a little lower in landscape. */
export function pitchFor(aspect: number): number {
  const t = THREE.MathUtils.clamp((aspect - 0.6) / (1.5 - 0.6), 0, 1);
  return THREE.MathUtils.degToRad(THREE.MathUtils.lerp(64, 54, t));
}
