/**
 * AimLab — "Target Rush" solo aim trainer (Phase 13).
 *
 * A self-contained training mode in the spirit of Krunker's aim trainer: a
 * 60-second sprint where glowing targets pop into the arena and you flick to
 * them as fast as you can. Score = targets popped; accuracy = pellet hits /
 * shots. A persistent personal best gives a clean "beat your score" retention
 * hook, and the post-run results card is a natural ad breakpoint.
 *
 * Design constraints (why this is low-risk):
 *   - Additive. It reuses the existing Weapon → bus('shot'|'damage'|'kill')
 *     pipeline and World.raycast/Damageable system. Targets ARE Damageables,
 *     so the player shoots them exactly like a bot.
 *   - No protocol / server / controller changes. Solo-only.
 *   - Does NOT pollute combat progression: Game's kill handler early-returns
 *     while AimLab is active, so aim-target pops don't award combat XP, touch
 *     lifetime stats, or fire kill effects. AimLab grants its own XP at the end.
 *
 * Lifecycle is driven entirely from main.ts (start/stop) + Game.tick (update).
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Damageable, HitAABB } from '../entities/Damageable';
import { Health } from '../entities/Health';

/** Arena centre on the Practice map — an open, clear patch of the combat area. */
const ARENA_CENTER = new THREE.Vector3(0, 0.5, 25);
/** Seconds per run. */
const RUN_SECONDS = 60;
/** How many targets are alive at once. */
const TARGET_COUNT = 4;
/** Target spawn ring around the player's start (horizontal distance). */
const MIN_DIST = 6;
const MAX_DIST = 22;
/** Target vertical band above the arena floor. */
const MIN_Y = 1.2;
const MAX_Y = 5.0;
/** localStorage key for the persistent personal best (targets popped). */
const PB_KEY = 'ilc.aimlab.best';
/** XP granted per target popped (rewards engagement; modest vs combat). */
const XP_PER_TARGET = 4;

export interface AimLabResult {
  score: number;
  shots: number;
  hits: number;
  accuracy: number;       // 0..1
  best: number;           // personal best AFTER this run
  isNewBest: boolean;
  xpEarned: number;
}

/**
 * A single glowing target. Any hit pops it (AimLab relocates it on the first
 * `damage` event). HP is set absurdly high precisely so the target NEVER
 * reaches 0 — that means no `kill` events fire for targets, so the killfeed,
 * announcer, and combat progression stay completely untouched during a run.
 */
class AimTarget implements Damageable {
  readonly id: string;
  readonly health = new Health(1e9);
  /** Neutral team — friendly fire isn't enforced in solo, this is cosmetic. */
  readonly team = 9;
  readonly group = new THREE.Group();
  /** World-space CENTRE of the target (not feet). */
  readonly position = new THREE.Vector3();
  static readonly RADIUS = 0.55;

  private core: THREE.Mesh;
  private shell: THREE.Mesh;
  private _min = new THREE.Vector3();
  private _max = new THREE.Vector3();
  private phase = Math.random() * Math.PI * 2;

  constructor(id: string, scene: THREE.Scene) {
    this.id = id;
    const R = AimTarget.RADIUS;
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R, 0),
      new THREE.MeshLambertMaterial({
        color: 0x4ac8ff, emissive: 0x1d6fa0, emissiveIntensity: 0.9, flatShading: true,
      }),
    );
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R * 0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff4c2 }),
    );
    this.group.add(this.shell);
    this.group.add(this.core);
    this.group.visible = false;
    scene.add(this.group);
  }

  bodyAABB(): HitAABB {
    const R = AimTarget.RADIUS;
    this._min.set(this.position.x - R, this.position.y - R, this.position.z - R);
    this._max.set(this.position.x + R, this.position.y + R, this.position.z + R);
    return { min: this._min, max: this._max };
  }

  /** Targets have no separate headshot box. */
  headAABB(): HitAABB | null { return null; }

  setVisible(v: boolean) { this.group.visible = v; }

  placeAt(p: THREE.Vector3) {
    this.position.copy(p);
    this.group.position.copy(p);
    this.health.reset();        // keep full (huge) HP so it stays alive
    this.group.visible = true;
    this.phase = Math.random() * Math.PI * 2;
  }

  /** Spin + breathe so targets read as live and pop satisfyingly. */
  animate(dt: number, t: number) {
    this.group.rotation.y += dt * 1.6;
    this.group.rotation.x += dt * 0.7;
    const s = 1 + Math.sin(t * 3 + this.phase) * 0.08;
    this.shell.scale.setScalar(s);
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.shell.geometry.dispose();
    (this.shell.material as THREE.Material).dispose();
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
  }
}

export class AimLab {
  private game: Game;
  private targets: AimTarget[] = [];
  active = false;

  private timeLeft = 0;
  private elapsed = 0;
  private score = 0;
  private shots = 0;
  private hits = 0;

  /** Bus unsubscribe handles, cleared on stop/end. */
  private unsubs: Array<() => void> = [];

