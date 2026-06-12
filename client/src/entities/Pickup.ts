/**
 * Pickup — a single floating world item players run over to collect.
 *
 * Visuals: a glowing, slowly-spinning + bobbing core (octahedron) sitting on a
 * soft ground glow, tinted per kind. When collected it hides and starts a
 * respawn countdown; when the timer elapses it pops back with a flash so the
 * fight over the node continues.
 *
 * Pure visual/state container — no gameplay effect logic lives here. The
 * PickupManager owns collection detection + applies the effect via its host.
 * Solo/client-only (pickups don't run in MP), so no networking concerns.
 */

import * as THREE from 'three';

/** The kinds of pickup. Health/Armor are instant; Damage/Haste are timed
 *  power-ups handled by the Game's power-up timers. */
export type PickupKind = 'health' | 'armor' | 'damage' | 'haste';

export interface PickupNode {
  pos: THREE.Vector3;
  kind: PickupKind;
}

export interface PickupKindDef {
  /** Core + glow colour. */
  color: number;
  /** Seconds the node stays gone after being grabbed. */
  respawn: number;
  /** Collection radius (metres, horizontal) around the node centre. */
  radius: number;
  /** Short label for the announcer / HUD. */
  label: string;
}

export const PICKUP_DEFS: Record<PickupKind, PickupKindDef> = {
  health: { color: 0x4ade80, respawn: 12, radius: 1.5, label: 'HEALTH' },
  armor:  { color: 0x38bdf8, respawn: 18, radius: 1.5, label: 'ARMOR' },
  damage: { color: 0xff5a3a, respawn: 25, radius: 1.6, label: 'DAMAGE BOOST' },
  haste:  { color: 0xfacc15, respawn: 22, radius: 1.6, label: 'HASTE' },
};

/** Centre height of the floating core above the node's ground point. */
const FLOAT_HEIGHT = 1.0;
const BOB_AMP = 0.18;

export class Pickup {
  readonly kind: PickupKind;
  readonly def: PickupKindDef;
  /** Ground point of the node (y is the floor). */
  readonly base: THREE.Vector3;
  /** Centre of the collectable volume (floats above the base). */
  readonly center = new THREE.Vector3();

  /** True when collectable; false while respawning. */
  available = true;

  private group: THREE.Group;
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private light: THREE.PointLight;
  private scene: THREE.Scene;
  private spin = 0;
  private bob = Math.random() * Math.PI * 2; // desync bob phase per node
  private respawnTimer = 0;

  constructor(node: PickupNode, scene: THREE.Scene) {
    this.kind = node.kind;
    this.def = PICKUP_DEFS[node.kind];
    this.scene = scene;
    this.base = node.pos.clone();
    this.center.copy(this.base).y += FLOAT_HEIGHT;

    this.group = new THREE.Group();
    this.group.position.copy(this.base);

    // Spinning core — an octahedron reads as a "gem"/power node.
    const coreGeom = new THREE.OctahedronGeometry(0.34, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: this.def.color,
      emissive: this.def.color,
      emissiveIntensity: 0.9,
      metalness: 0.2,
      roughness: 0.35,
    });
    this.core = new THREE.Mesh(coreGeom, coreMat);
    this.core.position.y = FLOAT_HEIGHT;
    this.group.add(this.core);

    // Soft additive glow shell around the core.
    const glowGeom = new THREE.SphereGeometry(0.6, 16, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.def.color,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(glowGeom, glowMat);
    this.glow.position.y = FLOAT_HEIGHT;
    this.group.add(this.glow);

    // Ground ring so the node reads on the floor even from a distance.
    const ringGeom = new THREE.RingGeometry(0.55, 0.75, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.def.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.group.add(ring);

    this.light = new THREE.PointLight(this.def.color, 0.6, 6, 2);
    this.light.position.y = FLOAT_HEIGHT;
    this.group.add(this.light);

    scene.add(this.group);
  }

  /** Animate bob/spin and tick the respawn timer. Returns true on the frame
   *  the node becomes available again (so the manager can flash + ping). */
  update(dt: number): boolean {
    if (this.available) {
      this.spin += dt * 1.4;
      this.bob += dt * 2.2;
      this.core.rotation.y = this.spin;
      this.core.rotation.x = this.spin * 0.5;
      this.core.position.y = FLOAT_HEIGHT + Math.sin(this.bob) * BOB_AMP;
      this.glow.position.y = this.core.position.y;
      this.light.position.y = this.core.position.y;
      return false;
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.setAvailable(true);
      return true;
    }
    return false;
  }

  /** Mark collected: hide the node + start the respawn countdown. */
  collect() {
    this.setAvailable(false);
    this.respawnTimer = this.def.respawn;
  }

  private setAvailable(v: boolean) {
    this.available = v;
    this.group.visible = v;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  }
}
