/**
 * PowerupManager — arena power-up pads (render + solo logic).
 *
 * The classic arena-shooter map-control hook: timed buff pads you rotate to,
 * fight over, and lose when you die. Two pads per combat map:
 *   - OVERCHARGE (crimson) — your weapon damage is boosted for a few seconds.
 *   - RAPID FIRE (gold)    — your fire rate is boosted for a few seconds.
 *
 * Deliberately SOLO-ONLY and fully self-contained — it does NOT touch the
 * health-pickup wire protocol (that was the trap the earlier power-up branch
 * fell into). MP damage is server-authoritative, so a client-only buff would
 * mislead; the manager early-outs whenever `game.mp` is set. Effects live in
 * the weapon layer (`WeaponInventory.setDamage/FireRateMultiplier`), so nothing
 * about networking, movement, or the server controller changes.
 *
 * Placement is derived from each map's FFA spawn anchors (guaranteed clear of
 * solids), nudged toward map centre so the pads sit in contested space — with a
 * solid-overlap fallback to the raw anchor, so a future map can never embed a
 * pad inside geometry. Geometry rebuilds when the map changes.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

export type PowerupType = 'damage' | 'haste';

interface PowerupDef {
  id: number;
  type: PowerupType;
  pos: [number, number, number];
}

interface PowerupEntry {
  def: PowerupDef;
  group: THREE.Group;
  available: boolean;
  /** performance.now() ms when it respawns after being grabbed. */
  respawnAt: number;
}

const POWERUP_RESPAWN_MS = 20_000;
const POWERUP_RADIUS = 1.5;
const POWERUP_VERTICAL_TOLERANCE = 2.5;

/** Crimson for OVERCHARGE, warm gold for RAPID — instantly readable on sight. */
const POWERUP_COLOR: Record<PowerupType, number> = {
  damage: 0xff3b54,
  haste: 0xffc23a,
};

export class PowerupManager {
  private game: Game;
  private entries = new Map<number, PowerupEntry>();
  private builtMapId: string | null = null;
  private bob = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /** True if x/z sits clear of any tall static solid (used to validate pads). */
  private clearOf(x: number, z: number): boolean {
    for (const s of this.game.world.staticSolids) {
      if (s.max.y <= 0.6) continue;               // floor/ground boxes don't block
      if (x > s.min.x - 0.5 && x < s.max.x + 0.5 &&
          z > s.min.z - 0.5 && z < s.max.z + 0.5) return false;
    }
    return true;
  }

  /** Compute this map's pad placements from its spawn anchors. */
  private placements(): PowerupDef[] {
    const spawns = this.game.mapSpawns;
    if (spawns.length === 0) return [];
    const types: PowerupType[] = ['haste', 'damage'];
    // Two anchors spread across the spawn list so the pads aren't adjacent.
    const idxs = spawns.length >= 2
      ? [Math.floor(spawns.length * 0.2), Math.floor(spawns.length * 0.7)]
      : [0];
    const out: PowerupDef[] = [];
    for (let i = 0; i < idxs.length; i++) {
      const s = spawns[idxs[i] % spawns.length];
      // Pull 45% toward map centre for contested placement; fall back to the
      // raw (guaranteed-clear) anchor if the centred point overlaps a solid.
      let x = s.x * 0.55;
      let z = s.z * 0.55;
      if (!this.clearOf(x, z)) { x = s.x; z = s.z; }
      out.push({ id: i + 1, type: types[i % types.length], pos: [x, s.y, z] });
    }
    return out;
  }

  private clear() {
    for (const e of this.entries.values()) {
      this.game.scene.remove(e.group);
      e.group.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    }
    this.entries.clear();
  }

  private rebuild() {
    this.clear();
    for (const def of this.placements()) {
      const group = buildPowerupPad(def.type);
      group.position.set(def.pos[0], def.pos[1], def.pos[2]);
      this.game.scene.add(group);
      this.entries.set(def.id, { def, group, available: true, respawnAt: 0 });
    }
    this.builtMapId = this.game.currentMapId;
  }

  /** Reset all pads to available (mode swap / match reset). */
  resetAll() {
    for (const e of this.entries.values()) {
      e.available = true;
      e.respawnAt = 0;
      e.group.visible = true;
    }
  }

  /** Enumerate pads for the minimap: world x/z, type, current availability. */
  forEachPad(cb: (x: number, z: number, type: PowerupType, available: boolean) => void) {
    for (const e of this.entries.values()) cb(e.def.pos[0], e.def.pos[2], e.def.type, e.available);
  }

  /** True only in the solo combat modes that field power-ups. */
  private active(): boolean {
    if (this.game.mp) return false;
    const m = this.game.mode;
    return m === 'combat' || m === 'tdm' || m === 'onslaught';
  }

  update(dt: number) {
    if (this.builtMapId !== this.game.currentMapId) this.rebuild();
    this.bob += dt;

    // Hide pads entirely in modes that don't field power-ups (Gun Game,
    // Practice, MP) so they don't clutter the arena.
    const on = this.active();
    for (const e of this.entries.values()) {
      const shouldShow = on && e.available;
      if (e.group.visible !== shouldShow) e.group.visible = shouldShow;
      if (!e.group.visible) continue;
      e.group.rotation.y += dt * 1.8;
      e.group.position.y = e.def.pos[1] + 0.45 + Math.sin(this.bob * 2.2 + e.def.id) * 0.14;
    }

    if (!on) return;

    const now = performance.now();
    const dead = this.game.playerActor.health.dead;
    const pos = this.game.player.pos;
    for (const e of this.entries.values()) {
      if (!e.available) {
        if (now >= e.respawnAt) {
          e.available = true;
          e.group.visible = true;
        }
        continue;
      }
      if (dead) continue;
      const dx = pos.x - e.def.pos[0];
      const dz = pos.z - e.def.pos[2];
      if (dx * dx + dz * dz > POWERUP_RADIUS * POWERUP_RADIUS) continue;
      if (Math.abs(pos.y - e.def.pos[1]) > POWERUP_VERTICAL_TOLERANCE) continue;
      // Grab.
      e.available = false;
      e.respawnAt = now + POWERUP_RESPAWN_MS;
      e.group.visible = false;
      this.game.grantPowerup(e.def.type);
    }
  }
}

/** A floating power-up pad: a glowing gem in the type colour over a ground ring. */
function buildPowerupPad(type: PowerupType): THREE.Group {
  const g = new THREE.Group();
  const color = POWERUP_COLOR[type];

  const gem = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshLambertMaterial({
      color, emissive: color, emissiveIntensity: 0.6, flatShading: true,
      transparent: true, opacity: 0.9,
    }),
  );
  g.add(gem);

  // A thin halo ring around the gem for extra readability at distance.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.05, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
  );
  halo.rotation.x = Math.PI / 2;
  g.add(halo);

  // Soft glow ring on the ground beneath.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.8, 24),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.44;
  g.add(ring);

  return g;
}
