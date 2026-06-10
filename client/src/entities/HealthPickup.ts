/**
 * HealthPickup — a floating med-kit the player walks over to heal.
 *
 * Classic arena sustain (Quake/Krunker health drops). Self-contained + visual:
 * a glowing green box with a white cross that bobs + spins. Collected on
 * proximity ONLY when the player actually needs HP (so a full-HP player doesn't
 * waste it), then it goes on cooldown and respawns.
 *
 * Solo + combat-mode only for v1 (MP healing would need server authority). The
 * mode owns the array; this entity just animates + reports a collect.
 */

import * as THREE from 'three';

/** HP restored per pickup. */
export const HEALTH_PICKUP_AMOUNT = 40;
/** Seconds before a collected pickup re-appears. */
const RESPAWN_SECONDS = 14;
/** Collect distance in the ground plane (metres). */
const PICKUP_RADIUS = 1.7;
/** Float height of the kit centre above its anchor. */
const FLOAT_Y = 1.0;
const BOB_AMP = 0.16;

export class HealthPickup {
  readonly group: THREE.Group;
  private anchor: THREE.Vector3;
  private available = true;
  private cooldown = 0;
  private spin = Math.random() * Math.PI * 2;
  private bob = Math.random() * Math.PI * 2;

  constructor(anchor: THREE.Vector3) {
    this.anchor = anchor.clone();
    this.group = new THREE.Group();

    // Green translucent kit body.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshLambertMaterial({
        color: 0x2fe06a, emissive: 0x1f9a48, transparent: true, opacity: 0.92, flatShading: true,
      }),
    );
    this.group.add(body);

    // White cross (two thin bars) on the front + top for the "medkit" read.
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), crossMat);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.12), crossMat);
    barV.position.z = 0.28; barH.position.z = 0.28;
    this.group.add(barV, barH);

    // Soft glow ring on the ground under the kit.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 24),
      new THREE.MeshBasicMaterial({ color: 0x2fe06a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -FLOAT_Y + 0.05;
    this.group.add(ring);

    this.group.position.set(this.anchor.x, this.anchor.y + FLOAT_Y, this.anchor.z);
  }

  /**
   * Tick the pickup. Animates while available; when the player is within range
   * AND below full HP, consumes it and returns the heal amount (else 0).
   * `hpRatio` is current/max so a full player can't waste it.
   */
  update(dt: number, playerPos: THREE.Vector3, hpRatio: number): number {
    if (!this.available) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.available = true;
        this.group.visible = true;
      }
      return 0;
    }

    this.spin += dt * 1.6;
    this.bob += dt * 2.4;
    this.group.rotation.y = this.spin;
    this.group.position.y = this.anchor.y + FLOAT_Y + Math.sin(this.bob) * BOB_AMP;

    if (hpRatio >= 1) return 0;
    const dx = playerPos.x - this.anchor.x;
    const dz = playerPos.z - this.anchor.z;
    const dy = playerPos.y - this.anchor.y;
    if (dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) < 2.5) {
      this.available = false;
      this.cooldown = RESPAWN_SECONDS;
      this.group.visible = false;
      return HEALTH_PICKUP_AMOUNT;
    }
    return 0;
  }

  /** Remove from the scene + free GPU resources. */
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
