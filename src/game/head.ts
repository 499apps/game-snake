/**
 * The snake's head: a glossy rounded skull with big eyes that follow the food, blinks, rosy
 * cheeks and a smile. Asleep, the eyes close into soft arcs. Local +z is forward, +y is up.
 */
import * as THREE from 'three';
import { candyMaterial } from '../kit/scene-helpers';
import { palette } from '../kit/theme';

export interface HeadPose {
  /** Direction to look at, in head space (normalised or zero). */
  look: THREE.Vector3;
  /** 0 = eyes open, 1 = closed (blink). */
  blink: number;
  /** Asleep: closed arcs instead of eyes. */
  asleep: boolean;
  /** Chew / gulp pulse, 0..1. */
  gulp: number;
}

interface Eye {
  group: THREE.Group;
  pupil: THREE.Mesh;
  glint: THREE.Mesh;
  closed: THREE.Mesh;
  center: THREE.Vector3;
}

const EYE_RADIUS = 0.15;
const PUPIL_TRAVEL = 0.075;

export class HeadRig {
  readonly group = new THREE.Group();
  /** Scaled for squash and stretch without touching the face layout. */
  readonly body = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();

  constructor(bodyMaterial: THREE.Material) {
    this.group.add(this.body);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 36, 26), bodyMaterial);
    skull.scale.set(1, 0.8, 1.12);
    skull.castShadow = true;
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20), bodyMaterial);
    snout.scale.set(1.05, 0.62, 0.9);
    snout.position.set(0, -0.08, 0.2);
    snout.castShadow = true;
    this.body.add(skull, snout);

    const white = candyMaterial(palette.white, { roughness: 0.18, clearcoat: 1 });
    const ink = candyMaterial(palette.ink, { roughness: 0.12 });
    const glint = new THREE.MeshBasicMaterial({ color: palette.white });
    const lash = candyMaterial(palette.ink, { roughness: 0.4, clearcoat: 0.2 });
    const eyeGeo = new THREE.SphereGeometry(EYE_RADIUS, 24, 18);
    const pupilGeo = new THREE.SphereGeometry(0.072, 18, 12);
    const glintGeo = new THREE.SphereGeometry(0.024, 10, 8);
    const closedGeo = new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI);
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const center = new THREE.Vector3(side * 0.19, 0.27, 0.24);
      g.position.copy(center);
      const ball = new THREE.Mesh(eyeGeo, white);
      const pupil = new THREE.Mesh(pupilGeo, ink);
      const gl = new THREE.Mesh(glintGeo, glint);
      g.add(ball, pupil, gl);
      // A sleepy closed eye: an arc that dips in the middle.
      const closed = new THREE.Mesh(closedGeo, lash);
      closed.position.copy(center).add(new THREE.Vector3(0, 0.02, 0.1));
      closed.rotation.set(-0.35, 0, Math.PI);
      closed.visible = false;
      this.body.add(g, closed);
      this.eyes.push({ group: g, pupil, glint: gl, closed, center });
    }

    const cheekMat = candyMaterial(palette.bubblegum, { roughness: 0.55, clearcoat: 0.3 });
    const cheekGeo = new THREE.SphereGeometry(0.075, 14, 10);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(cheekGeo, cheekMat);
      cheek.position.set(side * 0.29, 0.02, 0.34);
      cheek.scale.set(1, 0.6, 0.45);
      this.body.add(cheek);
    }

    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20, Math.PI), lash);
    this.mouth.position.set(0, -0.04, 0.47);
    this.mouth.rotation.set(-0.5, 0, Math.PI);
    this.body.add(this.mouth);
  }

  apply(p: HeadPose): void {
    const open = 1 - Math.min(1, Math.max(0, p.blink));
    for (const eye of this.eyes) {
      eye.group.visible = !p.asleep;
      eye.closed.visible = p.asleep;
      if (p.asleep) continue;
      eye.group.scale.set(1, Math.max(0.08, open), 1);
      // Pupils sit on the front of the eye, pulled toward the look direction.
      const d = this.tmp.copy(p.look);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
      d.normalize();
      d.z = Math.max(0.35, d.z);
      d.normalize();
      eye.pupil.position.set(d.x * PUPIL_TRAVEL, d.y * PUPIL_TRAVEL * 0.6 + 0.01, EYE_RADIUS * 0.62 + d.z * 0.02);
      eye.glint.position.set(eye.pupil.position.x + 0.03, eye.pupil.position.y + 0.035, eye.pupil.position.z + 0.05);
    }
    const g = Math.min(1, Math.max(0, p.gulp));
    this.mouth.scale.set(1 + g * 0.35, 1 + g * 0.9, 1);
  }
}
