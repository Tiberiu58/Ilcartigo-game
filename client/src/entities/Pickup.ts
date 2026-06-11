/**
 * Pickup — a single floating, spinning, glowing arena pickup.
 *
 * Purely visual + a tiny availability state machine. The PickupManager
 * (`core/Pickups.ts`) owns the gameplay: proximity collection, effect
 * application, and respawn timing. This class just knows how to build its
 * mesh, animate it (bob + spin + glow pulse), and show/hide on collect/respawn.
 *
 * Self-contained — owns its own THREE objects and disposes them on dispose().
 */

import * as THREE from 'three';

export type PickupType = 'health' | 'armor' | 'damage' | 'haste';

/** Static look + feel per pickup type. */
export interface PickupVisual {
  /** Emissive/icon colour. */
  color: number;
  /** Icon geometry builder — kept simple + low-poly to stay within budget. */
  geometry: () => THREE.BufferGeometry;
}

const VISUALS: Record<PickupType, PickupVisual> = {
  // Green cross-ish box cluster reads as "medkit".
  health: { color: 0x33dd66, geometry: () => new THREE.BoxGeometry(0.42, 0.42, 0.18) },
  // Blue octahedron reads as "armour shard".
  armor:  { color: 0x3aa0ff, geometry: () => new THREE.OctahedronGeometry(0.34) },
  // Hot-orange icosahedron = "quad damage".
  damage: { color: 0xff5a2a, geometry: () => new THREE.IcosahedronGeometry(0.32) },
  // Yellow tetrahedron = "haste".
  haste:  { color: 0xffd23a, geometry: () => new THREE.TetrahedronGeometry(0.4) },
};

const FLOAT_CENTER = 1.0;   // metres above pad the icon hovers around
const FLOAT_AMP = 0.14;     // bob amplitude
const FLOAT_SPEED = 2.2;    // bob angular speed
const SPIN_SPEED = 1.6;     // rad/s yaw spin

export class Pickup {
  readonly type: PickupType;
  readonly pos: THREE.Vector3;
  readonly group = new THREE.Group();

  /** True when the pickup is on the floor and collectable. */
  available = true;
  /** Seconds until respawn while collected. */
  private respawnIn = 0;

  private icon: THREE.Mesh;
  private ring: THREE.Mesh;
  private glow: THREE.Sprite;
  private t = 0;

  constructor(type: PickupType, pos: THREE.Vector3) {
    this.type = type;
    this.pos = pos.clone();
    const v = VISUALS[type];

    // Floating icon.
    this.icon = new THREE.Mesh(
      v.geometry(),
      new THREE.MeshStandardMaterial({
        color: v.color,
        emissive: v.color,
        emissiveIntensity: 0.9,
        metalness: 0.3,
        roughness: 0.4,
      }),
    );
    this.icon.position.y = FLOAT_CENTER;
    this.group.add(this.icon);

    // Ground ring (a flat glowing disc-ring on the pad).
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 24),
      new THREE.MeshBasicMaterial({
        color: v.color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.group.add(this.ring);

    // Soft additive glow sprite behind the icon.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: v.color,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.scale.set(1.3, 1.3, 1.3);
    this.glow.position.y = FLOAT_CENTER;
    this.group.add(this.glow);

    this.group.position.copy(this.pos);
  }

  /** Mark collected: hide the icon + start the respawn countdown. */
  collect(respawnSeconds: number) {
    this.available = false;
    this.respawnIn = respawnSeconds;
    this.icon.visible = false;
    this.glow.visible = false;
    // Dim the ring while on cooldown so the pad still reads as "a pad".
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.12;
  }

  private respawn() {
    this.available = true;
    this.icon.visible = true;
    this.glow.visible = true;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.5;
  }

  /** Animate + tick the respawn timer. Returns true on the frame it respawns. */
  update(dt: number): boolean {
    this.t += dt;
    if (this.available) {
      this.icon.position.y = FLOAT_CENTER + Math.sin(this.t * FLOAT_SPEED) * FLOAT_AMP;
      this.glow.position.y = this.icon.position.y;
      this.icon.rotation.y += SPIN_SPEED * dt;
      // Gentle glow pulse.
      const pulse = 0.3 + 0.12 * (0.5 + 0.5 * Math.sin(this.t * 3));
      (this.glow.material as THREE.SpriteMaterial).opacity = pulse;
      return false;
    }
    // Collected → count down to respawn.
    this.respawnIn -= dt;
    if (this.respawnIn <= 0) {
      this.respawn();
      return true;
    }
    return false;
  }

  dispose() {
    this.icon.geometry.dispose();
    (this.icon.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    (this.glow.material as THREE.Material).dispose();
  }
}
