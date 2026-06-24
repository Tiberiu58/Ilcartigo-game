/**
 * Hardpoint — solo "King of the Hill" objective mode (time-attack).
 *
 * A glowing capture zone appears on the map. Stand in it ALONE to bank control;
 * an enemy inside CONTESTS it (nobody banks). The zone rotates to a new spot
 * every so often, forcing you to fight your way across the arena and re-take it.
 * Bank enough control to win → a results card showing your clear TIME vs your
 * persistent personal best. A race against the clock + a roomful of bots: the
 * "hold the point" loop Krunker/CoD players grind, with a beat-your-best hook.
 *
 * Why this is low-risk + self-contained (mirrors Onslaught/Duel):
 *   - SOLO only. No protocol / server / controller changes.
 *   - Reuses the existing bot-vs-player AI verbatim (bots hunt the player, so
 *     they naturally crowd whatever zone you're holding → real contest). Every
 *     bot death is an ordinary player frag, so XP / stats / killfeed / announcer
 *     all "just work". The mode keeps a constant pool of pressure bots by
 *     respawning a replacement shortly after each one dies.
 *   - Owns the bot roster only while it runs (Game.setSurvivalActive), and the
 *     player respawns through the normal solo loop (death never ends the run).
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) for the
 * capture tick, zone rotation, bot replenishment + zone-mesh animation.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { BotDifficulty } from '../entities/Bot';

const TARGET_CONTROL = 60;       // seconds of banked control needed to win
const ZONE_RADIUS = 4.5;         // capture-zone radius (metres, XZ)
const ZONE_ROTATE_SEC = 26;      // the hardpoint relocates this often
const ROSTER_SIZE = 4;           // living pressure bots maintained
const RESPAWN_DELAY = 3.0;       // delay before a downed bot is replaced
const PB_KEY = 'ilc.hardpoint.best';   // fastest clear time (seconds)

/** Capture state of the zone this tick — drives the HUD colour + label. */
export type ZoneState = 'open' | 'holding' | 'contested';

export interface HardpointResult {
  time: number;          // clear time this run (seconds, lower = better)
  kills: number;         // frags during the run
  best: number;          // personal-best time AFTER this run
  isNewBest: boolean;
}

export class Hardpoint {
  private game: Game;
  private unsub: (() => void) | null = null;

  active = false;
  private control = 0;          // banked control seconds (0..TARGET_CONTROL)
  private elapsed = 0;          // real time since the run began
  private kills = 0;
  private zoneTimer = 0;        // counts down to the next zone rotation
  private anchors: THREE.Vector3[] = [];
  private anchorIdx = 0;
  private respawnQueue: number[] = [];   // countdown timers for bot replacements
  private over = false;

  // Zone visuals.
  private zone: THREE.Group | null = null;
  private zoneRing: THREE.Mesh | null = null;
  private zoneFill: THREE.Mesh | null = null;
  private zoneBeam: THREE.Mesh | null = null;
  private zoneCenter = new THREE.Vector3();
  private _p = new THREE.Vector3();

