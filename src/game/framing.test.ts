import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boardPoints, frameCamera, pitchFor, usableInsets, type Insets } from './framing';

const points = boardPoints(6, 0.3, -0.45, 1);
const target = new THREE.Vector3(0, 0, 0);

function projected(camera: THREE.PerspectiveCamera) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const v = new THREE.Vector3();
  for (const p of points) {
    v.copy(p).project(camera);
    box.minX = Math.min(box.minX, v.x);
    box.maxX = Math.max(box.maxX, v.x);
    box.minY = Math.min(box.minY, v.y);
    box.maxY = Math.max(box.maxY, v.y);
  }
  return box;
}

const cases: Array<{ name: string; w: number; h: number; insets: Insets }> = [
  { name: 'phone portrait', w: 393, h: 659, insets: { top: 64, right: 12, bottom: 236, left: 66 } },
  { name: 'phone landscape', w: 852, h: 393, insets: { top: 60, right: 230, bottom: 12, left: 12 } },
  { name: 'desktop', w: 1208, h: 720, insets: { top: 64, right: 12, bottom: 12, left: 12 } },
];

describe('frameCamera', () => {
  for (const c of cases) {
    it(`fits and centres the board in the free rectangle (${c.name})`, () => {
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      const r = frameCamera(camera, c.w, c.h, {
        points,
        target,
        pitch: pitchFor(c.w / c.h),
        insets: c.insets,
      });
      const box = projected(camera);
      const eps = 1e-3;
      expect(box.minX).toBeGreaterThanOrEqual(r.rect.left - eps);
      expect(box.maxX).toBeLessThanOrEqual(r.rect.right + eps);
      expect(box.minY).toBeGreaterThanOrEqual(r.rect.bottom - eps);
      expect(box.maxY).toBeLessThanOrEqual(r.rect.top + eps);
      // Centred in the free rectangle.
      expect((box.minX + box.maxX) / 2).toBeCloseTo((r.rect.left + r.rect.right) / 2, 3);
      expect((box.minY + box.maxY) / 2).toBeCloseTo((r.rect.top + r.rect.bottom) / 2, 3);
      // Big: the board fills the limiting side (no large empty band).
      const fillW = (box.maxX - box.minX) / (r.rect.right - r.rect.left);
      const fillH = (box.maxY - box.minY) / (r.rect.top - r.rect.bottom);
      expect(Math.max(fillW, fillH)).toBeGreaterThan(0.9);
    });
  }

  it('ignores insets that leave too little room', () => {
    const ins = usableInsets(400, 300, { top: 120, right: 150, bottom: 120, left: 150 });
    expect(ins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('uses a steeper pitch in portrait', () => {
    expect(pitchFor(0.5)).toBeGreaterThan(pitchFor(1.8));
  });
});
