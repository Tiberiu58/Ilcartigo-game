/**
 * PickupManager — owns the active map's pickups and runs collection.
 *
 * Each frame it bobs/spins the nodes, then checks proximity for the local
 * player (all kinds) and bots (health only — keeps bot buffs from frustrating
 * the player). Whether a pickup is actually *consumed* is decided by the host
 * (e.g. a full-HP player walking over a Health node leaves it for later), so
 * the manager stays free of gameplay rules.
 *
 * Solo/client-only: the manager is built only in combat/gungame modes while
 * NOT connected to MP. No protocol involvement.
 */

import * as THREE from 'three';
import { Pickup, type PickupKind, type PickupNode } from '../entities/Pickup';
import type { Bot } from '../entities/Bot';

/** The minimal surface the manager needs from the engine to apply effects. */
export interface PickupHost {
  /** Apply `kind` to the local player. Return true if it was consumed (so the
   *  node despawns) or false to leave it (e.g. health while at full HP). */
  tryApplyToPlayer(kind: PickupKind): boolean;
  /** Apply a Health pickup to a bot. Return true if consumed. */
  tryApplyToBot(bot: Bot, kind: PickupKind): boolean;
  /** Bright flash at a world point (collection + respawn feedback). */
  flashFX(pos: THREE.Vector3, color: number): void;
  /** One-shot SFX (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

/** Max vertical gap between a node's floor and an actor's feet to collect it —
 *  stops grabbing a pickup from a catwalk one floor up/down. */
const VERTICAL_TOLERANCE = 2.2;

export class PickupManager {
  private scene: THREE.Scene;
  private host: PickupHost;
  private pickups: Pickup[] = [];

  constructor(scene: THREE.Scene, host: PickupHost) {
    this.scene = scene;
    this.host = host;
  }

  /** Rebuild the node set for a map. Pass an empty array to clear. */
  build(nodes: PickupNode[] | undefined) {
    this.clear();
    if (!nodes) return;
    for (const n of nodes) this.pickups.push(new Pickup(n, this.scene));
  }

  clear() {
    for (const p of this.pickups) p.dispose();
    this.pickups = [];
  }

  /** Tick animations + run collection. `playerFeet` is the player's ground
   *  position; `bots` are the active single-player bots (skipped in MP). */
  update(dt: number, playerFeet: THREE.Vector3, playerDead: boolean, bots: Bot[]) {
    for (const p of this.pickups) {
      const respawned = p.update(dt);
      if (respawned) {
        this.host.flashFX(p.center, p.def.color);
        this.host.playSound('pickup_spawn');
        continue;
      }
      if (!p.available) continue;

      // Player has first dibs (kinds: all).
      if (!playerDead && this.withinReach(playerFeet, p.base, p.def.radius)) {
        if (this.host.tryApplyToPlayer(p.kind)) {
          this.collected(p);
          continue;
        }
      }

      // Bots grab Health only, and only when they can actually use it.
      if (p.kind === 'health') {
        for (const b of bots) {
          if (!b.active || b.health.dead) continue;
          if (this.withinReach(b.group.position, p.base, p.def.radius)) {
            if (this.host.tryApplyToBot(b, p.kind)) {
              this.collected(p);
              break;
            }
          }
        }
      }
    }
  }

  /** Nearest *available* Health node to `from` (horizontal distance), or null
   *  if none are up. Used by low-HP bots to retreat-and-heal. */
  nearestAvailableHealth(from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (!p.available || p.kind !== 'health') continue;
      const dx = from.x - p.base.x;
      const dz = from.z - p.base.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = p.base; }
    }
    return best;
  }

  private collected(p: Pickup) {
    this.host.flashFX(p.center, p.def.color);
    p.collect();
  }

  private withinReach(feet: THREE.Vector3, base: THREE.Vector3, radius: number): boolean {
    if (Math.abs(feet.y - base.y) > VERTICAL_TOLERANCE) return false;
    const dx = feet.x - base.x;
    const dz = feet.z - base.z;
    return dx * dx + dz * dz <= radius * radius;
  }
}