  /** HUD update each tick: control %, elapsed seconds, current zone state. */
  onState?: (controlPct: number, elapsed: number, state: ZoneState, enemiesInZone: number) => void;
  /** Fired when the hardpoint relocates — drives a "ZONE MOVED" banner. */
  onZoneMove?: () => void;
  /** Fired when the run is won — drives the results card. */
  onEnd?: (result: HardpointResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  start() {
    if (!this.unsub) {
      this.unsub = this.game.bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
    }
    this.active = true;
    this.over = false;
    this.control = 0;
    this.elapsed = 0;
    this.kills = 0;
    this.respawnQueue = [];
    this.game.setSurvivalActive(true);
    this.game.clearSurvivalBots();
    this.game.healPlayerFull();

    this.buildAnchors();
    this.buildZoneMesh();
    this.anchorIdx = 0;
    this.moveZone(this.anchorIdx, false);
    this.zoneTimer = ZONE_ROTATE_SEC;

    // Seed the pressure roster.
    for (let i = 0; i < ROSTER_SIZE; i++) this.spawnPressureBot();

    this.emitState('open', 0);
  }

  stop() {
    this.active = false;
    this.unsub?.();
    this.unsub = null;
    this.disposeZoneMesh();
    this.game.setSurvivalActive(false);
  }

  update(dt: number) {
    if (!this.active || this.over) return;
    this.elapsed += dt;

    // ── Zone rotation ────────────────────────────────────────────────────
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.anchorIdx = (this.anchorIdx + 1) % this.anchors.length;
      this.moveZone(this.anchorIdx, true);
      this.zoneTimer = ZONE_ROTATE_SEC;
    }

    // ── Replenish downed pressure bots ───────────────────────────────────
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnPressureBot();
      }
    }

    // ── Capture tick ─────────────────────────────────────────────────────
    const playerIn = this.inZone(this.game.player.pos);
    const enemiesIn = this.enemiesInZone();
    let state: ZoneState;
    if (playerIn && enemiesIn === 0) {
      state = 'holding';
      this.control = Math.min(TARGET_CONTROL, this.control + dt);
      if (this.control >= TARGET_CONTROL) { this.win(); return; }
    } else if (playerIn && enemiesIn > 0) {
      state = 'contested';
    } else {
      state = 'open';
    }

    this.animateZone(dt, state);
    this.emitState(state, enemiesIn);
  }

  // ── Zone geometry / anchors ─────────────────────────────────────────────

  /** Candidate hardpoint positions: the map's FFA spawns (guaranteed clear of
   *  solids) plus the arena centre, pulled toward centre so the point sits in
   *  contested space. De-duplicated + capped to keep the rotation varied. */
  private buildAnchors() {
    const spawns = this.game.mapSpawns;
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, 0.2, 0)];
    for (const s of spawns) {
      // Pull 40% toward centre so the hardpoint is reachable from all sides.
      pts.push(new THREE.Vector3(s.x * 0.6, 0.2, s.z * 0.6));
    }
    // Keep a spread of up to 5 anchors, skipping near-duplicates.
    const out: THREE.Vector3[] = [];
    for (const p of pts) {
      if (out.length >= 5) break;
      if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < ZONE_RADIUS * 1.5)) continue;
      out.push(p);
    }
    this.anchors = out.length >= 2 ? out : [new THREE.Vector3(0, 0.2, 0), ...pts.slice(1, 3)];
  }

  private buildZoneMesh() {
    if (this.zone) return;
    const g = new THREE.Group();

    // Translucent floor disc.
    const fillGeo = new THREE.CylinderGeometry(ZONE_RADIUS, ZONE_RADIUS, 0.06, 40);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x37e0ff, transparent: true, opacity: 0.16, depthWrite: false });
    this.zoneFill = new THREE.Mesh(fillGeo, fillMat);
    this.zoneFill.position.y = 0.03;
    g.add(this.zoneFill);

    // Bright perimeter ring.
    const ringGeo = new THREE.TorusGeometry(ZONE_RADIUS, 0.12, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x37e0ff, transparent: true, opacity: 0.9, depthWrite: false });
    this.zoneRing = new THREE.Mesh(ringGeo, ringMat);
    this.zoneRing.rotation.x = Math.PI / 2;
    this.zoneRing.position.y = 0.1;
    g.add(this.zoneRing);

    // Vertical light shaft so the point is visible from across the map.
    const beamGeo = new THREE.CylinderGeometry(ZONE_RADIUS * 0.96, ZONE_RADIUS * 0.96, 14, 32, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x37e0ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
    this.zoneBeam = new THREE.Mesh(beamGeo, beamMat);
    this.zoneBeam.position.y = 7;
    g.add(this.zoneBeam);

    this.zone = g;
    this.game.scene.add(g);
  }

  private disposeZoneMesh() {
    if (!this.zone) return;
    this.game.scene.remove(this.zone);
    for (const m of [this.zoneFill, this.zoneRing, this.zoneBeam]) {
      if (m) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    }
    this.zone = this.zoneFill = this.zoneRing = this.zoneBeam = null;
  }

  private moveZone(idx: number, announce: boolean) {
    const a = this.anchors[idx] ?? new THREE.Vector3(0, 0.2, 0);
    this.zoneCenter.copy(a);
    if (this.zone) this.zone.position.set(a.x, 0, a.z);
    if (announce) this.onZoneMove?.();
  }

  /** Recolour + pulse the zone by state; spin the ring for life. */
  private animateZone(dt: number, state: ZoneState) {
    const col = state === 'holding' ? 0xffd23f : state === 'contested' ? 0xff4444 : 0x37e0ff;
    for (const m of [this.zoneFill, this.zoneRing, this.zoneBeam]) {
      if (m) (m.material as THREE.MeshBasicMaterial).color.setHex(col);
    }
    if (this.zoneRing) this.zoneRing.rotation.z += dt * (state === 'contested' ? 3 : 1.2);
  }

  // ── Capture helpers ─────────────────────────────────────────────────────

  private inZone(p: THREE.Vector3): boolean {
    const dx = p.x - this.zoneCenter.x;
    const dz = p.z - this.zoneCenter.z;
    return dx * dx + dz * dz <= ZONE_RADIUS * ZONE_RADIUS;
  }

  private enemiesInZone(): number {
    let n = 0;
    for (const b of this.game.bots) {
      if (!b.ephemeral || b.health.dead || !b.active) continue;
      this._p.copy(b.group.position);
      if (this.inZone(this._p)) n++;
    }
    return n;
  }

  // ── Roster ──────────────────────────────────────────────────────────────

  private spawnPressureBot() {
    const spawns = this.game.survivalSpawns(1);
    const pos = spawns[0] ?? new THREE.Vector3(0, 0.5, 0);
    this.game.spawnSurvivalBot(this.pressureDifficulty(), pos);
  }

  /** Pressure mix ramps up the longer the run goes (so a slow hold gets harder). */
  private pressureDifficulty(): BotDifficulty {
    const t = this.elapsed;
    const roll = Math.random();
    if (t > 45) return roll < 0.45 ? 'predictor' : roll < 0.85 ? 'engager' : 'wanderer';
    if (t > 20) return roll < 0.2 ? 'predictor' : roll < 0.7 ? 'engager' : 'wanderer';
    return roll < 0.55 ? 'engager' : 'wanderer';
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.active) return;
    // A pressure bot died → queue a replacement so the arena keeps biting.
    const bot = this.game.bots.find((b) => b.id === targetId);
    if (bot?.ephemeral) {
      this.respawnQueue.push(RESPAWN_DELAY);
      if (this.game.isLocalPlayer(attackerId)) this.kills++;
    }
    // Player deaths just run the normal solo respawn loop (handled by Game).
  }

  // ── End ─────────────────────────────────────────────────────────────────

  private win() {
    this.over = true;
    this.game.clearSurvivalBots();
    const time = Math.round(this.elapsed * 10) / 10;
    const prev = Number(localStorage.getItem(PB_KEY) ?? 0);
    const isNewBest = prev <= 0 || time < prev;
    if (isNewBest) localStorage.setItem(PB_KEY, String(time));
    // A completed objective is worth a chunky bonus on top of the frag XP.
    this.game.account.awardXP(300);
    this.onEnd?.({
      time,
      kills: this.kills,
      best: isNewBest ? time : prev,
      isNewBest,
    });
  }

  private emitState(state: ZoneState, enemiesIn: number) {
    this.onState?.(
      Math.round((this.control / TARGET_CONTROL) * 100),
      this.elapsed,
      state,
      enemiesIn,
    );
  }

  /** Best clear time in seconds (0 = none yet) — for the menu/profile display. */
  static personalBest(): number {
    return Number(localStorage.getItem(PB_KEY) ?? 0);
  }
}
