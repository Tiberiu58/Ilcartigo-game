/**
 * Hardpoint — King-of-the-Hill objective mode ("hold the zone").
 *
 * The first OBJECTIVE mode: instead of pure frags, you fight to CONTROL a
 * glowing capture zone. Stand inside it (alone) to bank points; an enemy in the
 * zone contests it (nobody scores); leave it undefended and the enemy team banks
 * points instead. First side to the goal wins. The zone RELOCATES every so often,
 * so you can never just camp one corner — it's a constant reposition-and-refight
 * loop, the most map-control-driven format in the roster. Win and you extend a
 * persistent win streak; that's the "win the next one" hook.
 *
 * Why it's low-risk + self-contained (the Onslaught/Duel pattern):
 *   - SOLO only. No protocol / server / controller changes.
 *   - Reuses the existing bot-vs-player AI verbatim — enemies are ordinary Bots
 *     that hunt the player, so their deaths are normal frags (XP / stats /
 *     killfeed / announcer / mastery all "just work"). They auto-respawn so the
 *     pressure stays on while you contest the zone.
 *   - Owns the bot roster only while it runs (Game.setSurvivalActive parks the
 *     base bots; clearSurvivalBots disposes the squad on stop).
 *   - Scoring is occupancy-based (no kill bus needed), so it composes cleanly
 *     with everything else.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) for the
 * scoring tick, zone rotation, and intro pacing.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { BotDifficulty } from '../entities/Bot';

const GOAL = 100;               // points to win
const CAPTURE_RATE = 9;         // points banked per second of clean control
const ROTATE_SEC = 22;          // the hardpoint relocates this often
const ENEMY_COUNT = 3;          // simultaneous enemies hunting you
const ZONE_RADIUS = 4.2;        // capture radius (world units, xz)
const ZONE_Y_TOLERANCE = 3.5;   // vertical slack so multi-level maps still count
const INTRO_SEC = 2.0;          // orient + "objective" banner before scoring
const PB_KEY = 'ilc.koth.best'; // best win streak

export type ZoneControl = 'neutral' | 'player' | 'enemy' | 'contested';

export interface HardpointResult {
  won: boolean;
  playerScore: number;
  enemyScore: number;
  captures: number;       // times you seized control of the zone this match
  streak: number;         // win streak AFTER this match
  best: number;           // persistent best win streak
  isNewBest: boolean;
  xpEarned: number;       // bonus XP banked on a win
}

type Phase = 'idle' | 'intro' | 'live' | 'over';

export class Hardpoint {
  private game: Game;

  active = false;
  private phase: Phase = 'idle';
  private timer = 0;

  private playerScore = 0;
  private enemyScore = 0;
  private captures = 0;
  private lastControl: ZoneControl = 'neutral';

  /** Persistent across "Play Again" wins (reset on a loss / fresh launch). */
  private streak = 0;
  private runXp = 0;

  private anchors: THREE.Vector3[] = [];
  private zoneIdx = 0;
  private zoneTimer = 0;
  private group: THREE.Group | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private wallMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private bob = 0;

  /** HUD ticker: player score, enemy score, goal, current control state. */
  onState?: (player: number, enemy: number, goal: number, control: ZoneControl) => void;
  /** Fired at match start + whenever the zone relocates — drives a banner. */
  onZoneMove?: (label: string, sub: string) => void;
  /** Fired when the match ends — drives the results card. */
  onEnd?: (result: HardpointResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a fresh Hardpoint match. `keepStreak` carries the win streak across
   *  a winning "Play Again"; a fresh launch / post-loss retry resets it. */
  start(keepStreak = false) {
    this.active = true;
    if (!keepStreak) this.streak = 0;
    this.playerScore = 0;
    this.enemyScore = 0;
    this.captures = 0;
    this.runXp = 0;
    this.lastControl = 'neutral';

    this.game.setSurvivalActive(true);
    this.game.clearSurvivalBots();
    this.game.healPlayerFull();
    this.game.respawnPlayer();

    this.buildAnchors();
    this.zoneIdx = 0;
    this.zoneTimer = ROTATE_SEC;
    this.buildZoneVisual();
    this.moveZoneVisual();

    this.spawnSquad();

    this.phase = 'intro';
    this.timer = INTRO_SEC;
    this.onZoneMove?.('HOLD THE HARDPOINT', `first to ${GOAL} · zone moves every ${ROTATE_SEC}s`);
    this.emitState();
  }

  /** End the run + tear down. Called on quit-to-menu / mode switch. */
  stop() {
    this.active = false;
    this.phase = 'idle';
    this.game.clearSurvivalBots();
    this.disposeZoneVisual();
    this.game.setSurvivalActive(false);
  }

  update(dt: number) {
    if (!this.active) return;
    this.bob += dt;
    this.animateZone(dt);

    if (this.phase === 'intro') {
      this.timer -= dt;
      if (this.timer <= 0) this.phase = 'live';
      return;
    }
    if (this.phase !== 'live') return;

    // Zone rotation — forces a reposition so nobody just camps one spot.
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) this.rotateZone();

    // Occupancy → scoring.
    const control = this.evaluateControl();
    if (control === 'player') {
      if (this.lastControl !== 'player') this.captures++;
      this.playerScore = Math.min(GOAL, this.playerScore + CAPTURE_RATE * dt);
    } else if (control === 'enemy') {
      this.enemyScore = Math.min(GOAL, this.enemyScore + CAPTURE_RATE * dt);
    }
    this.lastControl = control;
    this.recolorZone(control);
    this.emitState(control);

    if (this.playerScore >= GOAL) { this.endRun(true); return; }
    if (this.enemyScore >= GOAL) { this.endRun(false); return; }
  }

  /** Current best win streak (menu/profile display). */
  static personalBest(): number {
    return Number(localStorage.getItem(PB_KEY) ?? 0);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** Who controls the zone right now: player alone, enemy alone, contested, or
   *  empty (neutral). */
  private evaluateControl(): ZoneControl {
    const zone = this.anchors[this.zoneIdx];
    if (!zone) return 'neutral';

    const playerIn = !this.game.playerActor.health.dead && this.inZone(this.game.player.pos, zone);
    let enemyIn = false;
    for (const b of this.game.bots) {
      if (!b.ephemeral || b.health.dead) continue;
      if (this.inZone(b.pos, zone)) { enemyIn = true; break; }
    }

    if (playerIn && enemyIn) return 'contested';
    if (playerIn) return 'player';
    if (enemyIn) return 'enemy';
    return 'neutral';
  }

  private inZone(p: THREE.Vector3, zone: THREE.Vector3): boolean {
    const dx = p.x - zone.x;
    const dz = p.z - zone.z;
    if (dx * dx + dz * dz > ZONE_RADIUS * ZONE_RADIUS) return false;
    return Math.abs(p.y - zone.y) <= ZONE_Y_TOLERANCE;
  }

  /** Derive 3–4 contested zone anchors from the map's spawn anchors, pulled
   *  toward centre (where they sit in fought-over space), with a solid-overlap
   *  fallback to the raw anchor so a zone can never embed in geometry. */
  private buildAnchors() {
    const spawns = this.game.mapSpawns;
    this.anchors = [];
    if (spawns.length === 0) { this.anchors = [new THREE.Vector3(0, 0.5, 0)]; return; }

    const count = Math.min(4, Math.max(2, spawns.length));
    const picks: number[] = [];
    for (let i = 0; i < count; i++) picks.push(Math.floor((i + 0.5) / count * spawns.length) % spawns.length);

    for (const idx of picks) {
      const s = spawns[idx];
      let x = s.x * 0.5;
      let z = s.z * 0.5;
      if (!this.clearOf(x, z)) { x = s.x; z = s.z; }
      this.anchors.push(new THREE.Vector3(x, s.y, z));
    }
    // Make sure the centre itself is in the rotation when it's clear — it's the
    // most contested ground.
    if (this.clearOf(0, 0)) this.anchors.splice(1, 0, new THREE.Vector3(0, this.anchors[0].y, 0));
  }

  private clearOf(x: number, z: number): boolean {
    for (const s of this.game.world.staticSolids) {
      if (s.max.y <= 0.6) continue;
      if (x > s.min.x - 0.6 && x < s.max.x + 0.6 &&
          z > s.min.z - 0.6 && z < s.max.z + 0.6) return false;
    }
    return true;
  }

  private rotateZone() {
    this.zoneIdx = (this.zoneIdx + 1) % this.anchors.length;
    this.zoneTimer = ROTATE_SEC;
    this.lastControl = 'neutral';
    this.moveZoneVisual();
    this.recolorZone('neutral');
    this.onZoneMove?.('HARDPOINT MOVED', 'reposition!');
    this.game.audio.play('jump_pad');
  }

  /** Spawn the enemy squad at the spawns farthest from the player. They hunt the
   *  player (standard combat AI) and auto-respawn so pressure is continuous. */
  private spawnSquad() {
    const spawns = this.game.survivalSpawns(ENEMY_COUNT);
    const tiers: BotDifficulty[] = ['engager', 'engager', 'predictor'];
    for (let i = 0; i < ENEMY_COUNT; i++) {
      const spawn = spawns[i % Math.max(1, spawns.length)];
      if (!spawn) continue;
      const id = this.game.spawnSurvivalBot(tiers[i % tiers.length], spawn, {
        bodyColor: 0xff5a52, headColor: 0xc23a36, name: 'Raider',
      });
      const bot = this.game.bots.find((b) => b.id === id);
      if (bot) bot.autoRespawn = true;   // keep the squad at full strength
    }
  }

  private endRun(won: boolean) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.game.clearSurvivalBots();
    this.disposeZoneVisual();

    let xp = 0;
    if (won) {
      this.streak++;
      xp = 60 + (this.streak - 1) * 25;
      this.game.account.awardXP(xp);
      this.runXp += xp;
    } else {
      this.streak = 0;
    }

    const prevBest = Hardpoint.personalBest();
    const isNewBest = won && this.streak > prevBest;
    if (isNewBest) localStorage.setItem(PB_KEY, String(this.streak));

    this.onEnd?.({
      won,
      playerScore: Math.round(this.playerScore),
      enemyScore: Math.round(this.enemyScore),
      captures: this.captures,
      streak: this.streak,
      best: Math.max(prevBest, this.streak),
      isNewBest,
      xpEarned: this.runXp,
    });
  }

  private emitState(control: ZoneControl = this.lastControl) {
    this.onState?.(Math.floor(this.playerScore), Math.floor(this.enemyScore), GOAL, control);
  }

  // ── zone visual ────────────────────────────────────────────────────────

  private buildZoneVisual() {
    this.disposeZoneVisual();
    const g = new THREE.Group();

    // Ground glow ring.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_RADIUS - 0.25, ZONE_RADIUS + 0.15, 48), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    // Translucent capture cylinder (the "dome" you stand in).
    this.wallMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ZONE_RADIUS, ZONE_RADIUS, 5.5, 40, 1, true), this.wallMat);
    wall.position.y = 2.75;
    g.add(wall);

    // Central beam for at-a-glance location.
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 14, 8), this.beamMat);
    beam.position.y = 7;
    g.add(beam);

    this.game.scene.add(g);
    this.group = g;
    this.recolorZone('neutral');
  }

  private moveZoneVisual() {
    const zone = this.anchors[this.zoneIdx];
    if (this.group && zone) this.group.position.set(zone.x, zone.y, zone.z);
  }

  private animateZone(dt: number) {
    if (!this.group) return;
    this.group.rotation.y += dt * 0.4;
    // Gentle pulse on the dome opacity so it reads as a live objective.
    if (this.wallMat) this.wallMat.opacity = 0.10 + Math.sin(this.bob * 2.4) * 0.04;
  }

  private recolorZone(control: ZoneControl) {
    const c = control === 'player' ? 0x4ad6ff
      : control === 'enemy' ? 0xff4a44
      : control === 'contested' ? 0xffd23a
      : 0xbfcfe0;
    this.ringMat?.color.setHex(c);
    this.wallMat?.color.setHex(c);
    this.beamMat?.color.setHex(c);
  }

  private disposeZoneVisual() {
    if (!this.group) return;
    this.game.scene.remove(this.group);
    this.group.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    this.group = null;
    this.ringMat = this.wallMat = this.beamMat = null;
  }
}
