/**
 * Snake scene: a glossy board on a playroom rug, a candy snake built from one smooth tube with a
 * cute face, bouncy glowing food, particle bursts and a gentle follow camera. The scene never
 * changes the rules: each frame it draws the controller's state, gliding between cells with the
 * render interpolation factor.
 */
import * as THREE from 'three';
import { ParticleSystem } from './kit/particles';
import type { Rng } from './kit/prng';
import type { KitRenderer } from './kit/renderer';
import {
  addStudioLights,
  candyMaterial,
  clamp,
  damp,
  easeInOutSine,
  lerp,
  makeRoom,
} from './kit/scene-helpers';
import { funColors, mixHex, palette } from './kit/theme';
import type { Direction } from './kit/input';
import type { Cell } from './game/grid';
import { BOARD_BOTTOM, Board, TILE_TOP, makeToys } from './game/board';
import { FOOD_COLORS, Food, foodKindFor, makeGlowTexture } from './game/food';
import { boardPoints, fillFor, frameCamera, pitchFor, type Insets } from './game/framing';
import { bloomPulse } from './game/glow';
import { HeadRig } from './game/head';
import { Spine, TIP_RADIUS, tailRadius } from './game/spine';
import { SnakeTube } from './game/tube';
import { GARDEN_BUSHES, MODE_RULES, type Mode, type SnakeState } from './logic';

/** Body tube radius at the neck (cells). */
const RADIUS = 0.3;
/** Distance between tube rings (cells). */
const SPACING = 0.125;
const RADIAL = 14;
/** Most copies of the body drawn at once (wrap-around seams). */
const MAX_COPIES = 9;
const HEAD_Y = TILE_TOP + 0.37;
/** Coil spiral: inner radius and gap between turns. */
const COIL_R0 = 0.3;
const COIL_B = 0.82 / (Math.PI * 2);
/** Tail taper length (cells). */
const TAIL_LEN = 1.6;
/** Extra rings on the tail tip so the half sphere stays smooth. */
const TIP_RINGS = 6;

/**
 * Snake colours: a saturated, friendly green with darker segment bands and a warm belly. Strong
 * enough to stay green under bloom and reflections (the pastel lime read near-white).
 */
const SNAKE_COLORS = {
  main: '#2fc45a',
  band: '#178a45',
  belly: '#ffd98a',
} as const;

/** Garden bushes: a calm teal, far from the snake green in hue. */
const BUSH_COLOR = mixHex(palette.mint, '#0e5c63', 0.55);

export interface SceneOptions {
  reducedMotion: boolean;
  size: number;
}

/** What the scene draws this frame. */
export interface SceneView {
  state: SnakeState;
  prevBody: readonly Cell[];
  alpha: number;
  paused: boolean;
  /** Seconds since the round ended. */
  endedFor: number;
}

const YAW: Record<Direction, number> = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };

/** Wrap a number into [-half, half). */
function wrapInto(v: number, half: number, size: number): number {
  if (v > half) return v - size;
  if (v < -half) return v + size;
  return v;
}

export class SnakeScene {
  private readonly kit: KitRenderer;
  private readonly motion: number;
  private readonly size: number;
  private readonly half: number;
  private readonly board: Board;
  private readonly food: Food;
  private readonly head: HeadRig;
  private readonly tube: SnakeTube;
  private readonly bodyMat: THREE.MeshPhysicalMaterial;
  private readonly copies: THREE.Mesh[] = [];
  private readonly spine: Spine;
  private readonly particles: ParticleSystem;
  private readonly zzz: Array<{ group: THREE.Group; mat: THREE.MeshStandardMaterial }> = [];
  private readonly bushes: THREE.Group[] = [];
  private readonly baseBloom: number;

  // Scratch buffers (no allocation per frame).
  private readonly pts: Float32Array;
  private readonly fx: Float32Array;
  private readonly fz: Float32Array;
  private readonly ftx: Float32Array;
  private readonly ftz: Float32Array;
  private readonly fr: Float32Array;
  private readonly fy: Float32Array;
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  // Animation state.
  private wrap = false;
  private yaw = YAW.right;
  private eatPulse = 0;
  private gulp = 0;
  private shake = 0;
  private bumpDir: Direction | null = null;
  private bulges: number[] = [];
  private readonly coilCenter = new THREE.Vector2();
  private readonly follow = new THREE.Vector3();
  private readonly basePos = new THREE.Vector3();
  private readonly baseQuat = new THREE.Quaternion();
  private lastHead = new THREE.Vector3();

