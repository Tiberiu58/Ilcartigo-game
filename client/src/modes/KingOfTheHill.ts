/**
 * King of the Hill — solo zone-control mode ("hold the hill").
 *
 * A fresh objective type: instead of racing to a kill count, you fight to OCCUPY
 * a single contested zone at the arena's heart. Stand in it alone and your
 * capture meter fills; let a bot in and it's CONTESTED (nobody scores); cede it
 * and the enemy pool fills instead. First side to the goal wins → the standard
 * post-match overlay (a natural ad breakpoint). It rewards positioning + map
 * control, not just aim — the constant push-and-shove "take the point, hold the
 * point" loop arena shooters are loved for.
 *
 * Why it's low-risk + self-contained:
 *   - SOLO only. No protocol / server / controller changes.
 *   - Runs ON TOP of the ordinary combat bot roster (the 3 base bots stay live
 *     and auto-respawn), so the arena is already alive — this controller only
 *     adds the zone, the scoring, and the win check.
 *   - Reuses the kill bus for free: every frag still feeds XP / stats / killfeed
 *     / announcer / mastery exactly as in solo FFA. Death → normal auto-respawn.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) every
 * frame to run the capture logic.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

const GOAL = 100;               // capture points to win
const PLAYER_RATE = 13;         // points/sec while you hold it uncontested
const ENEMY_RATE = 10;          // points/sec while the enemy holds it (a touch slower → you have the edge)
const RADIUS = 5.5;             // hill radius (horizontal)
const CENTER = new THREE.Vector3(0, 0, 0);

export type HillStatus = 'neutral' | 'holding' | 'contested' | 'enemy';

const STATUS_COLOR: Record<HillStatus, number> = {
  neutral: 0x8893a5,
  holding: 0x36e08a,
  contested: 0xffb020,
  enemy: 0xff4d5e,
};

export class KingOfTheHill {
  private game: Game;
  active = false;

  private playerScore = 0;
  private enemyScore = 0;
  private status: HillStatus = 'neutral';

  // Visual zone (cylinder column + ground ring), added to the scene on start.
  private group: THREE.Group | null = null;
  private column: THREE.Mesh | null = null;
  private ring: THREE.Mesh | null = null;

  // Throttle UI emits to meaningful changes.
  private lastEmit = '';
  private _scratch = new THREE.Vector3();

  /** HUD ticker: integer scores + goal + current status. */
  onState?: (playerScore: number, enemyScore: number, goal: number, status: HillStatus) => void;
  /** Fired when the run ends. */
  onEnd?: (won: boolean, playerScore: number, enemyScore: number) => void;

  constructor(game: Game) {
    this.game = game;
  }

  start() {
    this.active = true;
    this.playerScore = 0;
    this.enemyScore = 0;
    this.status = 'neutral';
    this.lastEmit = '';
    this.buildZone();
    this.emitState(true);
  }

  stop() {
    this.active = false;
    this.teardownZone();
  }

  update(dt: number) {
    if (!this.active || this.game.matchEnded) return;

    const playerIn = !this.game.playerActor.health.dead && this.inZone(this.game.player.pos);
    let enemyIn = false;
    for (const b of this.game.bots) {
      if (b.active && !b.health.dead && this.inZone(b.getEye(this._scratch))) { enemyIn = true; break; }
    }

    let status: HillStatus;
    if (playerIn && !enemyIn) {
      status = 'holding';
      this.playerScore = Math.min(GOAL, this.playerScore + PLAYER_RATE * dt);
    } else if (!playerIn && enemyIn) {
      status = 'enemy';
      this.enemyScore = Math.min(GOAL, this.enemyScore + ENEMY_RATE * dt);
    } else if (playerIn && enemyIn) {
      status = 'contested';
    } else {
      status = 'neutral';
    }
    this.status = status;
    this.tickVisual(dt);

    if (this.playerScore >= GOAL) { this.end(true); return; }
    if (this.enemyScore >= GOAL) { this.end(false); return; }

    this.emitState();
  }

  /** Reset scores for a rematch (Play Again) — main.ts calls start() again. */
  static get goal() { return GOAL; }

  private end(won: boolean) {
    if (!this.active) return;
    this.active = false;
    this.teardownZone();
    this.onEnd?.(won, Math.round(this.playerScore), Math.round(this.enemyScore));
  }

  private inZone(p: THREE.Vector3): boolean {
    const dx = p.x - CENTER.x;
    const dz = p.z - CENTER.z;
    return dx * dx + dz * dz <= RADIUS * RADIUS;
  }

  private emitState(force = false) {
    const ps = Math.round(this.playerScore);
    const es = Math.round(this.enemyScore);
    const key = `${ps}|${es}|${this.status}`;
    if (!force && key === this.lastEmit) return;
    this.lastEmit = key;
    this.onState?.(ps, es, GOAL, this.status);
  }

  // ── Zone visuals ────────────────────────────────────────────────────────

  private buildZone() {
    this.teardownZone();
    const g = new THREE.Group();
    g.position.copy(CENTER);

    // Translucent column so the hill reads from across the arena + at any height
    // (the central high ground on some maps is literally the hill).
    const colGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, 6, 32, 1, true);
    const colMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.neutral, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const column = new THREE.Mesh(colGeo, colMat);
    column.position.y = 3;
    g.add(column);
    this.column = column;

    // Bright ground ring marking the footprint.
    const ringGeo = new THREE.RingGeometry(RADIUS - 0.35, RADIUS, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.neutral, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    this.ring = ring;

    this.game.scene.add(g);
    this.group = g;
  }

  private tickVisual(dt: number) {
    const color = STATUS_COLOR[this.status];
    if (this.column) (this.column.material as THREE.MeshBasicMaterial).color.setHex(color);
    if (this.ring) {
      const mat = this.ring.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      // Gentle pulse so the ring always reads as "active".
      this.ringPulse += dt;
      mat.opacity = 0.55 + 0.2 * (0.5 + 0.5 * Math.sin(this.ringPulse * 3));
    }
  }
  private ringPulse = 0;

  private teardownZone() {
    if (!this.group) return;
    this.game.scene.remove(this.group);
    this.column?.geometry.dispose();
    (this.column?.material as THREE.Material | undefined)?.dispose();
    this.ring?.geometry.dispose();
    (this.ring?.material as THREE.Material | undefined)?.dispose();
    this.group = null;
    this.column = null;
    this.ring = null;
  }
}
