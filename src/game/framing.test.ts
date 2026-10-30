import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  boardPoints,
  fillFor,
  frameCamera,
  layoutInsets,
  pitchFor,
  usableInsets,
  type Insets,
} from './framing';

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

describe('phone layout (review S4)', () => {
  // The real tray: 11 cells, rim 0.32, margin 0.3 -> outer half 5.97; rim top 0.32, bottom -0.45.
  const tray = boardPoints(5.97, 0.32, -0.45, 0.75);
  // 390 x 844 phone: HUD pill row to y = 64, drawer button top-left (6..62, 10..66),
  // d-pad 204 px tall, 16 px above the bottom edge.
  const phone = {
    width: 390,
    height: 844,
    hudBottom: 64,
    toggle: { left: 6, top: 10, right: 62, bottom: 66 },
    dpad: { left: 92, top: 624, right: 298, bottom: 828 },
    safeRight: 0,
    safeBottom: 0,
  };

  function trayWidthPx(w: number, h: number, insets: Insets): number {
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    frameCamera(camera, w, h, {
      points: tray,
      target,
      pitch: pitchFor(w / h),
      insets,
      fill: fillFor(w / h),
    });
    const v = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of tray) {
      v.copy(p).project(camera);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
    }
    return ((maxX - minX) / 2) * w;
  }

  it('portrait: the drawer button only pushes the top edge down', () => {
    const ins = layoutInsets(phone);
    expect(ins.left).toBeLessThanOrEqual(6);
    expect(ins.right).toBeLessThanOrEqual(6);
    expect(ins.top).toBeGreaterThanOrEqual(phone.toggle.bottom);
    expect(ins.bottom).toBeGreaterThanOrEqual(phone.height - phone.dpad.top);
  });

  it('portrait: the board fills at least 90% of the phone width', () => {
    const width = trayWidthPx(phone.width, phone.height, layoutInsets(phone));
    expect(width / phone.width).toBeGreaterThanOrEqual(0.9);
    expect(width).toBeLessThanOrEqual(phone.width);
  });

  it('landscape: the drawer button and the d-pad push the sides', () => {
    const land = {
      ...phone,
      width: 844,
      height: 390,
      dpad: { left: 610, top: 170, right: 828, bottom: 374 },
    };
    const ins = layoutInsets(land);
    expect(ins.left).toBeGreaterThanOrEqual(land.toggle.right);
    expect(ins.right).toBeGreaterThanOrEqual(land.width - land.dpad.left);
  });

  it('keeps safe-area insets and works without a toggle or d-pad', () => {
    const ins = layoutInsets({ ...phone, toggle: null, dpad: null, safeRight: 20, safeBottom: 34 });
    expect(ins.right).toBeGreaterThanOrEqual(20);
    expect(ins.bottom).toBeGreaterThanOrEqual(34);
    expect(ins.top).toBe(phone.hudBottom + 6);
  });

  it('fills more in portrait than in landscape', () => {
    expect(fillFor(0.46)).toBeGreaterThan(fillFor(1.6));
  });
});
