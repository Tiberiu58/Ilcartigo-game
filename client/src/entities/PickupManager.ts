/**
 * PickupManager — map health pickups (render + logic).
 *
 * Renders a floating health pad (green crystal + white cross) at each pickup
 * point for the current map, bobbing + spinning. Availability is authoritative:
 *   - SOLO: this manager runs the logic itself — overlap → heal → cooldown →
 *     respawn — mirroring the server tick in single-player.
 *   - MP: the SERVER owns it. We never heal or consume locally; we just reflect
 *     ServerPickupUpdate events (show/hide) and play local feedback when WE
 *     grabbed one (byId === our id).
 *
 * Placement + tuning come from the shared Pickups.ts data (in sync with the
 * server). Geometry is rebuilt when the map changes (detected via currentMapId).
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import {
  PICKUPS_BY_MAP, HEALTH_PICKUP_AMOUNT, PICKUP_RESPAWN_MS,
  PICKUP_RADIUS, PICKUP_VERTICAL_TOLERANCE, type PickupDef,
} from '../maps/Pickups';

interface PickupEntry {
  def: PickupDef;
  group: THREE.Group;
  available: boolean;
  /** SOLO only: performance.now() ms when it respawns. */
  respawnAt: number;
}

export class PickupManager {
  private game: Game;
  private entries = new Map<number, PickupEntry>();
  private builtMapId: string | null = null;
  private bob = 0;

  constructor(game: Game) {
    this.game = game;
  }

  /** Tear down current meshes + state. */
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

  /** Build meshes for the current map's pickups (all start available). */
  private rebuild() {
    this.clear();
    const defs = PICKUPS_BY_MAP[this.game.currentMapId] ?? [];
    for (const def of defs) {
      const group = buildHealthPad();
      group.position.set(def.pos[0], def.pos[1], def.pos[2]);
      this.game.scene.add(group);
      this.entries.set(def.id, { def, group, available: true, respawnAt: 0 });
    }
    this.builtMapId = this.game.currentMapId;
  }

  /** Build now if the map changed since the last build. Lets the MP Welcome
   *  handler apply server states immediately rather than waiting a frame. */
  ensureBuilt() {
    if (this.builtMapId !== this.game.currentMapId) this.rebuild();
  }

  /**
   * Apply an authoritative availability change from the server (MP). Plays the
   * grab feedback if WE took it. No-op for unknown ids (e.g. map mismatch).
   */
  applyServerUpdate(id: number, available: boolean, byId?: string) {
    this.ensureBuilt();
    const e = this.entries.get(id);
    if (!e) return;
    e.available = available;
    e.group.visible = available;
    if (!available && byId && this.game.isLocalPlayer(byId)) this.feedback();
  }

  /** Apply the full initial pickup state from the server Welcome (MP join). */
  applyWelcomeStates(states: ReadonlyArray<{ id: number; available: boolean }>) {
    this.ensureBuilt();
    this.resetAll();
    for (const s of states) {
      const e = this.entries.get(s.id);
      if (!e) continue;
      e.available = s.available;
      e.group.visible = s.available;
    }
  }

  /** Reset all pickups to available (e.g. MP match reset, or solo mode swap). */
  resetAll() {
    for (const e of this.entries.values()) {
      e.available = true;
      e.respawnAt = 0;
      e.group.visible = true;
    }
  }

  /** Per-frame. Animates pads + runs solo pickup logic. */
  update(dt: number) {
    if (this.builtMapId !== this.game.currentMapId) this.rebuild();
    this.bob += dt;

    // Animate visible pads.
    for (const e of this.entries.values()) {
      if (!e.group.visible) continue;
      e.group.rotation.y += dt * 1.6;
      e.group.position.y = e.def.pos[1] + 0.35 + Math.sin(this.bob * 2 + e.def.id) * 0.12;
    }

    // SOLO logic only — in MP the server is authoritative.
    if (this.game.mp) return;
    if (this.game.mode !== 'combat') return;

    const now = performance.now();
    const health = this.game.playerActor.health;
    const pos = this.game.player.pos;
    for (const e of this.entries.values()) {
      if (!e.available) {
        if (now >= e.respawnAt) {
          e.available = true;
          e.group.visible = true;
        }
        continue;
      }
      if (health.dead || health.current >= health.max) continue;
      const dx = pos.x - e.def.pos[0];
      const dz = pos.z - e.def.pos[2];
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      if (Math.abs(pos.y - e.def.pos[1]) > PICKUP_VERTICAL_TOLERANCE) continue;
      // Grab.
      if (e.def.type === 'health') health.heal(HEALTH_PICKUP_AMOUNT);
      e.available = false;
      e.respawnAt = now + PICKUP_RESPAWN_MS;
      e.group.visible = false;
      this.feedback();
    }
  }

  /** Local grab feedback: heal SFX + a brief green screen flash. */
  private feedback() {
    this.game.audio.play('pickup_health');
    const el = document.getElementById('heal-flash');
    if (el) {
      el.classList.remove('show');
      void el.offsetWidth;                // restart the CSS animation
      el.classList.add('show');
      window.setTimeout(() => el.classList.remove('show'), 360);
    }
  }
}

/** A floating health pad: green translucent crystal + white cross billboard. */
function buildHealthPad(): THREE.Group {
  const g = new THREE.Group();

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    new THREE.MeshLambertMaterial({
      color: 0x36e08a, emissive: 0x0f6e42, flatShading: true,
      transparent: true, opacity: 0.85,
    }),
  );
  g.add(crystal);

  // White cross (two thin boxes) on the crystal — the universal "health" mark.
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), crossMat);
  const barH = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), crossMat);
  g.add(barV);
  g.add(barH);

  // A soft glow ring on the ground beneath it.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.7, 20),
    new THREE.MeshBasicMaterial({
      color: 0x36e08a, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.34;
  g.add(ring);

  return g;
}