  /** Fired ~every frame while running so the HUD can refresh (throttle in UI). */
  onTick?: (timeLeft: number, score: number, accuracy: number) => void;
  /** Fired once when the run finishes (timer hit zero). */
  onEnd?: (result: AimLabResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  get bestScore(): number {
    const n = Number(localStorage.getItem(PB_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Arena centre — used by the launcher to position the player. */
  get arenaCenter(): THREE.Vector3 { return ARENA_CENTER; }

  /** Begin (or restart) a run. Assumes the player is already in the arena. */
  start() {
    this.stop();                 // clean any prior run + listeners
    this.ensureTargets();

    this.active = true;
    this.timeLeft = RUN_SECONDS;
    this.elapsed = 0;
    this.score = 0;
    this.shots = 0;
    this.hits = 0;

    // Place every target at a fresh, validated spot.
    for (const t of this.targets) this.relocate(t);

    // Listen to the existing combat pipeline. Targets never die (huge HP), so
    // a pop is simply the first `damage` event landing on a target — we score
    // it and relocate the target synchronously, which also stops any remaining
    // pellets in the same blast from double-counting (the target has moved).
    const isLocal = (id: string) => this.game.isLocalPlayer(id);
    this.unsubs.push(this.game.bus.on('shot', (e) => {
      if (!this.active) return;
      if (isLocal(e.shooterId)) this.shots++;
    }));
    this.unsubs.push(this.game.bus.on('damage', (e) => {
      if (!this.active) return;
      if (!isLocal(e.attackerId)) return;
      const t = this.targets.find((x) => x.id === e.targetId && x.group.visible);
      if (!t) return;
      this.hits++;
      this.score++;
      // Pop FX at the target + relocate it immediately for a seamless rush.
      this.game.castFX.flash(t.position, 0x6cf0ff, 0.3, 1.3, 0.3);
      this.game.audio.play('hit_confirm');
      this.relocate(t);
    }));
  }

  /** Tear down a run WITHOUT producing a result (quit mid-run / cleanup). */
  stop() {
    this.active = false;
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    for (const t of this.targets) {
      t.setVisible(false);
      this.game.world.unregisterDamageable(t.id);
    }
  }

  private ensureTargets() {
    if (this.targets.length === TARGET_COUNT) {
      // Re-register (start() unregisters on stop()).
      for (const t of this.targets) this.game.world.registerDamageable(t);
      return;
    }
    for (const t of this.targets) t.dispose(this.game.scene);
    this.targets = [];
    for (let i = 0; i < TARGET_COUNT; i++) {
      const t = new AimTarget(`aimtarget_${i}`, this.game.scene);
      this.targets.push(t);
      this.game.world.registerDamageable(t);
    }
  }

  /** Find a clear, line-of-sight-visible spot for a target and place it there. */
  private relocate(t: AimTarget) {
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
      const y = MIN_Y + Math.random() * (MAX_Y - MIN_Y);
      _cand.set(
        ARENA_CENTER.x + Math.cos(ang) * dist,
        y,
        ARENA_CENTER.z + Math.sin(ang) * dist,
      );
      // Reject if inside geometry.
      if (this.game.world.firstOverlap(_cand, _half)) continue;
      // Reject if not visible from the arena eye (occluded by cover/pillars).
      _eye.set(ARENA_CENTER.x, ARENA_CENTER.y + 1.5, ARENA_CENTER.z);
      if (!this.game.world.hasLineOfSight(_eye, _cand)) continue;
      // Reject if too close to another live target (avoid overlap clusters).
      let clash = false;
      for (const o of this.targets) {
        if (o === t || !o.group.visible) continue;
        if (o.position.distanceTo(_cand) < AimTarget.RADIUS * 4) { clash = true; break; }
      }
      if (clash) continue;
      t.placeAt(_cand);
      return;
    }
    // Fallback — straight ahead of the arena centre.
    _cand.set(ARENA_CENTER.x, ARENA_CENTER.y + 2, ARENA_CENTER.z - 12);
    t.placeAt(_cand);
  }

  /** Called from Game.tick every frame. Pauses while pointer is unlocked. */
  update(dt: number) {
    if (!this.active) return;
    // Soft-pause: if the player has unlocked the pointer (Esc), freeze the run.
    if (!this.game.input.pointerLocked) return;

    this.elapsed += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (const t of this.targets) t.animate(dt, this.elapsed);

    this.onTick?.(this.timeLeft, this.score, this.accuracy());

    if (this.timeLeft <= 0) this.finish();
  }

  private accuracy(): number {
    return this.shots > 0 ? this.hits / this.shots : 0;
  }

  private finish() {
    const score = this.score;
    const prevBest = this.bestScore;
    const isNewBest = score > prevBest;
    const best = isNewBest ? score : prevBest;
    if (isNewBest) localStorage.setItem(PB_KEY, String(score));

    const xpEarned = score * XP_PER_TARGET;
    if (xpEarned > 0) this.game.account.awardXP(xpEarned);

    const result: AimLabResult = {
      score, shots: this.shots, hits: this.hits,
      accuracy: this.accuracy(), best, isNewBest, xpEarned,
    };

    this.stop();                 // hides targets + drops listeners
    this.game.input.exitPointerLock();
    this.onEnd?.(result);
  }
}

const _cand = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _half = new THREE.Vector3(AimTarget.RADIUS, AimTarget.RADIUS, AimTarget.RADIUS);