  constructor(kit: KitRenderer, rng: Rng, o: SceneOptions) {
    this.kit = kit;
    this.motion = o.reducedMotion ? 0 : 1;
    this.size = o.size;
    this.half = o.size / 2;
    const scene = kit.scene;
    kit.renderer.localClippingEnabled = true;
    this.baseBloom = kit.bloomPass.strength;

    const lights = addStudioLights(scene, {
      shadowArea: this.half + 2.5,
      shadowMapSize: kit.settings.shadowMapSize,
    });
    lights.key.castShadow = kit.settings.shadows;
    kit.shadowLights.push(lights.key);
    // The pink fill point light turned the indigo tiles pink-lavender on phones (review S2).
    lights.fill.intensity = 10;

    const room = makeRoom(scene, {
      floorColor: mixHex(palette.plum, palette.night, 0.35),
      wallColor: mixHex(palette.night, palette.plum, 0.5),
      rugColor: mixHex(palette.lavender, palette.plum, 0.6),
    });
    room.position.y = BOARD_BOTTOM;
    const toys = makeToys(this.half + 0.5);
    scene.add(toys);

    this.board = new Board(o.size);
    scene.add(this.board.group);

    const glowTex = makeGlowTexture();
    this.food = new Food(glowTex);
    scene.add(this.food.group);

    // Body: one tube drawn in up to MAX_COPIES places, clipped to the board edges, so a snake
    // that wraps around slides out of one side and into the other.
    const maxPoints = o.size * o.size + 2;
    this.spine = new Spine(maxPoints, SPACING, { length: TIP_RADIUS, samples: TIP_RINGS });
    this.pts = new Float32Array(maxPoints * 2);
    const ms = this.spine.maxSamples;
    this.fx = new Float32Array(ms);
    this.fz = new Float32Array(ms);
    this.ftx = new Float32Array(ms);
    this.ftz = new Float32Array(ms);
    this.fr = new Float32Array(ms);
    this.fy = new Float32Array(ms);
    this.tube = new SnakeTube(ms, RADIAL, {
      main: SNAKE_COLORS.main,
      stripe: SNAKE_COLORS.band,
      belly: SNAKE_COLORS.belly,
    });
    const h = this.half;
    // No white sheen and softer reflections: they washed the green out to near-white.
    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: palette.white,
      vertexColors: true,
      roughness: 0.36,
      metalness: 0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.55,
      clippingPlanes: [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), h),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), h),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), h),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), h),
      ],
      clipShadows: true,
    });
    for (let i = 0; i < MAX_COPIES; i++) {
      const mesh = new THREE.Mesh(this.tube.geometry, this.bodyMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = i === 0;
      this.copies.push(mesh);
      scene.add(mesh);
    }

    const headMat = candyMaterial(SNAKE_COLORS.main, { roughness: 0.36, sheen: 0 });
    headMat.clearcoat = 0.85;
    headMat.clearcoatRoughness = 0.12;
    headMat.envMapIntensity = 0.55;
    this.head = new HeadRig(headMat);
    scene.add(this.head.group);

    this.particles = new ParticleSystem(rng, { max: 180, particleScale: kit.settings.particleScale });
    scene.add(this.particles.mesh);

    this.buildZzz(scene);
    this.buildBushes(scene);
    this.board.setGlow(1);
  }

  /**
   * A pool of soft round bushes (garden boards). Teal clumps with a pink flower: a different
   * hue and shape from the green tube snake, so the two never look alike.
   */
  private buildBushes(scene: THREE.Scene): void {
    const leaf = candyMaterial(BUSH_COLOR, { roughness: 0.62, clearcoat: 0.3 });
    leaf.envMapIntensity = 0.35;
    const flower = candyMaterial(palette.bubblegum, { roughness: 0.4 });
    const big = new THREE.SphereGeometry(0.3, 22, 16);
    const small = new THREE.SphereGeometry(0.21, 18, 12);
    const bloom = new THREE.SphereGeometry(0.07, 12, 8);
    const clumps: Array<[THREE.BufferGeometry, number, number, number]> = [
      [big, 0, 0.26, 0],
      [small, -0.2, 0.2, 0.14],
      [small, 0.2, 0.2, -0.12],
      [small, 0.12, 0.22, 0.2],
    ];
    for (let i = 0; i < GARDEN_BUSHES; i++) {
      const g = new THREE.Group();
      for (const [geo, x, y, z] of clumps) {
        const m = new THREE.Mesh(geo, leaf);
        m.position.set(x, TILE_TOP + y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        g.add(m);
      }
      const f = new THREE.Mesh(bloom, flower);
      f.position.set(0.06, TILE_TOP + 0.56, 0.08);
      g.add(f);
      g.visible = false;
      scene.add(g);
      this.bushes.push(g);
    }
  }

  private placeBushes(cells: readonly Cell[]): void {
    this.bushes.forEach((g, i) => {
      const c = cells[i];
      g.visible = c !== undefined;
      if (c) {
        this.cellToWorld(c, 0, this.v1);
        g.position.set(this.v1.x, 0, this.v1.z);
        g.rotation.y = (c.x * 7 + c.y * 3) % 6;
      }
    });
  }

  private buildZzz(scene: THREE.Scene): void {
    const bar = new THREE.BoxGeometry(0.3, 0.07, 0.07);
    const diag = new THREE.BoxGeometry(0.4, 0.07, 0.07);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: palette.lavender,
        emissive: new THREE.Color(palette.lavender),
        emissiveIntensity: 0.6,
        roughness: 0.4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const g = new THREE.Group();
      const top = new THREE.Mesh(bar, mat);
      top.position.y = 0.14;
      const bottom = new THREE.Mesh(bar, mat);
      bottom.position.y = -0.14;
      const mid = new THREE.Mesh(diag, mat);
      mid.rotation.z = Math.PI / 4;
      g.add(top, bottom, mid);
      g.visible = false;
      scene.add(g);
      this.zzz.push({ group: g, mat });
    }
  }

  /** World position of a cell centre at height y. */
  cellToWorld(c: Cell, y: number, out: THREE.Vector3): THREE.Vector3 {
    const h = (this.size - 1) / 2;
    return out.set(c.x - h, y, c.y - h);
  }

  /** CSS pixel position (relative to the canvas) of a cell, for screen-space pops. */
  cellToScreen(c: Cell): { x: number; y: number } {
    const p = this.cellToWorld(c, HEAD_Y + 0.4, this.v1).project(this.kit.camera);
    return { x: ((p.x + 1) / 2) * this.kit.width, y: ((1 - p.y) / 2) * this.kit.height };
  }

  setMode(mode: Mode): void {
    this.wrap = MODE_RULES[mode].wrap;
    this.board.setWrap(this.wrap);
  }

  /** A new round: snap everything into place (no pop-in, so the first frame is stable). */
  reset(s: SnakeState): void {
    this.setMode(s.mode);
    this.yaw = YAW[s.dir];
    this.eatPulse = 0;
    this.gulp = 0;
    this.shake = 0;
    this.bumpDir = null;
    this.bulges = [];
    this.food.setKind(foodKindFor(s.eaten));
    if (s.food) {
      this.cellToWorld(s.food, 0, this.v1);
      this.food.place(this.v1.x, this.v1.z, false);
    }
    this.food.setVisible(s.food !== null);
    for (const z of this.zzz) z.group.visible = false;
    this.placeBushes(s.bushes);
  }

  onEat(cell: Cell, s: SnakeState): void {
    const kindEaten = foodKindFor(s.eaten - 1);
    const pos = this.cellToWorld(cell, 0.5, this.v1);
    const big = s.combo >= 3;
    this.particles.burst({
      position: pos,
      color: FOOD_COLORS[kindEaten],
      count: this.motion ? (big ? 34 : 24) : 6,
      speed: 3.2,
      life: 0.75,
      size: 0.075,
    });
    if (big && this.motion) {
      this.particles.burst({ position: pos, color: palette.lemon, count: 16, speed: 4.2, life: 0.6, size: 0.05 });
    }
    this.board.ringAt(pos.x, pos.z);
    this.eatPulse = 1;
    this.gulp = 1;
    this.bulges.push(s.tick);
    this.food.setKind(foodKindFor(s.eaten));
    if (s.food) {
      this.cellToWorld(s.food, 0, this.v1);
      this.food.place(this.v1.x, this.v1.z, true);
    }
    this.food.setVisible(s.food !== null);
  }

  onEnd(s: SnakeState): void {
    if (s.cause === 'wall' || s.cause === 'bush' || s.cause === 'self') {
      this.bumpDir = s.dir;
      this.shake = this.motion;
    }
    if (s.cause === 'full') {
      const at = this.lastHead.clone();
      at.y = HEAD_Y + 0.4;
      for (const c of funColors) {
        this.particles.burst({ position: at, color: c, count: this.motion ? 14 : 3, speed: 5, life: 1.1, size: 0.07 });
      }
    }
    // Coil around the body's middle, kept on the board.
    let sx = 0;
    let sz = 0;
    const n = Math.max(1, this.spine.count);
    for (let i = 0; i < n; i++) {
      sx += this.fx[i] as number;
      sz += this.fz[i] as number;
    }
    const rmax = this.coilRadius(this.spine.length);
    const limit = this.half - 0.55 - rmax;
    if (limit <= 0) this.coilCenter.set(0, 0);
    else this.coilCenter.set(clamp(sx / n, -limit, limit), clamp(sz / n, -limit, limit));
  }

  private coilPhi(d: number): number {
    return (-COIL_R0 + Math.sqrt(COIL_R0 * COIL_R0 + 2 * COIL_B * Math.max(0, d))) / COIL_B;
  }

  private coilRadius(length: number): number {
    return COIL_R0 + COIL_B * this.coilPhi(length);
  }

  /** Fit the board under the HUD and beside the d-pad, in portrait and landscape. */
  resize(width: number, height: number, insets: Insets): void {
    const cam = this.kit.camera;
    const b = this.board;
    const aspect = width / Math.max(1, height);
    frameCamera(cam, width, height, {
      points: boardPoints(b.outerHalf, b.rimTop, BOARD_BOTTOM, 0.75),
      target: new THREE.Vector3(0, 0, 0),
      pitch: pitchFor(aspect),
      insets,
      fill: fillFor(aspect),
    });
    this.basePos.copy(cam.position);
    this.baseQuat.copy(cam.quaternion);
  }

  update(dt: number, t: number, v: SceneView): void {
    const s = v.state;
    const over = s.phase === 'over';
    const sleepy = over && s.cause !== 'full';
    const coil = sleepy && this.motion > 0 ? easeInOutSine((v.endedFor - 0.35) / 1.4) : 0;
    const asleep = sleepy && v.endedFor > 0.45;

    this.buildSpine(s, v.prevBody, v.alpha);
    const count = this.spine.count;
    const L = this.spine.length;

    // Positions (optionally blended into the sleepy coil) and tangents.
    if (coil > 0) {
      for (let i = 0; i < count; i++) {
        const d = L - (this.spine.s[i] as number);
        const phi = this.coilPhi(d);
        const r = COIL_R0 + COIL_B * phi;
        const cx = this.coilCenter.x + Math.cos(phi) * r;
        const cz = this.coilCenter.y + Math.sin(phi) * r;
        this.fx[i] = lerp(this.spine.x[i] as number, cx, coil);
        this.fz[i] = lerp(this.spine.z[i] as number, cz, coil);
      }
      for (let i = 0; i < count; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(count - 1, i + 1);
        const dx = (this.fx[b] as number) - (this.fx[a] as number);
        const dz = (this.fz[b] as number) - (this.fz[a] as number);
        const len = Math.hypot(dx, dz);
        if (len > 1e-6) {
          this.ftx[i] = dx / len;
          this.ftz[i] = dz / len;
        } else {
          this.ftx[i] = this.spine.tx[i] as number;
          this.ftz[i] = this.spine.tz[i] as number;
        }
      }
    } else {
      this.fx.set(this.spine.x.subarray(0, count));
      this.fz.set(this.spine.z.subarray(0, count));
      this.ftx.set(this.spine.tx.subarray(0, count));
      this.ftz.set(this.spine.tz.subarray(0, count));
    }

    // Radii: taper, rounded tail tip, swallowed-food bulges, eat swell, sleepy breathing.
    this.eatPulse = Math.max(0, this.eatPulse - dt * 2.4);
    this.gulp = Math.max(0, this.gulp - dt * 3.2);
    const bulgeAt: number[] = [];
    const kept: number[] = [];
    for (const tick of this.bulges) {
      const pos = s.tick - tick - 1 + v.alpha;
      if (pos < L + 0.5) {
        kept.push(tick);
        bulgeAt.push(pos);
      }
    }
    this.bulges = kept;
    const breathe = asleep ? Math.sin(t * 1.8) * 0.045 * this.motion : 0;
    const swell = 1 + 0.07 * this.eatPulse * this.motion;
    const taper = Math.min(TAIL_LEN, L * 0.55);
    for (let i = 0; i < count; i++) {
      const sa = this.spine.s[i] as number;
      const u = L > 0 ? sa / L : 0;
      const toTip = L - sa;
      let r = tailRadius(RADIUS * (1 - 0.25 * u), toTip, taper);
      // Bulges fade out before the tip so the round end keeps its shape.
      const tipFade = clamp((toTip - TIP_RADIUS) / 0.5, 0, 1);
      for (const pos of bulgeAt) {
        const amp = 0.1 * clamp(pos + 1, 0, 1) * (1 - 0.5 * u) * tipFade;
        const c = Math.max(pos, 0.45);
        const d = sa - c;
        r += amp * Math.exp(-(d * d) / 0.1);
      }
      const k = swell * (1 + breathe * Math.sin(sa * 0.9 - t * 1.8));
      r *= k;
      const tip = i === count - 1 && count > 1;
      r = tip ? 0 : Math.max(0.012, r);
      this.fr[i] = r;
      // Rest on the tiles; the tip cap keeps the height of its base so it stays round.
      this.fy[i] = TILE_TOP + Math.max(r, TIP_RADIUS * k) * 0.92;
    }
    this.tube.update({
      x: this.fx,
      z: this.fz,
      tx: this.ftx,
      tz: this.ftz,
      s: this.spine.s,
      radius: this.fr,
      y: this.fy,
      count,
    });
    this.placeCopies(count);

    // Head.
    const hx = count > 0 ? (this.fx[0] as number) : 0;
    const hz = count > 0 ? (this.fz[0] as number) : 0;
    const px = this.wrap ? wrapInto(hx, this.half, this.size) : hx;
    const pz = this.wrap ? wrapInto(hz, this.half, this.size) : hz;
    const fwdX = -(this.ftx[0] as number);
    const fwdZ = -(this.ftz[0] as number);
    const targetYaw = Math.atan2(fwdX, fwdZ);
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-16 * dt));
    const hg = this.head.group;
    hg.position.set(px, HEAD_Y, pz);
    // Wall bump: a soft nudge toward the wall, then back.
    if (this.bumpDir && over) {
      const k = clamp(v.endedFor / 0.35, 0, 1);
      const push = Math.sin(k * Math.PI) * 0.2;
      const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.bumpDir];
      hg.position.x += (dv[0] as number) * push;
      hg.position.z += (dv[1] as number) * push;
    }
    if (asleep) hg.position.y -= 0.06;
    else if (s.phase === 'ready') hg.position.y += Math.sin(t * 2.2) * 0.025 * this.motion;
    hg.rotation.set(0, this.yaw, asleep ? 0.22 * Math.min(1, (v.endedFor - 0.45) * 2) : 0);
    // Shrink through the wrap-around portal at the board edge.
    let portal = 1;
    if (this.wrap) {
      const edge = this.half - Math.max(Math.abs(px), Math.abs(pz));
      portal = clamp((edge + 0.05) / 0.5, 0.3, 1);
    }
    const g = Math.sin(this.gulp * Math.PI);
    hg.scale.setScalar(portal);
    this.head.body.scale.set(1 + 0.16 * g, 1 - 0.13 * g, 1 + 0.08 * g);
    this.lastHead.copy(hg.position);

    // Eyes follow the food; a blink every few seconds (a pure function of time).
    hg.updateMatrixWorld(true);
    const look = this.v2.set(0, 0, 1);
    if (s.food && !over) {
      this.cellToWorld(s.food, 0.45, this.v1);
      hg.worldToLocal(this.v1);
      look.copy(this.v1);
    }
    const bt = t % 3.7;
    const blink = bt < 0.14 ? Math.sin((bt / 0.14) * Math.PI) : 0;
    this.head.apply({ look, blink, asleep, gulp: g });

    // Food.
    this.food.update(dt, t, this.motion);

    // Board glow: dims while asleep or paused. A meal flashes the rim and a ring at the eaten
    // cell only, so the snake and the next food stay readable (review S1).
    let glow = 1;
    if (sleepy) glow = lerp(glow, 0.5, clamp(v.endedFor / 1.2, 0, 1));
    if (v.paused) glow *= 0.75;
    this.board.setGlow(glow, this.eatPulse, this.motion);
    this.kit.bloomPass.strength = this.baseBloom * bloomPulse(this.eatPulse, this.motion);

    this.updateZzz(t, asleep, v.endedFor);
    this.particles.update(dt);
    this.updateCamera(dt, t, px, pz);
  }

  /** Polyline through the body (head first) in unwrapped world coordinates. */
  private buildSpine(s: SnakeState, prev: readonly Cell[], alpha: number): void {
    const body = s.body;
    const n = body.length;
    const size = this.size;
    const hc = (size - 1) / 2;
    const pts = this.pts;
    const head = body[0] as Cell;
    // Unwrap each cell next to the previous one, so the chain has no jumps across the board.
    let rx = head.x;
    let ry = head.y;
    const unwrap = (c: Cell): void => {
      let x = c.x;
      let y = c.y;
      if (x - rx > size / 2) x -= size;
      else if (x - rx < -size / 2) x += size;
      if (y - ry > size / 2) y -= size;
      else if (y - ry < -size / 2) y += size;
      rx = x;
      ry = y;
    };
    let k = 0;
    const push = (x: number, y: number) => {
      pts[k * 2] = x - hc;
      pts[k * 2 + 1] = y - hc;
      k++;
    };
    if (n < 2) {
      push(head.x, head.y);
      this.spine.build(pts, k);
      return;
    }
    // Head: glides from the neck cell toward its cell.
    unwrap(body[1] as Cell);
    const nx = rx;
    const ny = ry;
    push(lerp(nx, head.x, alpha), lerp(ny, head.y, alpha));
    rx = nx;
    ry = ny;
    push(nx, ny);
    for (let i = 2; i < n; i++) {
      unwrap(body[i] as Cell);
      push(rx, ry);
    }
    // Tail: slides from the cell it is leaving toward its cell.
    const tailX = rx;
    const tailY = ry;
    const prevTail = prev[prev.length - 1];
    if (prevTail) {
      unwrap(prevTail);
      push(lerp(rx, tailX, alpha), lerp(ry, tailY, alpha));
    }
    this.spine.build(pts, k);
  }

  /** Show one body copy per board-sized offset that overlaps the board. */
  private placeCopies(count: number): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = this.fx[i] as number;
      const z = this.fz[i] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const h = this.half;
    const sz = this.size;
    let used = 0;
    if (count > 0 && this.wrap) {
      const r = RADIUS + 0.15;
      const kx0 = Math.ceil((-h - maxX - r) / sz);
      const kx1 = Math.floor((h - minX + r) / sz);
      const kz0 = Math.ceil((-h - maxZ - r) / sz);
      const kz1 = Math.floor((h - minZ + r) / sz);
      for (let kx = kx0; kx <= kx1; kx++) {
        for (let kz = kz0; kz <= kz1; kz++) {
          const mesh = this.copies[used];
          if (!mesh) break;
          mesh.position.set(kx * sz, 0, kz * sz);
          mesh.visible = true;
          used++;
        }
      }
    } else if (count > 0) {
      const mesh = this.copies[0] as THREE.Mesh;
      mesh.position.set(0, 0, 0);
      mesh.visible = true;
      used = 1;
    }
    for (let i = used; i < this.copies.length; i++) (this.copies[i] as THREE.Mesh).visible = false;
  }

  private updateZzz(t: number, asleep: boolean, endedFor: number): void {
    const fadeIn = clamp((endedFor - 0.9) / 0.6, 0, 1);
    const cam = this.kit.camera;
    this.zzz.forEach((z, i) => {
      z.group.visible = asleep && fadeIn > 0;
      if (!z.group.visible) return;
      // Reduced motion: three still Zs in a rising row.
      const phase = this.motion ? (t * 0.45 + i / 3) % 1 : 0.2 + i * 0.27;
      z.group.position.set(
        this.lastHead.x + 0.35 + phase * 0.55,
        this.lastHead.y + 0.55 + phase * 1.1,
        this.lastHead.z - 0.1,
      );
      z.group.scale.setScalar(0.55 + phase * 0.6);
      z.group.quaternion.copy(cam.quaternion);
      z.mat.opacity = fadeIn * (this.motion ? Math.sin(phase * Math.PI) : 0.85);
    });
  }

  private updateCamera(dt: number, t: number, hx: number, hz: number): void {
    const cam = this.kit.camera;
    const m = this.motion;
    // Gentle follow: drift a little toward the head (none with reduced motion).
    this.follow.x = damp(this.follow.x, hx * 0.07 * m, 2.5, dt);
    this.follow.z = damp(this.follow.z, hz * 0.05 * m, 2.5, dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake * 0.08 * m;
    cam.position.copy(this.basePos).add(this.follow);
    cam.position.x += Math.sin(t * 47) * sh;
    cam.position.y += Math.sin(t * 59 + 1.3) * sh * 0.6;
    cam.quaternion.copy(this.baseQuat);
    // A slight tilt toward the side the snake is on.
    cam.rotateZ(-this.follow.x * 0.03);
  }
}
