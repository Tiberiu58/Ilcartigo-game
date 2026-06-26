/**
 * Hardpoint — solo King-of-the-Hill objective mode.
 *
 * A glowing capture zone sits on the map. Stand in it (and keep enemies out) to
 * bank capture points; bots hunting you naturally crowd in and CONTEST it, so
 * the hill becomes a fight you have to win and hold. The zone RELOCATES every
 * few seconds, forcing constant repositioning instead of a single camp. First
 * side to the capture goal wins → a results card (a natural ad breakpoint).
 *
 * Why it's low-risk + self-contained:
 *   - SOLO only. No protocol / server / controller changes.
 *   - Reuses the normal respawning FFA combat roster verbatim (`game.bots`),
 *     so every frag still flows through the kill bus → XP / stats / killfeed /
 *     announcer / killstreak rewards "just work". The mode only overlays a
 *     scoring zone + a win condition; it never touches the bots themselves.
 *   - The enemy "team" is the whole bot pool, scored as one — a clean solo
 *     "you vs the room" objective race.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt). The mode
 * holds no kill subscription (kills are incidental here — the objective is the
 * hill), so it's purely a per-frame presence/score loop.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

const CAPTURE_GOAL = 100;       // capture points to win
const SCORE_RATE = 9;           // points/sec while you hold it uncontested
const ROTATE_SEC = 26;          // the hill relocates this often
const HILL_RADIUS = 5.2;        // capture radius (horizontal, world units)
const HILL_VTOL = 4.5;          // vertical tolerance so decks/bridges don't false-trigger

export type HillControl = 'neutral' | 'you' | 'enemy' | 'contested';

export interface HardpointResult {
  youWon: boolean;
  youScore: number;
  enemyScore: number;
  captures: number;     // how many times the hill relocated this match (flavour)
  xpEarned: number;
}

const CONTROL_COLOR: Record<HillControl, number> = {
  neutral:   0x8aa0b0,
  you:       0x4ce0c0,
  enemy:     0xff4a5a,
  contested: 0xffd24a,
};

export class Hardpoint {
  private game: Game;

  active = false;
  private ended = false;
  private youScore = 0;
  private enemyScore = 0;
  private rotateTimer = ROTATE_SEC;
  private captures = 0;
  private runXp = 0;

  /** Current hill centre in world space (read by the minimap). */
  readonly pos = new THREE.Vector3();
  /** Current control state (read by the minimap for colour). */
  control: HillControl = 'neutral';

  // Visual: a translucent capture cylinder + ground disc, recoloured by control.
  private group: THREE.Group | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private discMat: THREE.MeshBasicMaterial | null = null;
  private bob = 0;

  /** HUD ticker: your score, enemy score, goal, control state, seconds to move. */
  onState?: (you: number, enemy: number, goal: number, control: HillControl, rotateIn: number) => void;
  /** Fired when the hill relocates — drives a center banner + SFX. */
  onHillMove?: () => void;
  /** Fired when someone reaches the goal — drives the results card. */
  onEnd?: (r: HardpointResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a fresh match (also used by "Play Again"). */
  start() {
    this.active = true;
    this.ended = false;
    this.youScore = 0;
    this.enemyScore = 0;
    this.captures = 0;
    this.runXp = 0;
    this.rotateTimer = ROTATE_SEC;
    this.ensureVisual();
    this.pickHill(true);
    this.emit();
  }

  /** End the match + hide the zone. Called on quit-to-menu / mode switch. */
  stop() {
    this.active = false;
    if (this.group) this.group.visible = false;
  }

  update(dt: number) {
    if (!this.active || this.ended) return;
    this.bob += dt;

    // Relocate the hill on a timer (constant repositioning, no single camp).
    this.rotateTimer -= dt;
    if (this.rotateTimer <= 0) {
      this.pickHill(false);
      this.rotateTimer = ROTATE_SEC;
      this.captures++;
      this.onHillMove?.();
    }

    // Presence: you (alive) + any active living bot inside the zone.
    const playerIn = !this.game.playerActor.health.dead
      && this.inZone(this.game.player.pos.x, this.game.player.pos.y, this.game.player.pos.z);
    let enemyIn = false;
    for (const b of this.game.bots) {
      if (!b.active || b.health.dead) continue;
      const p = b.group.position;
      if (this.inZone(p.x, p.y, p.z)) { enemyIn = true; break; }
    }

    let control: HillControl = 'neutral';
    if (playerIn && enemyIn) control = 'contested';
    else if (playerIn) control = 'you';
    else if (enemyIn) control = 'enemy';
    this.control = control;

    if (control === 'you') {
      this.youScore = Math.min(CAPTURE_GOAL, this.youScore + SCORE_RATE * dt);
    } else if (control === 'enemy') {
      this.enemyScore = Math.min(CAPTURE_GOAL, this.enemyScore + SCORE_RATE * dt);
    }

    this.applyVisual(control);

    if (this.youScore >= CAPTURE_GOAL || this.enemyScore >= CAPTURE_GOAL) {
      this.endRun();
      return;
    }
    this.emit();
  }

  /** Horizontal-distance + vertical-tolerance zone test (feet positions). */
  private inZone(x: number, y: number, z: number): boolean {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (dx * dx + dz * dz > HILL_RADIUS * HILL_RADIUS) return false;
    return Math.abs(y - this.pos.y) <= HILL_VTOL;
  }

  /** Move the hill to a spawn anchor far from the current one (guaranteed clear
   *  of solids — anchors are the map's FFA spawns). */
  private pickHill(first: boolean) {
    const spawns = this.game.mapSpawns;
    if (!spawns.length) {
      this.pos.set(0, 0.4, 0);
    } else if (first) {
      // Random start so each match opens differently.
      const idx = Math.floor((this.bob * 1000 + spawns.length) % spawns.length);
      this.pos.copy(spawns[Math.max(0, Math.min(spawns.length - 1, idx))]);
    } else {
      // Farthest anchor from the current hill → the action travels across the map.
      let best = spawns[0];
      let bestD = -1;
      for (const s of spawns) {
        const d = s.distanceToSquared(this.pos);
        if (d > bestD) { bestD = d; best = s; }
      }
      this.pos.copy(best);
    }
    this.pos.y = Math.max(this.pos.y, 0.1);
    if (this.group) this.group.position.copy(this.pos);
  }

  private ensureVisual() {
    if (this.group) { this.group.visible = true; return; }
    const g = new THREE.Group();

    // Open-ended capture cylinder (the visible "zone wall").
    const ringGeo = new THREE.CylinderGeometry(HILL_RADIUS, HILL_RADIUS, 3.4, 44, 1, true);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: CONTROL_COLOR.neutral, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    ring.position.y = 1.7;
    g.add(ring);

    // Ground disc.
    const discGeo = new THREE.CircleGeometry(HILL_RADIUS, 44);
    this.discMat = new THREE.MeshBasicMaterial({
      color: CONTROL_COLOR.neutral, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, this.discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.06;
    g.add(disc);

    this.game.scene.add(g);
    this.group = g;
  }

  private applyVisual(control: HillControl) {
    const color = CONTROL_COLOR[control];
    // Pulse the opacity gently so the zone reads as "live".
    const pulse = 0.5 + 0.5 * Math.sin(this.bob * 3.0);
    if (this.ringMat) {
      this.ringMat.color.setHex(color);
      this.ringMat.opacity = 0.14 + (control === 'neutral' ? 0.02 : 0.12) * pulse;
    }
    if (this.discMat) {
      this.discMat.color.setHex(color);
      this.discMat.opacity = 0.10 + (control === 'neutral' ? 0.02 : 0.10) * pulse;
    }
  }

  private endRun() {
    this.ended = true;
    this.active = false;
    const youWon = this.youScore >= CAPTURE_GOAL;
    // Win bonus on top of the per-kill XP already banked through the kill bus.
    const bonus = youWon ? 120 : 30;
    this.game.account.awardXP(bonus);
    this.runXp += bonus;
    if (this.group) this.group.visible = false;
    this.onEnd?.({
      youWon,
      youScore: Math.round(this.youScore),
      enemyScore: Math.round(this.enemyScore),
      captures: this.captures,
      xpEarned: this.runXp,
    });
  }

  private emit() {
    this.onState?.(
      Math.floor(this.youScore),
      Math.floor(this.enemyScore),
      CAPTURE_GOAL,
      this.control,
      Math.max(0, Math.ceil(this.rotateTimer)),
    );
  }
}
