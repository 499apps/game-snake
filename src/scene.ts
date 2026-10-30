/**
 * Snake scaffold scene: a glossy toy board on a playroom rug, a candy snake that glides from
 * cell to cell and a bobbing apple. G2 replaces this with the full game.
 */
import * as THREE from 'three';
import type { Direction } from './kit/input';
import { ParticleSystem } from './kit/particles';
import type { Rng } from './kit/prng';
import type { KitRenderer } from './kit/renderer';
import {
  addStudioLights,
  candyMaterial,
  damp,
  makeRoom,
  roundedBox,
} from './kit/scene-helpers';
import { mixHex, palette } from './kit/theme';
import { MAX_LENGTH, advance, createPreviewState, queueTurn, type PreviewState } from './game/preview-sim';
import type { Cell } from './game/grid';

/** Seconds per board step. */
const STEP = 0.18;

export interface SnakeSceneOptions {
  reducedMotion: boolean;
  onEat?: (eaten: number) => void;
}

export class SnakeScene {
  private readonly kit: KitRenderer;
  private readonly rng: Rng;
  private readonly reduced: boolean;
  private readonly onEat: ((eaten: number) => void) | undefined;
  private sim: PreviewState;
  private prevBody: Cell[];
  private acc = 0;
  private hop = 0;
  private pop = 0;
  private paused = false;
  private readonly board = new THREE.Group();
  private readonly segments: THREE.Mesh[] = [];
  private readonly head = new THREE.Group();
  private readonly apple = new THREE.Group();
  private readonly particles: ParticleSystem;
  private readonly lookTarget = new THREE.Vector3(0, 0, 0.4);

  constructor(kit: KitRenderer, rng: Rng, o: SnakeSceneOptions) {
    this.kit = kit;
    this.rng = rng;
    this.reduced = o.reducedMotion;
    this.onEat = o.onEat;
    this.sim = createPreviewState(rng);
    this.prevBody = this.sim.body.map((c) => ({ ...c }));
    const scene = kit.scene;

    const lights = addStudioLights(scene, { shadowArea: 9, shadowMapSize: kit.settings.shadowMapSize });
    lights.key.castShadow = kit.settings.shadows;
    kit.shadowLights.push(lights.key);
    const room = makeRoom(scene, {
      floorColor: mixHex(palette.plum, palette.night, 0.2),
      wallColor: mixHex(palette.night, palette.plum, 0.4),
      rugColor: mixHex(palette.mint, palette.plum, 0.55),
    });
    room.position.set(0, -0.45, 6);

    this.buildBoard();
    this.buildSnake();
    this.buildApple();
    scene.add(this.board);

    this.particles = new ParticleSystem(rng, { max: 120, particleScale: kit.settings.particleScale });
    scene.add(this.particles.mesh);
    this.syncInstant();
  }

  private toWorld(c: Cell, out: THREE.Vector3): THREE.Vector3 {
    const half = (this.sim.size - 1) / 2;
    return out.set(c.x - half, 0.32, c.y - half);
  }

