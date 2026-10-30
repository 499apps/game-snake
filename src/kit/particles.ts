/**
 * Small pooled particle bursts (instanced spheres). Seeded, so a test replay is identical.
 */
import * as THREE from 'three';
import type { Rng } from './prng';

export interface BurstOptions {
  position: THREE.Vector3;
  color?: THREE.ColorRepresentation;
  count?: number;
  speed?: number;
  life?: number;
  size?: number;
}

interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  color: THREE.Color;
}

export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly rng: Rng;
  private readonly scale: number;
  private readonly gravity: number;

  constructor(rng: Rng, o: { max?: number; particleScale?: number; gravity?: number } = {}) {
    this.rng = rng;
    this.scale = o.particleScale ?? 1;
    this.gravity = o.gravity ?? 9;
    const max = o.max ?? 200;
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      clearcoat: 1,
      vertexColors: false,
      color: 0xffffff,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 1,
        size: 0.1,
        color: new THREE.Color(),
      });
    }
  }

  burst(o: BurstOptions): void {
    const count = Math.max(0, Math.round((o.count ?? 24) * this.scale));
    const speed = o.speed ?? 4;
    const life = o.life ?? 0.9;
    const color = new THREE.Color(o.color ?? 0xffffff);
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) break;
      if (p.alive) continue;
      p.alive = true;
      p.pos.copy(o.position);
      const theta = this.rng.float(0, Math.PI * 2);
      const phi = this.rng.float(0.15, Math.PI - 0.15);
      const s = speed * this.rng.float(0.5, 1.2);
      p.vel.set(Math.sin(phi) * Math.cos(theta) * s, Math.cos(phi) * s + speed * 0.5, Math.sin(phi) * Math.sin(theta) * s);
      p.age = 0;
      p.life = life * this.rng.float(0.7, 1.2);
      p.size = (o.size ?? 0.12) * this.rng.float(0.6, 1.3);
      p.color.copy(color);
      spawned++;
    }
  }

  update(dt: number): void {
    let i = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vel.y -= this.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.age / p.life;
      const s = p.size * (1 - t * t);
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(Math.max(0.0001, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get aliveCount(): number {
    return this.mesh.count;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
