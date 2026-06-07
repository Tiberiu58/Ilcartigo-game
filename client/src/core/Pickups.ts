/**
 * Pickups — arena power-ups (Phase 13).
 *
 * Quake/Krunker-style floating power-ups that spawn at fixed map locations,
 * get consumed on touch, and respawn on a timer. Three kinds:
 *   - health: instant heal (+HEAL hp, clamped to max)
 *   - damage: timed outgoing-damage multiplier
 *   - haste:  timed move-speed multiplier
 *
 * The PickupManager owns the visual meshes + animation + (in solo) the
 * touch/respawn logic. Effects themselves are applied by the Game (it owns the
 * player's HP / weapons / controller). In MP the SERVER is authoritative over
 * availability + effects; the manager runs in `serverMode` where it only
 * animates + reflects server-driven availability (no local touch detection).
 *
 * Visuals: a glowing octahedron core (bobbing + spinning) inside a faint
 * additive shell, a flat ground ring marking the spot, and a point light. On
 * pickup the core/shell/light hide and the ring dims until respawn.
 */

import * as THREE from 'three';
import type { PickupKind, PickupSpawn } from '../maps/Map';

export interface PickupConfig {
  kind: PickupKind;
  /** Display label for the announcer / HUD tray. */
  label: string;
  /** Theme colour (hex). Drives mesh + light + HUD. */
  color: number;
  /** Seconds before a consumed pickup respawns. */
  respawnSeconds: number;
  /**
   * Effect duration in seconds for timed power-ups (damage/haste). 0 for
   * instant effects (health).
   */
  durationSeconds: number;
  /** Instant heal amount (health only). */
  heal?: number;
  /** Multiplier for timed power-ups (damage → dmg ×, haste → speed ×). */
  multiplier?: number;
  /** Short HUD tray glyph. */
  glyph: string;
}

export const PICKUPS: Record<PickupKind, PickupConfig> = {
  health: {
    kind: 'health',
    label: 'HEALTH',
    color: 0x46e06a,
    respawnSeconds: 18,
    durationSeconds: 0,
    heal: 45,
    glyph: '+',
  },
  damage: {
    kind: 'damage',
    label: 'DAMAGE BOOST',
    color: 0xff7a2a,
    respawnSeconds: 30,
    durationSeconds: 15,
    multiplier: 1.5,
    glyph: '⚔',
  },
  haste: {
    kind: 'haste',
    label: 'HASTE',
    color: 0x49d0ff,
    respawnSeconds: 25,
    durationSeconds: 12,
    multiplier: 1.4,
    glyph: '»',
  },
};

/** Horizontal radius (m) within which the local player grabs a pickup. */
const PICKUP_RADIUS = 1.5;
/** Vertical tolerance (m) so a pickup on a higher ledge isn't grabbed from below. */
const PICKUP_VRANGE = 2.5;
/** Floating height of the core above the spawn point. */
const FLOAT_HEIGHT = 1.0;

interface PickupInstance {
  kind: PickupKind;
  cfg: PickupConfig;
  base: THREE.Vector3;
  group: THREE.Group;
  pivot: THREE.Object3D;     // holds the bobbing/spinning core + shell
  core: THREE.Mesh;
  shell: THREE.Mesh;
  ring: THREE.Mesh;
  light: THREE.PointLight;
  ringMat: THREE.MeshBasicMaterial;
  available: boolean;
  /** performance.now() ms when a consumed pickup respawns (solo only). */
  respawnAt: number;
  /** Animation phase offset so pickups don't bob in lockstep. */
  phase: number;
}

export class PickupManager {
  private scene: THREE.Scene;
  private items: PickupInstance[] = [];
  /** In server mode (MP) the manager doesn't detect touches or auto-respawn —
   *  the server drives availability via setAvailability. */
  private serverMode = false;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  get count(): number { return this.items.length; }