  private buildBoard(): void {
    const n = this.sim.size;
    const base = new THREE.Mesh(
      roundedBox(n + 0.8, 0.45, n + 0.8, 0.22, 4),
      candyMaterial(mixHex(palette.plum, palette.lavender, 0.25), { roughness: 0.4 }),
    );
    base.position.y = -0.2;
    base.receiveShadow = true;
    base.castShadow = true;
    this.board.add(base);
    const tiles = new THREE.InstancedMesh(
      roundedBox(0.92, 0.12, 0.92, 0.05, 2),
      candyMaterial(palette.white, { roughness: 0.35, clearcoat: 0.7 }),
      n * n,
    );
    const m = new THREE.Matrix4();
    const a = new THREE.Color(mixHex(palette.mint, palette.night, 0.15));
    const b = new THREE.Color(mixHex(palette.lime, palette.night, 0.25));
    const half = (n - 1) / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        m.makeTranslation(x - half, 0.06, y - half);
        tiles.setMatrixAt(i, m);
        tiles.setColorAt(i, (x + y) % 2 === 0 ? a : b);
      }
    }
    tiles.receiveShadow = true;
    this.board.add(tiles);
  }

  private buildSnake(): void {
    const bodyMat = candyMaterial(palette.lime, { emissive: palette.mint, emissiveIntensity: 0.08 });
    const geo = new THREE.SphereGeometry(0.36, 28, 20);
    for (let i = 0; i < MAX_LENGTH; i++) {
      const seg = new THREE.Mesh(geo, bodyMat);
      seg.castShadow = true;
      seg.visible = false;
      this.segments.push(seg);
      this.board.add(seg);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.44, 32, 24), bodyMat);
    skull.scale.set(1, 0.85, 1.1);
    skull.castShadow = true;
    this.head.add(skull);
    const white = candyMaterial(palette.white, { roughness: 0.2 });
    const ink = candyMaterial(palette.ink, { roughness: 0.1 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), white);
      eye.position.set(side * 0.2, 0.22, 0.26);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), ink);
      pupil.position.set(side * 0.2, 0.24, 0.38);
      this.head.add(eye, pupil);
    }
    const cheekMat = candyMaterial(palette.bubblegum, { roughness: 0.5 });
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), cheekMat);
      cheek.position.set(side * 0.3, 0.02, 0.3);
      cheek.scale.set(1, 0.6, 0.5);
      this.head.add(cheek);
    }
    this.board.add(this.head);
  }

  private buildApple(): void {
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 28, 20),
      candyMaterial(palette.coral, { emissive: palette.coral, emissiveIntensity: 0.15 }),
    );
    fruit.scale.set(1, 0.92, 1);
    fruit.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), candyMaterial(palette.lime));
    leaf.scale.set(1.5, 0.35, 0.8);
    leaf.position.set(0.1, 0.33, 0);
    leaf.rotation.z = -0.5;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.18, 10),
      candyMaterial(mixHex(palette.tangerine, palette.ink, 0.5)),
    );
    stem.position.y = 0.32;
    this.apple.add(fruit, leaf, stem);
    this.board.add(this.apple);
  }

  get state(): PreviewState {
    return this.sim;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  steer(dir: Direction): void {
    this.sim = queueTurn(this.sim, dir);
  }

  /** A happy hop: the main action in the scaffold. */
  bounce(): void {
    this.hop = 1;
  }

  reset(): void {
    this.sim = createPreviewState(this.rng);
    this.prevBody = this.sim.body.map((c) => ({ ...c }));
    this.acc = 0;
    this.syncInstant();
  }

  /** Fit the board to the view in portrait and landscape. */
  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const cam = this.kit.camera;
    const portrait = aspect < 1;
    const span = this.sim.size + 2.2;
    const vFov = (cam.fov * Math.PI) / 180;
    const fitH = span / 2 / Math.tan(vFov / 2);
    const fitW = span / 2 / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(fitH, fitW) * (portrait ? 1.0 : 0.95);
    cam.position.set(0, dist * 0.82, dist * 0.62);
    cam.lookAt(this.lookTarget);
  }

  private syncInstant(): void {
    this.toWorld(this.sim.apple, this.apple.position);
    this.place(1);
  }

  private place(t: number): void {
    const body = this.sim.body;
    const prev = this.prevBody;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i] as THREE.Mesh;
      const cur = body[i];
      if (!cur || i === 0) {
        seg.visible = false;
        continue;
      }
      const from = prev[i] ?? prev[prev.length - 1] ?? cur;
      this.toWorld(from, a);
      this.toWorld(cur, b);
      // Snap across the wrap seam instead of sliding through the board.
      if (a.distanceTo(b) > 1.5) a.copy(b);
      p.lerpVectors(a, b, t);
      seg.position.copy(p);
      const taper = 1 - (i / MAX_LENGTH) * 0.35;
      seg.scale.setScalar(taper);
      seg.visible = true;
    }
    const headCell = body[0] as Cell;
    const headFrom = prev[0] ?? headCell;
    this.toWorld(headFrom, a);
    this.toWorld(headCell, b);
    if (a.distanceTo(b) > 1.5) a.copy(b);
    p.lerpVectors(a, b, t);
    this.head.position.copy(p);
  }

  update(dt: number, t: number): void {
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.prevBody = this.sim.body.map((c) => ({ ...c }));
        const r = advance(this.sim, this.rng);
        this.sim = r.state;
        if (r.ate) {
          const pos = new THREE.Vector3();
          this.apple.getWorldPosition(pos);
          this.particles.burst({
            position: pos,
            color: palette.coral,
            count: this.reduced ? 8 : 28,
            speed: 3,
            life: 0.7,
            size: 0.08,
          });
          this.pop = 1;
          this.toWorld(this.sim.apple, this.apple.position);
          this.onEat?.(this.sim.eaten);
        }
      }
    }
    const k = this.paused ? 1 : Math.min(1, this.acc / STEP);
    this.place(k);

    // Face the travel direction.
    const yaw = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }[this.sim.dir];
    let diff = yaw - this.head.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.head.rotation.y += diff * (1 - Math.exp(-14 * dt));

    this.hop = Math.max(0, this.hop - dt * 3);
    const hopY = Math.sin(this.hop * Math.PI) * 0.5;
    this.head.position.y += hopY;
    const squash = Math.sin(this.hop * Math.PI * 2) * 0.12;
    this.head.scale.set(1 + squash, 1 - squash, 1 + squash);

    const motion = this.reduced ? 0 : 1;
    this.pop = Math.max(0, this.pop - dt * 2.5);
    const bob = Math.sin(t * 2.4) * 0.08 * motion;
    this.apple.position.y = 0.42 + bob;
    this.apple.rotation.y += dt * 1.2 * motion;
    const s = 1 + Math.sin(this.pop * Math.PI) * 0.4;
    this.apple.scale.setScalar(damp(this.apple.scale.x, s, 20, dt || 1));

    this.particles.update(dt);
  }
}
