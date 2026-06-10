/**
 * PowerupPickup — the Berserk power-up (Quad-Damage-style).
 *
 * A single contested pickup that grants a temporary damage boost. Always
 * collectable on proximity (unlike health, which only triggers when hurt), with
 * a long respawn so map control of the spot matters — the classic arena-shooter
 * power-up rhythm.
 *
 * Self-contained + visual: a glowing red/orange octahedron with a halo ring that
 * spins + bobs. Solo + combat-mode only (the effect is client-side). The mode
 * owns the lifecycle; this entity just animates + reports a collect.
 */

import * as THREE from 'three';

/** Seconds the Berserk effect lasts after pickup. */
export const BERSERK_DURATION = 8;
/** Outgoing damage multiplier while Berserk is active. */
export const BERSERK_DAMAGE_MULT = 2.0;
/** Seconds before the power-up re-appears (long → the spot is worth contesting). */
const RESPAWN_SECONDS = 30;
const PICKUP_RADIUS = 1.8;
const FLOAT_Y = 1.1;
const BOB_AMP = 0.2;

export class PowerupPickup {
  readonly group: THREE.Group;
  private anchor: THREE.Vector3;
  private available = true;
  private cooldown = 0;
  private spin = 0;
  private bob = Math.random() * Math.PI * 2;

  constructor(anchor: THREE.Vector3) {
    this.anchor = anchor.clone();
    this.group = new THREE.Group();

    // Core gem.
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45),
      new THREE.MeshLambertMaterial({
        color: 0xff5a2a, emissive: 0xc02000, flatShading: true,
        transparent: true, opacity: 0.95,
      }),
    );
    this.group.add(core);

    // Halo ring (tilted) — reads as "important" at a distance.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.06, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, opacity: 0.85 }),
    );
    halo.rotation.x = Math.PI / 2.6;
    this.group.add(halo);

    // Ground glow ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -FLOAT_Y + 0.05;
    this.group.add(ring);

    this.group.position.set(this.anchor.x, this.anchor.y + FLOAT_Y, this.anchor.z);
  }

  /** Tick. Returns true on the frame the player collects it. */
  update(dt: number, playerPos: THREE.Vector3): boolean {
    if (!this.available) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.available = true;
        this.group.visible = true;
      }
      return false;
    }

    this.spin += dt * 1.9;
    this.bob += dt * 2.0;
    this.group.rotation.y = this.spin;
    this.group.position.y = this.anchor.y + FLOAT_Y + Math.sin(this.bob) * BOB_AMP;

    const dx = playerPos.x - this.anchor.x;
    const dz = playerPos.z - this.anchor.z;
    const dy = playerPos.y - this.anchor.y;
    if (dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) < 2.5) {
      this.available = false;
      this.cooldown = RESPAWN_SECONDS;
      this.group.visible = false;
      return true;
    }
    return false;
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
