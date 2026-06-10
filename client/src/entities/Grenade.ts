/**
 * Grenade — a thrown frag projectile (solo combat only).
 *
 * Simple, readable physics: gravity-driven arc, bounces off the floor with
 * damping, and stops horizontally on wall contact (no tunnelling) — then
 * detonates when its fuse runs out. AoE damage is resolved by Game (LoS-gated
 * radial falloff) so blasts don't reach through walls.
 *
 * Kept deliberately minimal: this entity owns only its visual + ballistics and
 * reports "exploded" back to Game, which handles the damage + VFX + events.
 */

import * as THREE from 'three';
import type { World } from '../core/World';

const GRAVITY = 22;            // m/s² — a touch heavier than the player for a snappy arc
const FUSE_SECONDS = 1.3;
const FLOOR_Y = 0.2;           // detonation/bounce floor height
const HALF = new THREE.Vector3(0.12, 0.12, 0.12);

export class Grenade {
  readonly group: THREE.Group;
  readonly pos: THREE.Vector3;
  private vel: THREE.Vector3;
  private fuse = FUSE_SECONDS;
  private spin = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);

  private _next = new THREE.Vector3();

  constructor(scene: THREE.Scene, origin: THREE.Vector3, dir: THREE.Vector3, throwSpeed: number) {
    this.pos = origin.clone();
    // Launch along aim with a slight upward lob.
    this.vel = dir.clone().multiplyScalar(throwSpeed);
    this.vel.y += 2.5;

    this.group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      new THREE.MeshLambertMaterial({ color: 0x3a4a2a, emissive: 0x141a0e, flatShading: true }),
    );
    this.group.add(body);
    // A small bright cap so it reads as live ordnance mid-air.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffae3a }),
    );
    cap.position.y = 0.16;
    this.group.add(cap);
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  /** Advance the grenade. Returns true on the frame it detonates. */
  update(dt: number, world: World): boolean {
    this.fuse -= dt;
    this.vel.y -= GRAVITY * dt;

    this._next.copy(this.pos).addScaledVector(this.vel, dt);

    // Wall stop: if the horizontal move would enter a solid, cancel horizontal
    // velocity (let it slide down the wall) rather than tunnel through it.
    if (world.firstOverlap(_SCRATCH.set(this._next.x, this.pos.y, this._next.z), HALF)) {
      this.vel.x = 0;
      this.vel.z = 0;
      this._next.x = this.pos.x;
      this._next.z = this.pos.z;
    }

    this.pos.x = this._next.x;
    this.pos.z = this._next.z;
    this.pos.y = this._next.y;

    // Floor bounce with damping.
    if (this.pos.y <= FLOOR_Y) {
      this.pos.y = FLOOR_Y;
      if (this.vel.y < 0) {
        this.vel.y = -this.vel.y * 0.42;
        this.vel.x *= 0.6;
        this.vel.z *= 0.6;
        if (this.vel.y < 1.2) this.vel.y = 0;   // settle
      }
    }

    this.group.position.copy(this.pos);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;

    return this.fuse <= 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}

const _SCRATCH = new THREE.Vector3();