  setServerMode(on: boolean) { this.serverMode = on; }

  /** Build meshes for the given spawn list. Call clear() first if rebuilding. */
  build(spawns: PickupSpawn[]) {
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      this.items.push(this.makeInstance(s, i));
    }
  }

  /** Remove + dispose all pickup meshes. */
  clear() {
    for (const it of this.items) {
      this.scene.remove(it.group);
      it.group.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    }
    this.items.length = 0;
  }

  /**
   * Per-frame tick. Animates all pickups. In solo (not serverMode), also:
   *   - respawns consumed pickups whose timer elapsed,
   *   - detects local-player overlap and calls `tryPickup(kind)`; if it returns
   *     true the pickup is consumed (hidden + respawn scheduled).
   *
   * `playerPos` is the player's feet position, or null if dead (no touches).
   */
  update(dt: number, playerPos: THREE.Vector3 | null, tryPickup: (kind: PickupKind) => boolean) {
    this.elapsed += dt;
    const now = performance.now();
    for (const it of this.items) {
      // Respawn handling (solo).
      if (!this.serverMode && !it.available && now >= it.respawnAt) {
        this.setVisible(it, true);
      }

      // Animate the core when present.
      if (it.available) {
        it.pivot.rotation.y += dt * 1.8;
        it.pivot.position.y = FLOAT_HEIGHT + Math.sin(this.elapsed * 2.2 + it.phase) * 0.14;
      }
      // Ring always spins slowly (a subtle "spot" marker even when consumed).
      it.ring.rotation.z += dt * 0.6;

      // Touch detection (solo only).
      if (!this.serverMode && it.available && playerPos) {
        const dx = playerPos.x - it.base.x;
        const dz = playerPos.z - it.base.z;
        const dy = playerPos.y - it.base.y;
        if (dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(dy) <= PICKUP_VRANGE) {
          if (tryPickup(it.kind)) {
            this.consume(it);
          }
        }
      }
    }
  }

  /** Consume a pickup locally (solo): hide + schedule respawn. */
  private consume(it: PickupInstance) {
    this.setVisible(it, false);
    it.respawnAt = performance.now() + it.cfg.respawnSeconds * 1000;
  }

  /**
   * MP hook: the server says a pickup (by build index) is available or not.
   * `respawnInMs` is informational (unused for now — the server re-broadcasts
   * availability when it respawns).
   */
  setAvailability(index: number, available: boolean) {
    const it = this.items[index];
    if (!it) return;
    this.setVisible(it, available);
  }

  private setVisible(it: PickupInstance, available: boolean) {
    it.available = available;
    it.pivot.visible = available;
    it.light.visible = available;
    it.ringMat.opacity = available ? 0.6 : 0.16;
  }

  private makeInstance(spawn: PickupSpawn, index: number): PickupInstance {
    const cfg = PICKUPS[spawn.kind];
    const group = new THREE.Group();
    group.position.copy(spawn.pos);

    const pivot = new THREE.Object3D();
    pivot.position.y = FLOAT_HEIGHT;

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 }),
    );
    const shell = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.52, 0),
      new THREE.MeshBasicMaterial({
        color: cfg.color, transparent: true, opacity: 0.22,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    pivot.add(core, shell);

    const ringMat = new THREE.MeshBasicMaterial({
      color: cfg.color, transparent: true, opacity: 0.6,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 28), ringMat);
    ring.rotation.x = Math.PI / 2;          // lie flat
    ring.position.y = 0.08;                  // just above the floor

    const light = new THREE.PointLight(cfg.color, 0.7, 7);
    light.position.y = FLOAT_HEIGHT;

    group.add(pivot, ring, light);
    this.scene.add(group);

    return {
      kind: spawn.kind, cfg, base: spawn.pos.clone(),
      group, pivot, core, shell, ring, light, ringMat,
      available: true, respawnAt: 0,
      phase: index * 1.7,
    };
  }
}
