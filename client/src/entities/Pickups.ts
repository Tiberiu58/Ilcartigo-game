/**
 * PickupManager — arena pickup pads (health / armor / ammo).
 *
 * Each map declares its pickups in MapMeta.pickups; the index in that array is
 * the pickup id used on the wire. This manager owns the floating visual (a
 * spinning glow icon over a ground ring), the bob/spin animation, and the
 * active/cooldown state.
 *
 * Authority model:
 *   - SOLO: the manager decides claims locally (trySoloClaim) — proximity +
 *     a caller-supplied `canClaim(type)` gate (e.g. don't grab health at full).
 *   - MP: the SERVER decides claims. The client never self-claims; it just
 *     reflects server `applyServerClaim` events + the Welcome cooldown snapshot.
 *
 * Timing uses Date.now() (wall-clock) so the MP server's availableAt values
 * line up with the client's local clock closely enough for a respawn cue.
 */

import * as THREE from 'three';
import type { PickupSpawn, PickupType } from '../maps/Map';

/** Per-type tuning: colour, respawn delay, and the heal/armor amount. */
export const PICKUP_CONFIG: Record<PickupType, { color: number; respawnMs: number; amount: number }> = {
  health: { color: 0x4ade80, respawnMs: 15000, amount: 50 },
  armor:  { color: 0x5aa9ff, respawnMs: 22000, amount: 50 },
  ammo:   { color: 0xf5d442, respawnMs: 12000, amount: 0 },
};

/** Horizontal + vertical capture half-extents around a pickup. */
const CLAIM_RADIUS_XZ = 1.7;
const CLAIM_RADIUS_Y = 2.2;

interface PickupInstance {
  id: number;
  type: PickupType;
  ground: THREE.Vector3;
  group: THREE.Group;
  baseY: number;
  active: boolean;
  /** Wall-clock ms when it becomes available again. */
  availableAt: number;
}

export class PickupManager {
  private scene: THREE.Scene;
  private items: PickupInstance[] = [];
  private root = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.root);
  }

  /** Rebuild for a new map. Disposes any existing pickup visuals first. */
  load(pickups: readonly PickupSpawn[] | undefined) {
    this.clear();
    if (!pickups) return;
    pickups.forEach((p, i) => {
      const group = this.buildVisual(p.type);
      const baseY = p.pos[1] + 0.7;
      group.position.set(p.pos[0], baseY, p.pos[2]);
      this.root.add(group);
      this.items.push({
        id: i,
        type: p.type,
        ground: new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]),
        group,
        baseY,
        active: true,
        availableAt: 0,
      });
    });
  }

  /** Apply a Welcome cooldown snapshot (MP late-join): hide on-cooldown pads. */
  setCooldowns(list: ReadonlyArray<{ id: number; availableAt: number }>) {
    const now = Date.now();
    for (const c of list) {
      const it = this.items[c.id];
      if (!it) continue;
      if (c.availableAt > now) {
        it.active = false;
        it.availableAt = c.availableAt;
        it.group.visible = false;
      }
    }
  }

  /** MP: the server says `id` was claimed; hide it until `availableAt`. */
  applyServerClaim(id: number, availableAt: number) {
    const it = this.items[id];
    if (!it) return;
    it.active = false;
    it.availableAt = availableAt;
    it.group.visible = false;
  }

  /**
   * SOLO claim check. Returns the claimed pickup (and starts its cooldown) if
   * the player is in range of an active pad AND `canClaim(type)` is true.
   * Returns null otherwise. Only ever call this in single-player.
   */
  trySoloClaim(playerFeet: THREE.Vector3, canClaim: (type: PickupType) => boolean): PickupInstance | null {
    for (const it of this.items) {
      if (!it.active) continue;
      if (Math.abs(playerFeet.x - it.ground.x) > CLAIM_RADIUS_XZ) continue;
      if (Math.abs(playerFeet.z - it.ground.z) > CLAIM_RADIUS_XZ) continue;
      if (Math.abs(playerFeet.y - it.ground.y) > CLAIM_RADIUS_Y) continue;
      if (!canClaim(it.type)) continue;
      it.active = false;
      it.availableAt = Date.now() + PICKUP_CONFIG[it.type].respawnMs;
      it.group.visible = false;
      return it;
    }
    return null;
  }

  /** Per-frame: spin + bob active pads, and re-show any whose cooldown elapsed. */
  update(dtSeconds: number) {
    const now = Date.now();
    const t = now / 1000;
    for (const it of this.items) {
      if (!it.active) {
        if (now >= it.availableAt) {
          it.active = true;
          it.group.visible = true;
        } else {
          continue;
        }
      }
      it.group.rotation.y += dtSeconds * 1.8;
      it.group.position.y = it.baseY + Math.sin(t * 2.2 + it.id) * 0.12;
    }
  }

  /** Make every pad available + visible (MP match reset). */
  resetAll() {
    for (const it of this.items) {
      it.active = true;
      it.availableAt = 0;
      it.group.visible = true;
    }
  }

  /** Remove all pickup visuals (map change / teardown). */
  clear() {
    for (const it of this.items) {
      this.root.remove(it.group);
      disposeGroup(it.group);
    }
    this.items.length = 0;
  }

  // ── Visuals ────────────────────────────────────────────────────────────────

  private buildVisual(type: PickupType): THREE.Group {
    const cfg = PICKUP_CONFIG[type];
    const g = new THREE.Group();

    // Ground ring — flat torus marking the pad footprint.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.55;
    g.add(ring);

    // Glow icon per type.
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color });
    if (type === 'health') {
      // A plus/cross.
      const bar = new THREE.BoxGeometry(0.5, 0.16, 0.16);
      const barV = new THREE.BoxGeometry(0.16, 0.5, 0.16);
      g.add(new THREE.Mesh(bar, mat));
      g.add(new THREE.Mesh(barV, mat));
    } else if (type === 'armor') {
      // A faceted shield-ish octahedron.
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.32), mat));
    } else {
      // Ammo — a small upright box (mag).
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.26), mat));
    }

    // A faint additive halo so pads read from across the map.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshBasicMaterial({
        color: cfg.color, transparent: true, opacity: 0.18,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    g.add(halo);
    return g;
  }
}

function disposeGroup(group: THREE.Group) {
  group.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}
