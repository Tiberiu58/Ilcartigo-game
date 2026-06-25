/**
 * King of the Hill — solo "hold the hardpoint" objective mode.
 *
 * The first OBJECTIVE mode in ILCARTIGO (every other mode is frag-count or
 * survival): a glowing capture zone appears on the map and you score for every
 * moment you hold it ALONE — step in, clear the bots out, and the column turns
 * teal and ticks points your way. The enemy faction (the standard FFA bot
 * roster) contests it: a bot in the zone with you turns it amber (contested, no
 * score); a bot holding it alone scores for them. First side to the goal wins →
 * results card (a natural ad breakpoint). The hardpoint relocates on a timer so
 * you never get to camp one corner — constant rotation, constant fights.
 *
 * Why it's low-risk + self-contained (the Onslaught/Duel pattern):
 *   - SOLO only. No protocol / server / controller changes.
 *   - Runs on top of the ordinary combat bots (an FFA-class mode), so kills feed
 *     XP / stats / killfeed / announcer / mastery with no special-casing.
 *   - The only Bot touch is an additive `objective` attract point (null in every
 *     other mode → identical behaviour) so bots walk to the hill and contest it.
 *   - Owns nothing but its own scoring + the zone meshes; tears them down on stop.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) every
 * frame for scoring + zone animation.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

const GOAL = 100;               // points to win
const HOLD_INTERVAL = 0.5;      // seconds per scored point while solely holding
const ROTATE_SEC = 42;          // hardpoint relocates on this cadence
const ZONE_RADIUS = 5.5;
const WIN_XP = 150;             // bonus banked on a victory
const HOLD_XP = 2;              // bonus per point you personally score
const WINS_KEY = 'ilc.koth.wins';      // career hardpoint victories (menu badge)
const BESTCAPS_KEY = 'ilc.koth.bestcaps';  // best captures in a single run (PB)

const COLORS: Record<KothControl, number> = {
  neutral: 0x9aa6b2,
  you: 0x39d0c8,
  enemy: 0xff5a5a,
  contested: 0xffc24d,
};

export type KothControl = 'neutral' | 'you' | 'enemy' | 'contested';

export interface KothResult {
  youWon: boolean;
  youScore: number;
  enemyScore: number;
  captures: number;     // times you flipped the zone to your sole control
  xpEarned: number;
  wins: number;         // career hardpoint wins after this run
  isNewBest: boolean;   // beat your best captures-in-a-run record
}

type Phase = 'idle' | 'playing' | 'over';

export class KingOfTheHill {
  private game: Game;
  active = false;
  private phase: Phase = 'idle';

  private youScore = 0;
  private enemyScore = 0;
  private captures = 0;
  private runXp = 0;
  private control: KothControl = 'neutral';
  private holdAccum = 0;
  private rotateTimer = 0;
  private anchorIdx = 0;
  private anchors: THREE.Vector3[] = [];
  private zoneCenter = new THREE.Vector3();
  private pulse = 0;

  // Zone visuals (owned here; added/removed from the scene on start/stop).
  private group: THREE.Group | null = null;
  private discMat: THREE.MeshBasicMaterial | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.MeshBasicMaterial | null = null;

  private _tmp = new THREE.Vector3();

  /** HUD ticker: your score, enemy score, goal, current control state. */
  onState?: (you: number, enemy: number, goal: number, control: KothControl) => void;
  /** Transient center-screen callout (capture / lost / contested / moved). */
  onEvent?: (text: string, kind: 'good' | 'bad' | 'neutral') => void;
  /** Fired when the run ends → results card. */
  onEnd?: (result: KothResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  start() {
    this.active = true;
    this.phase = 'playing';
    this.youScore = 0;
    this.enemyScore = 0;
    this.captures = 0;
    this.runXp = 0;
    this.control = 'neutral';
    this.holdAccum = 0;
    this.anchorIdx = 0;
    this.pulse = 0;

    this.buildAnchors();
    this.buildZoneMeshes();
    this.placeZone(this.anchors[0] ?? this._tmp.set(0, 0, 0));
    this.rotateTimer = ROTATE_SEC;
    this.emitState();
  }

  stop() {
    this.active = false;
    this.phase = 'idle';
    // Clear bot attract points so the next mode patrols normally.
    for (const b of this.game.bots) b.objective = null;
    if (this.group) {
      this.game.world.scene.remove(this.group);
      this.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | undefined;
        if (mat) mat.dispose();
      });
      this.group = null;
      this.discMat = this.ringMat = this.beamMat = null;
    }
  }

  update(dt: number) {
    if (!this.active || this.phase !== 'playing') return;

    // Freeze scoring + the rotation clock while paused / in a menu (pointer
    // unlocked) so the enemy can't run the hardpoint clock out while you're not
    // actually playing — only the zone keeps breathing.
    if (!this.game.input.pointerLocked) { this.animateZone(dt); return; }

    // Relocate the hardpoint on a cadence so nobody camps one corner.
    this.rotateTimer -= dt;
    if (this.rotateTimer <= 0) this.relocate();

    // Determine control: who is standing in the zone right now?
    const playerIn = !this.game.playerActor.health.dead && this.inZone(this.game.player.pos);
    let enemyIn = false;
    for (const b of this.game.bots) {
      if (!b.active || b.health.dead) continue;
      b.getEye(this._tmp);
      if (this.inZone(this._tmp)) { enemyIn = true; break; }
    }

    let control: KothControl;
    if (playerIn && enemyIn) control = 'contested';
    else if (playerIn) control = 'you';
    else if (enemyIn) control = 'enemy';
    else control = 'neutral';

    if (control !== this.control) {
      const prev = this.control;
      this.control = control;
      this.holdAccum = 0;             // partial progress doesn't carry across states
      this.recolor();
      if (control === 'you' && prev !== 'you') {
        this.captures++;
        this.onEvent?.('ZONE CAPTURED', 'good');
      } else if (control === 'enemy') {
        this.onEvent?.('ZONE LOST', 'bad');
      } else if (control === 'contested') {
        this.onEvent?.('CONTESTED', 'neutral');
      }
      this.emitState();
    }

    // Score for whoever holds the zone alone.
    if (control === 'you' || control === 'enemy') {
      this.holdAccum += dt;
      while (this.holdAccum >= HOLD_INTERVAL) {
        this.holdAccum -= HOLD_INTERVAL;
        if (control === 'you') { this.youScore++; this.runXp += HOLD_XP; }
        else this.enemyScore++;
        this.emitState();
        if (this.youScore >= GOAL) { this.endRun(true); return; }
        if (this.enemyScore >= GOAL) { this.endRun(false); return; }
      }
    }

    this.animateZone(dt);
  }

  /** Live hardpoint position + control state for the minimap (null when idle). */
  hardpoint(): { x: number; z: number; control: KothControl; radius: number } | null {
    if (!this.active || this.phase !== 'playing') return null;
    return { x: this.zoneCenter.x, z: this.zoneCenter.z, control: this.control, radius: ZONE_RADIUS };
  }

  /** Current best (career wins) for the menu button label. */
  static careerWins(): number {
    return Number(localStorage.getItem(WINS_KEY) ?? 0);
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private inZone(p: THREE.Vector3): boolean {
    const dx = p.x - this.zoneCenter.x;
    const dz = p.z - this.zoneCenter.z;
    return dx * dx + dz * dz <= ZONE_RADIUS * ZONE_RADIUS;
  }

  /** Candidate hardpoint locations: each FFA spawn pulled toward the map centre
   *  for contested mid-map space, falling back to the raw anchor if the pulled
   *  point lands inside a solid. Guarantees no zone is buried in geometry. */
  private buildAnchors() {
    const spawns = this.game.mapSpawns;
    this.anchors = [];
    if (spawns.length === 0) { this.anchors.push(new THREE.Vector3(0, 0, 0)); return; }
    // Map centre = average of the spawn anchors.
    let cx = 0, cz = 0;
    for (const s of spawns) { cx += s.x; cz += s.z; }
    cx /= spawns.length; cz /= spawns.length;
    for (const s of spawns) {
      const px = s.x + (cx - s.x) * 0.55;
      const pz = s.z + (cz - s.z) * 0.55;
      const pulled = new THREE.Vector3(px, 0.5, pz);
      this.anchors.push(this.clearOf(pulled) ? pulled : new THREE.Vector3(s.x, 0.5, s.z));
    }
    // Always include the dead centre as a contested option.
    const centre = new THREE.Vector3(cx, 0.5, cz);
    if (this.clearOf(centre)) this.anchors.unshift(centre);
  }

  private clearOf(p: THREE.Vector3): boolean {
    return this.game.world.firstOverlap(p, _PROBE) === null;
  }

  private buildZoneMeshes() {
    const group = new THREE.Group();

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(ZONE_RADIUS, ZONE_RADIUS, 0.08, 40),
      new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    disc.position.y = 0.05;
    group.add(disc);
    this.discMat = disc.material as THREE.MeshBasicMaterial;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ZONE_RADIUS - 0.35, ZONE_RADIUS, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.neutral, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    group.add(ring);
    this.ringMat = ring.material as THREE.MeshBasicMaterial;

    // Visible-across-the-map light column.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(ZONE_RADIUS * 0.92, ZONE_RADIUS * 0.92, 16, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: COLORS.neutral, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = 8;
    group.add(beam);
    this.beamMat = beam.material as THREE.MeshBasicMaterial;

    this.group = group;
    this.game.world.scene.add(group);
  }

  private placeZone(center: THREE.Vector3) {
    this.zoneCenter.set(center.x, 0, center.z);
    if (this.group) this.group.position.set(center.x, 0, center.z);
    // Point the contesting bots at the new hill.
    for (const b of this.game.bots) {
      if (b.active) b.objective = this.zoneCenter;
    }
  }

  private relocate() {
    if (this.anchors.length > 1) {
      // Advance to a different anchor (skip the current one).
      let next = (this.anchorIdx + 1) % this.anchors.length;
      if (next === this.anchorIdx) next = (next + 1) % this.anchors.length;
      this.anchorIdx = next;
    }
    this.placeZone(this.anchors[this.anchorIdx] ?? this.zoneCenter);
    this.rotateTimer = ROTATE_SEC;
    this.control = 'neutral';
    this.holdAccum = 0;
    this.recolor();
    this.onEvent?.('⚑ HARDPOINT MOVED', 'neutral');
    this.emitState();
  }

  private recolor() {
    const c = COLORS[this.control];
    this.discMat?.color.setHex(c);
    this.ringMat?.color.setHex(c);
    this.beamMat?.color.setHex(c);
  }

  private animateZone(dt: number) {
    this.pulse += dt;
    if (!this.group) return;
    // Faster, brighter pulse while contested or being held; calm when neutral.
    const hot = this.control === 'contested' ? 6 : this.control === 'neutral' ? 1.6 : 3.2;
    const k = 0.5 + 0.5 * Math.sin(this.pulse * hot);
    if (this.ringMat) this.ringMat.opacity = 0.45 + 0.45 * k;
    if (this.beamMat) this.beamMat.opacity = 0.04 + 0.07 * k;
    this.group.rotation.y += dt * 0.3;
  }

  private endRun(youWon: boolean) {
    if (this.phase === 'over') return;
    this.phase = 'over';

    const prevWins = KingOfTheHill.careerWins();
    const wins = youWon ? prevWins + 1 : prevWins;
    if (youWon) localStorage.setItem(WINS_KEY, String(wins));

    const prevBestCaps = Number(localStorage.getItem(BESTCAPS_KEY) ?? 0);
    const isNewBest = this.captures > prevBestCaps;
    if (isNewBest) localStorage.setItem(BESTCAPS_KEY, String(this.captures));

    let xp = this.runXp;
    if (youWon) xp += WIN_XP;
    this.game.account.awardXP(xp);

    // Stop awarding / animating but leave the meshes for the results card beat;
    // main.ts calls stop() on quit/retry which disposes them.
    this.onEnd?.({
      youWon,
      youScore: this.youScore,
      enemyScore: this.enemyScore,
      captures: this.captures,
      xpEarned: xp,
      wins,
      isNewBest,
    });
  }

  private emitState() {
    this.onState?.(this.youScore, this.enemyScore, GOAL, this.control);
  }
}

const _PROBE = new THREE.Vector3(0.4, 0.9, 0.4);
