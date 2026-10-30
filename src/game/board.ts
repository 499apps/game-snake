/**
 * The play board: a chunky glossy tray with deep indigo tiles, neon grid lines and a glowing rim.
 * The rim is tall and pink when walls stop the snake, low and sky blue when the edges wrap.
 * Dark tiles keep the bright snake and food readable (no washed-out board on phones).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { candyMaterial, roundedBox } from '../kit/scene-helpers';
import { mixHex, palette } from '../kit/theme';

/** Height of the tile tops (the surface the snake rests on). */
export const TILE_TOP = 0.1;
/** Bottom of the tray. */
export const BOARD_BOTTOM = -0.45;
const RIM = 0.32;

export class Board {
  readonly group = new THREE.Group();
  /** Half the playable width: cells span [-half, half]. */
  readonly half: number;
  /** Half the width of the whole tray (for camera framing). */
  readonly outerHalf: number;
  /** Height of the rim top. */
  readonly rimTop = TILE_TOP + 0.22;
  private readonly rimMat: THREE.MeshPhysicalMaterial;
  private readonly rim: THREE.Group;
  private readonly gridMat: THREE.MeshBasicMaterial;
  private readonly gridBase = new THREE.Color();
  private wrap = false;

  constructor(size: number) {
    this.half = size / 2;
    const outer = size + RIM * 2 + 0.3;
    this.outerHalf = outer / 2;

    const tray = new THREE.Mesh(
      roundedBox(outer, 0.5, outer, 0.24, 3),
      candyMaterial(mixHex(palette.plum, palette.lavender, 0.3), { roughness: 0.35 }),
    );
    tray.position.y = BOARD_BOTTOM + 0.25;
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.group.add(tray);

    // Tiles: standard material (cheaper than physical), low reflections so they never wash out.
    const tileMat = new THREE.MeshStandardMaterial({
      color: palette.white,
      roughness: 0.32,
      metalness: 0,
      envMapIntensity: 0.4,
    });
    const tiles = new THREE.InstancedMesh(roundedBox(0.93, 0.12, 0.93, 0.04, 1), tileMat, size * size);
    const m = new THREE.Matrix4();
    const a = new THREE.Color(mixHex(palette.night, palette.plum, 0.55));
    const b = new THREE.Color(mixHex(palette.night, palette.lavender, 0.16));
    const h = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        m.makeTranslation(x - h, TILE_TOP - 0.06, y - h);
        tiles.setMatrixAt(i, m);
        tiles.setColorAt(i, (x + y) % 2 === 0 ? a : b);
      }
    }
    tiles.receiveShadow = true;
    this.group.add(tiles);

    // Neon grid: thin flat strips over the tile seams (bright enough to bloom).
    const strips: THREE.BufferGeometry[] = [];
    const width = 0.035;
    for (let k = 1; k < size; k++) {
      const p = -this.half + k;
      const gx = new THREE.PlaneGeometry(width, size);
      gx.rotateX(-Math.PI / 2);
      gx.translate(p, TILE_TOP + 0.004, 0);
      const gz = new THREE.PlaneGeometry(size, width);
      gz.rotateX(-Math.PI / 2);
      gz.translate(0, TILE_TOP + 0.004, p);
      strips.push(gx, gz);
    }
    const gridGeo = mergeGeometries(strips);
    for (const s of strips) s.dispose();
    this.gridMat = new THREE.MeshBasicMaterial({
      color: palette.mint,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.gridBase.set(palette.mint);
    if (gridGeo) {
      const grid = new THREE.Mesh(gridGeo, this.gridMat);
      grid.renderOrder = 1;
      this.group.add(grid);
    }

    // Rim: four rounded rails with a glowing top.
    this.rimMat = candyMaterial(palette.bubblegum, {
      emissive: palette.bubblegum,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    });
    this.rim = new THREE.Group();
    const len = size + RIM * 2;
    const off = this.half + RIM / 2;
    const railX = roundedBox(len, 0.34, RIM, 0.12, 2);
    const railZ = roundedBox(RIM, 0.34, len, 0.12, 2);
    const rails: Array<[THREE.BufferGeometry, number, number]> = [
      [railX, 0, -off],
      [railX, 0, off],
      [railZ, -off, 0],
      [railZ, off, 0],
    ];
    for (const [geo, x, z] of rails) {
      const rail = new THREE.Mesh(geo, this.rimMat);
      rail.position.set(x, TILE_TOP + 0.05, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.rim.add(rail);
    }
    this.group.add(this.rim);
    this.setWrap(false);
  }

  /** Walls (tall pink rim) or wrap-around edges (low sky-blue rim). */
  setWrap(wrap: boolean): void {
    this.wrap = wrap;
    const c = wrap ? palette.sky : palette.bubblegum;
    this.rimMat.color.set(c);
    this.rimMat.emissive.set(c);
    this.rim.scale.y = wrap ? 0.45 : 1;
  }

  get wraps(): boolean {
    return this.wrap;
  }

  /**
   * Neon strength: `glow` 1 is normal, lower dims the grid (asleep), higher flashes it (a meal).
   * Values above 1 push the colour past the bloom threshold.
   */
  setGlow(glow: number): void {
    this.gridMat.color.copy(this.gridBase).multiplyScalar(0.6 + glow * 1.6);
    this.gridMat.opacity = 0.35 + 0.25 * Math.min(1.5, glow);
    this.rimMat.emissiveIntensity = 0.25 + 0.35 * glow;
  }
}

/** A few toy blocks and balls on the rug around the board (fixed layout, no randomness). */
export function makeToys(half: number): THREE.Group {
  const g = new THREE.Group();
  const colors = [palette.lemon, palette.sky, palette.coral, palette.mint, palette.tangerine];
  const blocks: Array<[number, number, number, number]> = [
    [-half - 2.2, -half + 0.6, 0.2, 0],
    [-half - 1.6, -half - 0.6, -0.4, 1],
    [half + 2.0, -half + 1.4, 0.5, 2],
    [half + 2.4, half - 0.8, -0.2, 3],
    [-half - 2.1, half - 1.2, 0.8, 4],
  ];
  const geo = roundedBox(0.9, 0.9, 0.9, 0.14, 3);
  blocks.forEach(([x, z, rot, ci]) => {
    const block = new THREE.Mesh(geo, candyMaterial(colors[ci] as string, { roughness: 0.3 }));
    block.position.set(x, BOARD_BOTTOM + 0.45, z);
    block.rotation.y = rot;
    block.castShadow = true;
    block.receiveShadow = true;
    g.add(block);
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 28, 20),
    candyMaterial(palette.bubblegum, { roughness: 0.22 }),
  );
  ball.position.set(half + 1.8, BOARD_BOTTOM + 0.55, half + 0.9);
  ball.castShadow = true;
  g.add(ball);
  return g;
}
