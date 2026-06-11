/**
 * PickupManager — owns the arena pickups on the current combat map.
 *
 * Responsibilities:
 *   - Build/destroy the Pickup meshes from a per-map spawn table.
 *   - Animate them (delegated to each Pickup) and detect player proximity.
 *   - Apply each pickup's effect on collect, fire SFX + a bus event, and run
 *     the respawn timer.
 *   - Track the two TIMED buffs (Damage / Haste): countdown, expiry, and a
 *     callback the HUD subscribes to for the active-buff chip row.
 *
 * Decoupled from Game via the small `PickupHost` interface (mirrors GunGame).
 * Player-only for v1. Solo combat + Gun Game only — Game disables it in
 * Practice and MP, so there's zero protocol/MP risk.
 */

import * as THREE from 'three';
import { Pickup, type PickupType } from '../entities/Pickup';
import type { PickupSpawn } from '../maps/Map';

/** Per-type gameplay tuning. */
export interface PickupDef {
  /** Instant heal amount (health). */
  heal?: number;
  /** Overshield grant + its cap (armor). */
  shield?: number;
  shieldCap?: number;
  /** Timed-buff weapon-damage multiplier (damage). */
  damageMul?: number;
  /** Timed-buff move-speed multiplier (haste). */
  speedMul?: number;
  /** Buff duration in seconds (timed buffs only). */
  duration?: number;
  /** Seconds before the pad respawns its pickup after collection. */
  respawn: number;
  /** SFX id played on collect (best-effort; silent if asset missing). */
  sound: string;
}

export const PICKUP_DEFS: Record<PickupType, PickupDef> = {
  health: { heal: 40, respawn: 12, sound: 'pickup_health' },
  armor:  { shield: 50, shieldCap: 100, respawn: 20, sound: 'pickup_armor' },
  damage: { damageMul: 1.6, duration: 9, respawn: 25, sound: 'pickup_power' },
  haste:  { speedMul: 1.4, duration: 9, respawn: 22, sound: 'pickup_haste' },
};

/** Snapshot of active timed buffs (seconds remaining; 0 = inactive). */
export interface ActiveBuffs {
  damage: number;
  haste: number;
}

/** The minimal engine surface PickupManager needs. Keeps it testable. */
export interface PickupHost {
  /** Player foot position (collection proximity is measured from here). */
  playerPos(): THREE.Vector3;
  /** Alive check — no collecting while dead. */
  playerAlive(): boolean;
  /** Heal by N (capped at max). Returns true if any HP was actually added. */
  healPlayer(amount: number): boolean;
  /** Add overshield up to cap. Returns true if any was added. */
  addShield(amount: number, cap: number): boolean;
  /** Set the player weapons' damage multiplier (1.0 = none). */
  setDamageMultiplier(m: number): void;
  /** Set the player's power-up speed multiplier (1.0 = none). */
  setSpeedMultiplier(m: number): void;
  /** Fire a one-shot SFX by id. */
  playSound(id: string): void;
}

// Collection thresholds. Horizontal grab radius + a vertical window so a pad on
// a lower floor (Industrial) can't be grabbed from the catwalk above.
const GRAB_RADIUS = 1.5;
const GRAB_VERTICAL = 1.9;

export class PickupManager {
  private scene: THREE.Scene;
  private host: PickupHost;
  private pickups: Pickup[] = [];

  /** Active timed-buff remaining seconds. */
  private damageLeft = 0;
  private hasteLeft = 0;

  /** Fired whenever a timed buff starts/ticks/expires (HUD chip row). */
  onBuffsChanged?: (buffs: ActiveBuffs) => void;

  constructor(scene: THREE.Scene, host: PickupHost) {
    this.scene = scene;
    this.host = host;
  }

  /** Build pickups for the given spawn table. Clears any existing ones first. */
  start(spawns: PickupSpawn[] | undefined) {
    this.clear();
    for (const s of spawns ?? []) {
      const p = new Pickup(s.type, new THREE.Vector3(s.x, s.y, s.z));
      this.pickups.push(p);
      this.scene.add(p.group);
    }
  }

  /** Remove all pickups + cancel active buffs (e.g. on map/mode change). */
  clear() {
    for (const p of this.pickups) {
      this.scene.remove(p.group);
      p.dispose();
    }
    this.pickups.length = 0;
    this.cancelBuffs();
  }

  /** Drop active buffs and reset the multipliers to neutral. */
  cancelBuffs() {
    const had = this.damageLeft > 0 || this.hasteLeft > 0;
    this.damageLeft = 0;
    this.hasteLeft = 0;
    this.host.setDamageMultiplier(1.0);
    this.host.setSpeedMultiplier(1.0);
    if (had) this.emitBuffs();
  }

  get hasPickups(): boolean { return this.pickups.length > 0; }

  update(dt: number) {
    // Animate + respawn-tick every pickup; collect available ones in range.
    const alive = this.host.playerAlive();
    const pp = alive ? this.host.playerPos() : null;
    for (const p of this.pickups) {
      p.update(dt);
      if (!p.available || !pp) continue;
      const dx = pp.x - p.pos.x;
      const dz = pp.z - p.pos.z;
      const dy = pp.y - p.pos.y;
      if (Math.abs(dy) > GRAB_VERTICAL) continue;
      if (dx * dx + dz * dz > GRAB_RADIUS * GRAB_RADIUS) continue;
      this.tryCollect(p);
    }

    // Tick timed buffs.
    if (this.damageLeft > 0 || this.hasteLeft > 0) {
      this.tickBuffs(dt);
    }
  }

  private tryCollect(p: Pickup) {
    const def = PICKUP_DEFS[p.type];
    let took = false;
    switch (p.type) {
      case 'health':
        took = this.host.healPlayer(def.heal!);
        break;
      case 'armor':
        took = this.host.addShield(def.shield!, def.shieldCap!);
        break;
      case 'damage':
        this.damageLeft = def.duration!;
        this.host.setDamageMultiplier(def.damageMul!);
        this.emitBuffs();
        took = true;
        break;
      case 'haste':
        this.hasteLeft = def.duration!;
        this.host.setSpeedMultiplier(def.speedMul!);
        this.emitBuffs();
        took = true;
        break;
    }
    // Instant pickups at full value are left on the pad (classic arena rule):
    // only collect when they actually did something.
    if (!took) return;
    p.collect(def.respawn);
    this.host.playSound(def.sound);
  }

  private tickBuffs(dt: number) {
    let changed = false;
    if (this.damageLeft > 0) {
      this.damageLeft -= dt;
      if (this.damageLeft <= 0) {
        this.damageLeft = 0;
        this.host.setDamageMultiplier(1.0);
        this.host.playSound('powerup_expire');
      }
      changed = true;
    }
    if (this.hasteLeft > 0) {
      this.hasteLeft -= dt;
      if (this.hasteLeft <= 0) {
        this.hasteLeft = 0;
        this.host.setSpeedMultiplier(1.0);
        this.host.playSound('powerup_expire');
      }
      changed = true;
    }
    if (changed) this.emitBuffs();
  }

  private emitBuffs() {
    this.onBuffsChanged?.({
      damage: Math.max(0, this.damageLeft),
      haste: Math.max(0, this.hasteLeft),
    });
  }
}
