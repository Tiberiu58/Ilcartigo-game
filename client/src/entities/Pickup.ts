/**
 * Pickup — a collectible world orb (Survival health drops for v1).
 *
 * A small glowing diamond that bobs + spins so it reads as "grab me". Purely a
 * visual + a position + a payload; collection logic (overlap test, applying the
 * effect, disposal) lives in Game so the pickup itself stays a dumb,
 * trivially-disposable object. No collision registration — you walk through it,
 * you don't bump it.
 */

import * as THREE from 'three';
import type { World } from '../core/World';

export type PickupKind = 'health';

/** Horizontal radius (m) within which the player collects a pickup. */
export const PICKUP_RADIUS = 1.3;

export class Pickup {
  readonly kind: PickupKind;
  /** Payload magnitude — HP for 'health'. */
  readonly value: number;
  readonly group: THREE.Group;
  /** Ground position (feet height) the orb hovers above. */
  readonly pos: THREE.Vector3;
  collected = false;

  private world: World;
  private bob = 0;

  constructor(kind: PickupKind, value: number, pos: THREE.Vector3, world: World) {
    this.kind = kind;
    this.value = value;
    this.world = world;
    this.pos = pos.clone();

    this.group = new THREE.Group();
    const color = 0x4ade6a;   // health green

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color }),
    );
    this.group.add(gem);

    // A faint ground glow ring so it's spottable in a firefight.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.5, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.55;
    this.group.add(ring);

    this.group.position.set(this.pos.x, this.pos.y + 0.9, this.pos.z);
    world.scene.add(this.group);
  }

  /** Spin + bob the orb. */
  update(dt: number) {
    this.bob += dt;
    this.group.rotation.y += dt * 2.2;
    this.group.position.y = this.pos.y + 0.9 + Math.sin(this.bob * 2.5) * 0.12;
  }

  /** Remove from the scene + free GPU resources. */
  dispose() {
    this.world.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }
}
