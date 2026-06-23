/**
 * Game — top-level engine: renderer, scene, camera, game loop, all entities.
 *
 * Loop strategy: variable-Δt per render frame, clamped to MAX_DT to avoid the
 * "tunnel through wall" failure mode if the tab is backgrounded. When we move
 * to server-authoritative netcode in Phase 7, this becomes a fixed-tick
 * accumulator instead, but for now the simpler variant is correct.
 *
 * Update order (matters for first-frame correctness):
 *   1. Player controller (movement, look, recoil-affected aim)
 *   2. Player weapon fire (uses current camera transform → no off-by-one)
 *   3. Bots (read player position, fire back)
 *   4. Viewmodel (visual recoil + bob, after camera is final)
 *   5. Effects (tracers fade, screen shake decay)
 *   6. Render
 */

import * as THREE from 'three';
import { Input } from './Input';
import { World } from './World';
import { EventBus, type GameEvents } from './events';
import { PlayerController } from '../entities/PlayerController';
import { PlayerActor } from '../entities/PlayerActor';
import { Bot, type BotTarget, type GameDifficulty, type BotDifficulty, type BotOptions } from '../entities/Bot';
import { PickupManager } from '../entities/PickupManager';
import { PowerupManager, type PowerupType } from '../entities/PowerupManager';
import { ScorePopup } from '../ui/ScorePopup';
import { GrenadeManager } from '../entities/GrenadeManager';
import { WeaponInventory } from '../weapons/WeaponInventory';
import type { WeaponId } from '../weapons/Weapon';
import { Viewmodel } from '../weapons/Viewmodel';
import { TracerPool } from '../weapons/Tracer';
import { ImpactFX } from '../weapons/ImpactFX';
import { CastFX } from './CastFX';
import { DamageNumbers } from '../ui/DamageNumbers';
import type { MultiplayerSession } from '../networking/MultiplayerSession';
import { Account } from '../account/Account';
import { findKillEffect, WEAPON_SKIN_ORDER } from '../account/Cosmetics';
import { AudioManager, type SoundId } from '../audio/AudioManager';
import { TEST_MAP } from '../maps/TestMap';
import { SANDSTONE_MAP } from '../maps/SandstoneMap';
import { INDUSTRIAL_MAP } from '../maps/IndustrialMap';
import { COBALT_MAP } from '../maps/CobaltMap';
import { OVERPASS_MAP } from '../maps/OverpassMap';
import { FROSTLINE_MAP } from '../maps/FrostlineMap';
import type { GameMap, MapId } from '../maps/Map';
import { AbilityRunner } from '../classes/AbilityRunner';
import { CLASS_LIBRARY, type ClassId } from '../classes/types';
import type { AimLab } from '../modes/AimLab';
import type { Onslaught } from '../modes/Onslaught';
import type { Duel } from '../modes/Duel';
import type { Hardpoint } from '../modes/Hardpoint';

const MAX_DT = 1 / 30;
const SPAWN_PROTECTION_SECONDS = 2;

/** Map id → GameMap. All maps live here. */
const MAPS: Record<MapId, GameMap> = {
  practice: TEST_MAP,
  sandstone: SANDSTONE_MAP,
  industrial: INDUSTRIAL_MAP,
  cobalt: COBALT_MAP,
  overpass: OVERPASS_MAP,
  frostline: FROSTLINE_MAP,
};

export type GameMode = 'combat' | 'practice' | 'gungame' | 'tdm' | 'onslaught' | 'duel' | 'koth';

/** Modes where bots are active threats + the player can die/respawn (i.e. not
 *  the peaceful Practice sandbox). Gun Game + TDM play like Combat with extra
 *  rules layered on top; Onslaught is wave survival vs escalating bot packs;
 *  Duel is a 1v1 gauntlet vs a single escalating opponent. */
export function isCombatMode(m: GameMode): boolean {
  return m === 'combat' || m === 'gungame' || m === 'tdm' || m === 'onslaught' || m === 'duel' || m === 'koth';
}

/** TDM team identity colours (figures + HUD). Blue = the player's team. */
export const TDM_BLUE = 0x4a8cff;
export const TDM_RED = 0xff5a52;

/** Which TDM team each bot belongs to, by id. Player is always BLUE (team 0).
 *  The two `sentinel`/`raider` bots only exist for TDM (inactive otherwise) so
 *  the mode runs a full 3-v-3 (player + 2 allies vs 3 enemies). */
const TDM_BOT_TEAM: Record<string, number> = {
  engager: 0,    // ally
  sentinel: 0,   // ally
  wanderer: 1,   // enemy
  predictor: 1,  // enemy
  raider: 1,     // enemy
};
/** Bots that exist ONLY for TDM — hidden/unregistered in Combat + Gun Game so
 *  those modes keep their original 3-bot roster. */
const TDM_ONLY_BOTS = new Set(['sentinel', 'raider']);

/** Humanized bot callsigns (killfeed/scoreboard). Keyed by the stable bot id. */
const BOT_CALLSIGN: Record<string, string> = {
  wanderer: 'Drifter',
  engager: 'Viper',
  predictor: 'Specter',
  sentinel: 'Bishop',
  raider: 'Havoc',
};

export interface FrameInfo {
  fps: number;
  speed: number;
  state: string;
  pos: THREE.Vector3;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly world: World;
  readonly player: PlayerController;
  readonly playerActor: PlayerActor;
  readonly inventory: WeaponInventory;
  readonly viewmodel: Viewmodel;
  abilities!: AbilityRunner;       // assigned in constructor after bots exist
  private baseFov = 90;
  readonly tracers: TracerPool;
  readonly impacts: ImpactFX;
  readonly castFX: CastFX;
  readonly dmgNumbers: DamageNumbers;
  /** Map health pickups — authoritative in solo, server-driven in MP. */
  readonly pickups: PickupManager;
  /** Arena power-up pads (damage / haste). Solo-only; never networked. */
  readonly powerups: PowerupManager;
  /** Thrown frag grenades (solo only). */
  grenades!: GrenadeManager;
  readonly audio = new AudioManager();
  readonly bus = new EventBus<GameEvents>();
  readonly bots: Bot[] = [];
  /** When true, the Onslaught mode owns the bot roster: the persistent base
   *  bots are parked and only wave-spawned ephemeral bots are live. Keeps
   *  syncBotState from re-activating the base roster mid-survival. */
  private survivalActive = false;
  /** Current game mode. Practice = no bots, lab spawn, peaceful. */
  mode: GameMode = 'combat';
  /** Currently loaded map. Set via setMap(). */
  private currentMap: GameMap = TEST_MAP;
  /** Optional multiplayer session — null when single-player. */
  mp: MultiplayerSession | null = null;
  /** Optional Aim Lab (Target Rush) trainer — null unless the player launched
   *  it from the menu. Created + driven by main.ts; ticked here. */
  aimLab: AimLab | null = null;
  /** Optional Onslaught (wave survival) controller — null unless launched from
   *  the menu. Created + wired by main.ts; ticked here for wave/respawn pacing. */
  onslaught: Onslaught | null = null;
  /** Optional Duel (1v1 gauntlet) controller — null unless launched from the
   *  menu. Created + wired by main.ts; ticked here for intro/intermission pacing. */
  duel: Duel | null = null;
  /** Optional Hardpoint (King-of-the-Hill objective) controller — null unless
   *  launched from the menu. Created + wired by main.ts; ticked here. */
  hardpoint: Hardpoint | null = null;
  /** Local progression — XP, unlocks, equipped cosmetics. Always present. */
  readonly account = new Account();

  /**
   * Returns true if `id` refers to the local player. In solo, the local
   * player's events use the literal 'player' id (set by PlayerActor +
   * Weapon ownerId). In MP, events come from the server tagged with our
   * socket id (`mp.myId`). This helper unifies both so feedback code (XP,
   * damage numbers, screen shake, respawn) doesn't break online.
   *
   * This is the single biggest cross-cutting fix between Phase 9 → Phase 10:
   * every previous `=== 'player'` check failed in MP.
   */
  /** Id of the currently-built map. Used by the minimap to detect map swaps. */
  get currentMapId(): MapId {
    return this.currentMap.meta.id;
  }

  isLocalPlayer(id: string): boolean {
    if (id === 'player') return true;
    if (this.mp && id === this.mp.myId) return true;
    return false;
  }

  /**
   * Returns the id string under which the local player files events: their
   * socket id in MP, or the literal `'player'` solo. Use this to write into
   * matchKills/matchDeaths or any other Map keyed by player id.
   */
  localPlayerId(): string {
    return this.mp?.myId || 'player';
  }

  /** Resolve an actor id to its TDM team (0 = BLUE/player, 1 = RED). The local
   *  player is always BLUE; bots carry their assigned team. Used for team
   *  scoring + the TDM scoreboard. */
  teamOf(id: string): number {
    if (this.isLocalPlayer(id)) return this.playerActor.team;
    const bot = this.bots.find((b) => b.id === id);
    if (bot) return bot.team;
    return 1;
  }

  /** Apply a bot difficulty (Easy/Normal/Hard) to the whole roster. Persisted by
   *  main.ts; set on boot + whenever the player changes it in the menu. */
  setDifficulty(level: GameDifficulty) {
    this.difficulty = level;
    for (const b of this.bots) b.setDifficulty(level);
  }

  /** Friendly display name for any actor id: the local player's handle, a bot's
   *  callsign, or a shortened MP socket id. Used by killfeed/scoreboard/recap. */
  displayNameFor(id: string): string {
    if (this.isLocalPlayer(id)) return this.account.name;
    const bot = this.bots.find((b) => b.id === id);
    if (bot) return bot.name;
    return id.length <= 8 ? id.toUpperCase() : id.slice(0, 6).toUpperCase();
  }

  /**
   * Resolve an actor id to a world position (feet-anchored, roughly torso for
   * direction math). Used by directional damage indicators to point at whoever
   * shot us. Handles all three actor sources: the local player, single-player
   * bots, and MP remotes. Returns false if the id can't be resolved (e.g. the
   * attacker already left) so callers can skip cleanly.
   */
  actorWorldPos(id: string, out: THREE.Vector3): boolean {
    if (this.isLocalPlayer(id)) {
      out.copy(this.player.pos);
      return true;
    }
    const bot = this.bots.find((b) => b.id === id);
    if (bot) {
      out.copy(bot.group.position);
      return true;
    }
    if (this.mp && this.mp.getRemotePosition(id, out)) return true;
    return false;
  }

  /** Per-match kill/death tracking. Cleared on respawn-loop reset / mode swap. */
  matchKills = new Map<string, number>();
  matchDeaths = new Map<string, number>();
  matchEnded = false;
  /** Local player's current consecutive-kill streak (resets on death). Feeds
   *  the lifetime best-streak stat. */
  localStreak = 0;
  /** Rising-hitmarker chain: consecutive landed hits + the timestamp of the
   *  last one, used to escalate the hit-confirm SFX pitch. */
  private _hitChain = 0;
  private _lastHitMs = 0;
  /** Win threshold for FFA matches (spec: first to 30). */
  static readonly MATCH_KILL_GOAL = 30;
  /** TDM per-team frag totals. Index = team (0 = BLUE/player, 1 = RED). */
  teamScore: [number, number] = [0, 0];
  /** First team to this many frags wins Team Deathmatch. */
  static readonly TDM_GOAL = 50;

  private lastTime = 0;
  private rafHandle = 0;
  private running = false;

  private frameCount = 0;
  private fpsAccum = 0;
  private fps = 0;

  // Quick-melee cooldown (seconds). A fast knife strike on V/F, solo-only.
  private meleeCooldown = 0;
  static readonly MELEE_RANGE = 3.2;
  static readonly MELEE_DAMAGE = 55;
  static readonly MELEE_COOLDOWN = 0.6;
  // Frag-grenade throw cooldown (seconds). G, solo-only.
  private grenadeCooldown = 0;
  static readonly GRENADE_COOLDOWN = 6;

  // Arena power-ups (solo-only). performance.now() ms each buff expires at.
  private buffDamageUntil = 0;
  private buffHasteUntil = 0;
  private buffShieldUntil = 0;
  static readonly POWERUP_DURATION_MS = 9_000;
  static readonly POWERUP_DAMAGE_MULT = 1.7;
  static readonly POWERUP_HASTE_MULT = 1.55;
  static readonly POWERUP_SHIELD_REDUCTION = 0.5;   // OVERSHIELD: absorb 50% dmg

  // Reload-edge tracker for the reload SFX. We poll inventory.current rather
  // than wiring an event bus into Weapon (Weapon stays pure-logic).
  private lastReloadingState = false;
  // Dead→alive edge tracker for MP respawn SFX. In solo, respawnPlayer fires
  // the SFX directly; in MP the server controls respawn so we watch HP.
  private lastDeadState = false;

  // Screen-shake state (additive camera offset, decays exponentially).
  private shake = { intensity: 0, decay: 0 };
  private _shakeOffset = new THREE.Vector3();
  private _baseCamPos = new THREE.Vector3();

  // Scratch vectors used per-frame.
  private _muzzlePos = new THREE.Vector3();
  private _eyePos = new THREE.Vector3();
  private _aimDir = new THREE.Vector3();

  onFrame?: (info: FrameInfo) => void;
  /** Fired in MP when the first player hits MATCH_KILL_GOAL kills. Main.ts
   *  uses this to show the post-match overlay. */
  onMatchEnded?: (winnerId: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 500);
    // Camera is added to the scene explicitly so the viewmodel (a child of
    // the camera) renders. Without this Three.js implicitly adds it but
    // child Objects don't update their world matrices the same way.
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    // Build the default map. Menu can swap to another via setMap.
    this.currentMap = SANDSTONE_MAP;
    this.currentMap.build(this.world);

    this.input = new Input(canvas);
    this.player = new PlayerController(this.camera, this.input, this.world);
    const spawn = this.currentMap.meta.ffaSpawns[0];
    this.player.setPosition(spawn.x, spawn.y, spawn.z);
    this.playerActor = new PlayerActor(this.player);
    this.world.registerDamageable(this.playerActor);

    this.inventory = new WeaponInventory('ar', this.world, this.bus, 'player');
    this.viewmodel = new Viewmodel(this.camera);
    this.viewmodel.setFinish(this.account.equippedFinishEmissive());
    this.tracers = new TracerPool(this.scene, 32);
    this.impacts = new ImpactFX(this.scene, 36);
    this.castFX = new CastFX(this.scene);
    this.dmgNumbers = new DamageNumbers(this.scene, this.camera, this);
    this.pickups = new PickupManager(this);
    this.powerups = new PowerupManager(this);
    this.grenades = new GrenadeManager(this);

    // Three bots, escalating difficulty. Spawns are chosen to be clear of
    // both Sandstone's buildings and TestMap's central pillar. The Predictor
    // returns in Phase 10 — its 180ms aim-lead makes it dangerous, but with
    // spawn protection + safe-spawn picker it's a fair challenge.
    this.bots.push(new Bot('wanderer', new THREE.Vector3( 18, 0.5,   3), this.world, this.bus, 'wanderer'));
    this.bots.push(new Bot('engager',  new THREE.Vector3(-18, 0.5,   3), this.world, this.bus, 'engager'));
    this.bots.push(new Bot('predictor', new THREE.Vector3(  0, 0.5, -22), this.world, this.bus, 'predictor'));
    // Two extra bots used ONLY by Team Deathmatch, so the mode fields a full
    // 3-v-3. They start inactive (hidden + unregistered) so Combat / Gun Game
    // keep their original 3-bot feel; syncBotState turns them on for TDM.
    this.bots.push(new Bot('sentinel', new THREE.Vector3( 10, 0.5,  10), this.world, this.bus, 'engager'));
    this.bots.push(new Bot('raider',   new THREE.Vector3(-10, 0.5, -10), this.world, this.bus, 'predictor'));
    // Humanized callsigns for the killfeed/scoreboard (the id stays the stable
    // scoring key). Mapped by id so it's stable across matches.
    for (const b of this.bots) b.name = BOT_CALLSIGN[b.id] ?? b.id;
    for (const b of this.bots) {
      if (TDM_ONLY_BOTS.has(b.id)) {
        b.active = false;
        b.group.visible = false;
        this.world.unregisterDamageable(b.id);
      }
    }

    // Ability runner — class chosen from menu; passives applied via setClass.
    const initialClass = (localStorage.getItem('ilc.class') as ClassId) ?? 'vanguard';
    this.abilities = new AbilityRunner(initialClass, {
      player: this.player,
      world: this.world,
      bus: this.bus,
      viewmodel: this.viewmodel,
      camera: this.camera,
      fx: this.castFX,
      playerActor: this.playerActor,
      cooldownMultiplier: 1.0,
    }, this.playerActor, this.bots);
    this.applyClassPassives();

    // Subscribe: shots → tracers, damage to player → screen shake + flash event,
    // hits on others → local hitConfirm for the HUD.
    this.bus.on('shot', (e) => {
      // Tracer goes from gun muzzle to the impact point (or max range along aim).
      this.viewmodel.muzzleWorldPos(this._muzzlePos);
      const isPlayer = this.isLocalPlayer(e.shooterId);
      const range = isPlayer
        ? this.inventory.current.config.maxRange
        : this.bots.find((b) => b.id === e.shooterId)?.weapon.config.maxRange ?? 200;
      const end = e.hit
        ? e.hit.point
        : _SCRATCH_END.copy(e.origin).addScaledVector(e.direction, range);
      const start = isPlayer ? this._muzzlePos : e.origin;
      // Local player's tracer colour is a cosmetic (equipped tracer); remote /
      // bot tracers stay the warm red so you can read incoming fire.
      const tracerColor = isPlayer ? this.account.equippedTracerColor() : 0xff5a3a;
      this.tracers.spawn(start, end, isPlayer ? 0.08 : 0.14, tracerColor);
      // Impact burst where the shot landed — red spark on flesh (targetId set),
      // warm dust on world geometry. Skips shots that hit nothing (max range).
      if (e.hit) this.impacts.spawn(e.hit.point, e.hit.targetId !== null);
      if (isPlayer) this.viewmodel.onFire();

      // Audio. Local shots play unspatialized; remote/bot shots play spatial
      // so you can hear where they're coming from.
      const fireSoundId: SoundId = `fire_${e.weaponId}` as SoundId;
      if (isPlayer) {
        this.audio.play(fireSoundId);
      } else {
        this.player.eyePos(this._eyePos);
        this.audio.playSpatial(fireSoundId, e.origin, this._eyePos, this.camera.rotation.y);
      }
    });

    this.bus.on('damage', (e) => {
      const youAttacking = this.isLocalPlayer(e.attackerId);
      const youTaking    = this.isLocalPlayer(e.targetId);
      if (youAttacking && !youTaking) {
        this.bus.emit('hitConfirm', { isHeadshot: e.isHeadshot });
      }
      if (youTaking) {
        this.applyShake(0.06, 8);
      }
      // Flash the bot white so landed hits read instantly (solo only; MP
      // remotes don't broadcast per-hit damage to the mesh layer). Cheap O(1)
      // lookup keyed by target id.
      if (!this.mp) {
        const bot = this.bots.find((b) => b.id === e.targetId);
        if (bot) bot.flashHit();
      }
    });

    // Hit confirm SFX. Plays unspatialized so it always reads as feedback.
    // Consecutive landed hits ramp the pitch up (the satisfying Krunker "rising
    // hitmarker" feel) — the chain resets after a short gap with no hits.
    this.bus.on('hitConfirm', ({ isHeadshot }) => {
      const now = performance.now();
      this._hitChain = (now - this._lastHitMs < 1100) ? this._hitChain + 1 : 1;
      this._lastHitMs = now;
      // +4% per link, capped at +52% — stays musical, never chipmunk.
      const rate = Math.min(1 + (this._hitChain - 1) * 0.04, 1.52);
      this.audio.play(isHeadshot ? 'hit_headshot' : 'hit_confirm', 1.0, rate);
    });

    this.bus.on('kill', (e) => {
      // Defensive: Aim Lab targets carry huge HP so they never emit `kill`
      // events (keeps killfeed/announcer/progression clean). This guard makes
      // that contract explicit — no combat XP/stats/effects fire during a run.
      if (this.aimLab?.active) return;

      const youKilled = this.isLocalPlayer(e.attackerId);
      const youDied   = this.isLocalPlayer(e.targetId);

      if (youKilled) this.applyShake(0.04, 6);
      // Per-match score tally — works in both solo and MP.
      this.matchKills.set(e.attackerId, (this.matchKills.get(e.attackerId) ?? 0) + 1);
      this.matchDeaths.set(e.targetId, (this.matchDeaths.get(e.targetId) ?? 0) + 1);

      // TDM team scoring — the killer's team scores; first to TDM_GOAL wins.
      if (this.mode === 'tdm' && e.attackerId !== e.targetId) {
        const t = this.teamOf(e.attackerId);
        this.teamScore[t]++;
        if (!this.matchEnded && this.teamScore[t] >= Game.TDM_GOAL) {
          this.matchEnded = true;
          this.onMatchEnded?.(`team:${t}`);
        }
      }

      // Solo FFA match end (combat mode, no server). MP's end is
      // server-authoritative; TDM + Gun Game own theirs. First participant
      // (player OR bot) to the kill goal wins → post-match overlay.
      if (this.mode === 'combat' && !this.mp && !this.matchEnded && e.attackerId !== e.targetId) {
        if ((this.matchKills.get(e.attackerId) ?? 0) >= Game.MATCH_KILL_GOAL) {
          this.matchEnded = true;
          this.onMatchEnded?.(e.attackerId);
        }
      }

      // XP + kill effect when YOU got the kill.
      if (youKilled) {
        this.account.awardXP(10);
        this.account.recordKill(e.isHeadshot);
        // Weapon mastery — bump this weapon's kill count; celebrate a fresh
        // skin unlock via the bus (ProgressionFX pops a reward chip).
        const unlocked = this.account.recordWeaponKill(e.weaponId);
        if (unlocked && unlocked.color !== undefined) {
          this.bus.emit('masteryUnlock', {
            weaponId: e.weaponId,
            skinName: unlocked.displayName,
            color: unlocked.color,
          });
        }
        // Track best-streak high-water mark from the per-match streak.
        this.localStreak++;
        this.account.recordStreak(this.localStreak);
        this.playKillEffect(e.hitPoint ?? null);
        this.audio.play('kill_feedback');
      }

      if (youDied) {
        this.applyShake(0.12, 5);
        this.account.recordDeath();
        this.localStreak = 0;
        this.audio.play('death');
        // SOLO: run the local respawn loop. MP: server respawns us, just wait.
        // Onslaught owns respawn timing (lives system) — it decides whether to
        // bring the player back or end the run, so skip the auto-loop there.
        // Duel is single-elimination — death ends the run, so it owns respawn too.
        if (!this.mp && this.mode !== 'onslaught' && this.mode !== 'duel') {
          setTimeout(() => this.respawnPlayer(), 1800);
        }
      }

      // NOTE: match end is NOT decided here. In MP the server is authoritative
      // and broadcasts MatchOver (handled in MultiplayerSession.handleMatchOver,
      // which sets matchEnded + fires onMatchEnded with the true winner). Solo
      // has no match end by design. Clients counting locally would disagree
      // about who won / when — exactly the bug this replaced.
    });

    // Initial spawn: 2s of grace so the player can orient on first load.
    this.playerActor.health.grantInvulnerability(SPAWN_PROTECTION_SECONDS);

    // Equipped weapon-skin tints → viewmodel, now and on any account change
    // (equipping a skin, or a mastery unlock auto-applying its colour).
    this.refreshWeaponSkins();
    this.account.onChange(() => this.refreshWeaponSkins());

    window.addEventListener('resize', this.onResize);
  }

  /** Push the equipped weapon-skin body tints (per weapon) to the viewmodel. */
  refreshWeaponSkins() {
    const tints: Partial<Record<WeaponId, number>> = {};
    for (const id of WEAPON_SKIN_ORDER) {
      const c = this.account.equippedWeaponSkinColor(id);
      if (c !== null) tints[id as WeaponId] = c;
    }
    this.viewmodel.setSkinTints(tints);
  }

  /**
   * Switch between Combat (with bots) and Practice (peaceful physics-test).
   * Bots are kept alive but deactivated when switching to practice — pulled
   * from the damageable list (bullets pass through them, they don't update),
   * mesh hidden — so swapping back to combat is instant and references held
   * by abilities (Pulse.bots) stay valid.
   */
  /** Selected combat map id — restored from localStorage by main.ts. */
  private combatMapId: MapId = 'sandstone';
  /** Current graphics quality — re-applied after any map change. */
  private graphicsQuality: 'low' | 'medium' | 'high' = 'medium';
  /** Player-chosen bot difficulty — applied to every bot. */
  private difficulty: GameDifficulty = 'normal';

  setCombatMap(id: MapId) {
    this.combatMapId = id;
    if (this.mode === 'combat') this.setMap(id);
  }

  setMode(mode: GameMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetMatchScore();

    // If a duration ability is active (Pulse, Cloak, Surge), tear it down —
    // its targets (bot meshes for Pulse) are about to change visibility, and
    // mid-mode side effects would otherwise leak.
    this.abilities.ability.cancelActive({
      player: this.player,
      world: this.world,
      bus: this.bus,
      viewmodel: this.viewmodel,
      camera: this.camera,
      fx: this.castFX,
      playerActor: this.playerActor,
      cooldownMultiplier: 1.0,
    });

    this.syncBotState();

    // Clear the killfeed — old entries from combat shouldn't carry over.
    document.getElementById('killfeed')?.replaceChildren();

    // Swap the map: Practice uses the test map; Combat/Gun Game use the
    // selected one. setMap calls respawnPlayer for us, so don't double-call.
    const targetMapId: MapId = mode === 'practice' ? 'practice' : this.combatMapId;
    if (this.currentMap.meta.id !== targetMapId) {
      this.setMap(targetMapId);
    } else {
      this.respawnPlayer();
    }
  }

  /**
   * Force the local player's active weapon to `id` and put it in hand. Used by
   * Gun Game to advance the player's gun each kill. The pistol is special — it
   * lives in the SECONDARY slot (can't be a primary), so we select slot 1 for
   * it; everything else replaces the primary (slot 0).
   */
  setPlayerPrimaryWeapon(id: WeaponId) {
    if (id === 'pistol') {
      // Pistol is always the secondary slot — select it rather than trying to
      // jam it into the primary (WeaponInventory.setPrimary rejects pistol).
      this.inventory.selectSlot(1);
    } else {
      this.inventory.setPrimary(id);
      this.inventory.selectSlot(0);
    }
    this.viewmodel.swapTo(id);
  }

  /**
   * Bots should be live only when we're in Combat/Gun Game AND not connected to
   * MP. Called from setMode and from MP connect/disconnect — keeps the "are
   * bots running?" predicate in one place.
   */
  private syncBotState() {
    // Onslaught owns the roster entirely (it spawns/disposes wave bots itself),
    // so don't touch the base bots while survival is active.
    if (this.survivalActive) return;
    const combat = isCombatMode(this.mode) && !this.mp;
    const tdm = combat && this.mode === 'tdm';
    for (const b of this.bots) {
      // TDM-only bots (sentinel/raider) are live only in TDM; the core three
      // are live in any combat mode.
      const live = combat && (tdm || !TDM_ONLY_BOTS.has(b.id));
      if (live) {
        if (tdm) {
          // Assign team identity: colour, friendly-fire team, home spawn.
          const team = TDM_BOT_TEAM[b.id] ?? 1;
          b.team = team;
          b.setTeamColor(team === 0 ? TDM_BLUE : TDM_RED);
          b.homeSpawn = this.currentMap.meta.teamSpawns?.[team] ?? null;
          b.weapon.ownerTeam = team;
        } else {
          // FFA: restore the difficulty colour + enemy team, no friendly fire.
          b.team = 1;
          b.setTeamColor(null);
          b.homeSpawn = null;
          b.weapon.ownerTeam = undefined;
        }
        b.setDifficulty(this.difficulty);
        b.active = true;
        b.group.visible = true;
        this.world.registerDamageable(b);
        b.respawn();
      } else {
        b.active = false;
        b.group.visible = false;
        this.world.unregisterDamageable(b.id);
      }
    }
    // The local player's weapons get the BLUE team in TDM so allied fire passes
    // through teammates; FFA clears it (hit anyone but self).
    this.inventory.setOwnerTeam(tdm ? this.playerActor.team : undefined);
  }

  // ─── Onslaught (wave survival) bot roster ─────────────────────────────────
  // The persistent base roster (this.bots[0..2]) is parked while survival runs;
  // each wave spawns a fresh set of ephemeral bots that stay dead when killed.

  /**
   * Enter/leave survival ownership of the bot roster. On enter: park every base
   * bot (deactivate, hide, unregister). On leave: dispose any leftover wave bots
   * and hand the roster back to the normal syncBotState path.
   */
  setSurvivalActive(on: boolean) {
    if (on === this.survivalActive) return;
    this.survivalActive = on;
    if (on) {
      for (const b of this.bots) {
        b.active = false;
        b.group.visible = false;
        this.world.unregisterDamageable(b.id);
      }
    } else {
      this.clearSurvivalBots();
      this.syncBotState();
    }
  }

  /** Spawn one wave bot at `spawn`. It does NOT auto-respawn (finite wave) and
   *  is tagged ephemeral so clearSurvivalBots can dispose it. Returns its id. */
  spawnSurvivalBot(difficulty: BotDifficulty, spawn: THREE.Vector3, opts: BotOptions = {}): string {
    const id = `wave-${this._waveBotSeq++}`;
    const bot = new Bot(id, spawn, this.world, this.bus, difficulty, opts);
    bot.autoRespawn = false;
    bot.ephemeral = true;
    bot.health.grantInvulnerability(0.6);   // brief teleport-in grace, then fair game
    this.bots.push(bot);
    return id;
  }
  private _waveBotSeq = 0;

  /** Dispose + drop every ephemeral (wave) bot, leaving the base roster intact. */
  clearSurvivalBots() {
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (b.ephemeral) {
        b.dispose();
        this.bots.splice(i, 1);
      }
    }
  }

  /** Count of living wave bots — Onslaught polls this to detect a cleared wave. */
  livingSurvivalBots(): number {
    let n = 0;
    for (const b of this.bots) if (b.ephemeral && !b.health.dead) n++;
    return n;
  }

  /** Restore the player to full HP (wave-clear reward). */
  healPlayerFull() {
    this.playerActor.health.reset();
  }

  /** Spawn points for wave bots — the map's FFA spawns, shuffled, avoiding the
   *  one nearest the player so nobody materialises in your face. */
  survivalSpawns(count: number): THREE.Vector3[] {
    const spawns = this.currentMap.meta.ffaSpawns;
    if (spawns.length === 0) return [];
    this.player.eyePos(this._eyePos);
    const px = this._eyePos.x, pz = this._eyePos.z;
    // Sort spawns by distance from the player, descending, then take a rotating
    // window so successive waves don't all use the same far corner.
    const sorted = [...spawns].sort((a, b) =>
      Math.hypot(b.x - px, b.z - pz) - Math.hypot(a.x - px, a.z - pz));
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const s = sorted[(i + this._waveBotSeq) % sorted.length];
      out.push(new THREE.Vector3(s.x, 0.5, s.z));
    }
    return out;
  }

  /**
   * Notify the game that the MP session has connected or disconnected.
   * main.ts is responsible for setting/clearing game.mp first. Calling this
   * re-evaluates bot visibility so single-player bots don't leak into MP.
   */
  onMpChanged() {
    this.syncBotState();
    // Pickups: connecting/disconnecting changes who owns pickup state. Reset to
    // all-available; MP then applies the server's authoritative states via the
    // Welcome handler, and solo just keeps them all present.
    this.pickups.resetAll();
  }

  /**
   * Respawn the player: reset HP, re-apply class passives (in case the player
   * changed class mid-life), clear ability active state, drop in at spawn.
   */
  respawnPlayer() {
    // Tear down any active ability state (e.g. Cloak still on).
    this.abilities.ability.cancelActive({
      player: this.player,
      world: this.world,
      bus: this.bus,
      viewmodel: this.viewmodel,
      camera: this.camera,
      fx: this.castFX,
      playerActor: this.playerActor,
      cooldownMultiplier: 1.0,
    });
    this.applyClassPassives();
    this.playerActor.health.reset();
    // Practice mode skips invuln — no threats to be invulnerable from.
    if (isCombatMode(this.mode)) {
      this.playerActor.health.grantInvulnerability(SPAWN_PROTECTION_SECONDS);
    }
    const spawn = this.pickSafeSpawn();
    this.player.setPosition(spawn.x, spawn.y, spawn.z);
    this.player.speedMultiplier = 1.0;
    this.playerActor.isCloaked = false;
    // Dying drops your power-ups — you don't keep a buff through death.
    this.clearBuffs();
    // Local respawn SFX. In MP the server respawns us; the tick-level edge
    // detector picks that path up via the dead→alive transition.
    this.audio.play('respawn');
    if (isCombatMode(this.mode)) this.audio.play('spawn_protect');
  }

  /**
   * Pick a spawn point. In Practice mode the first spawn is always used (it's
   * the lab pad). In Combat mode we score each spawn by its *minimum* distance
   * to any active bot — the one with the largest min-distance wins. Bots
   * without LoS still penalize their spawn distance, just less.
   *
   * Side effect: the chosen point is returned by reference from the meta —
   * callers must NOT mutate it.
   */
  private pickSafeSpawn(): THREE.Vector3 {
    const spawns = this.currentMap.meta.ffaSpawns;
    if (this.mode === 'practice' || spawns.length === 0) return spawns[0];

    // In TDM only ENEMY bots should push the player's spawn away — spawning
    // near allies is fine (and desirable). FFA penalizes every active bot.
    const activeBots = this.bots.filter((b) =>
      b.active && !b.health.dead &&
      (this.mode !== 'tdm' || b.team !== this.playerActor.team));
    if (activeBots.length === 0) return spawns[0];

    let bestSpawn = spawns[0];
    let bestScore = -Infinity;
    for (const s of spawns) {
      let minDist = Infinity;
      let losPenalty = 0;
      for (const b of activeBots) {
        const dx = b.bodyAABB().min.x - s.x;
        const dz = b.bodyAABB().min.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < minDist) minDist = d;
        // If a bot has LoS on the candidate, knock the score down hard.
        if (this.world.hasLineOfSight(
          _SCRATCH_SPAWN_A.set(s.x, s.y + 1.5, s.z),
          _SCRATCH_SPAWN_B.set(b.bodyAABB().min.x, b.bodyAABB().min.y + 1.5, b.bodyAABB().min.z),
        )) {
          losPenalty -= 20;
        }
      }
      const score = minDist + losPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestSpawn = s;
      }
    }
    return bestSpawn;
  }

  /**
   * Swap to a different map. Tears down current geometry, rebuilds, repositions
   * player + bots. Damageable registrations are preserved across the swap.
   * Called from the main-menu map selector.
   */
  setMap(id: MapId) {
    if (this.currentMap.meta.id === id) return;
    this.resetMatchScore();
    // Cancel ongoing abilities (Pulse silhouettes, Barrier solids) before we
    // nuke the world — otherwise dangling refs are left in scene.
    this.abilities.ability.cancelActive({
      player: this.player,
      world: this.world,
      bus: this.bus,
      viewmodel: this.viewmodel,
      camera: this.camera,
      fx: this.castFX,
      playerActor: this.playerActor,
      cooldownMultiplier: 1.0,
    });
    this.world.clear();
    this.currentMap = MAPS[id];
    this.currentMap.build(this.world);

    // The new map sets its own fog/lighting. Re-apply graphics quality so the
    // pixel ratio + fog distance reflect the current preset (fog._baseFar
    // sentinel was cleared when world.clear nuked the old fog).
    this.setGraphicsQuality(this.graphicsQuality);

    // Re-place bots at fresh patrol positions and clean any death state.
    for (const b of this.bots) b.respawn();
    // Reset player too.
    this.respawnPlayer();
  }

  /**
   * Apply the active class's passive effects to the player's HP and weapons.
   * Called on construction and whenever the class is changed. Idempotent:
   * always rebuilds from the *base* values, so swapping classes can't stack.
   */
  applyClassPassives() {
    const passive = CLASS_LIBRARY[this.abilities.classId].passive;
    // HP: 100 base + bonus.
    this.playerActor.health.setMax(100 + (passive.bonusMaxHp ?? 0));
    // Weapons: reload multiplier (Rush).
    this.inventory.setReloadMultiplier(passive.reloadMultiplier ?? 1.0);
  }

  /** Re-apply the equipped weapon-finish cosmetic to the viewmodel. Called on
   *  any account change (equip) from main.ts. */
  applyEquippedFinish() {
    this.viewmodel.setFinish(this.account.equippedFinishEmissive());
  }

  /** Change class — called from the main menu or on respawn (we allow now). */
  setClass(id: ClassId) {
    this.abilities.setClass(id);
    this.applyClassPassives();
  }

  setFov(fov: number) {
    this.baseFov = fov;
    if (!this.inventory?.isScoped) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setSensitivity(s: number) {
    this.input.sensitivity = s;
  }

  /**
   * Apply a graphics quality preset. Affects what we can change at runtime:
   * pixel ratio + fog far-distance. Antialiasing is fixed at renderer
   * construction; switching to High after boot won't enable it (we note this
   * in the UI). Defaults to 'medium' if called with an unknown value.
   */
  setGraphicsQuality(q: 'low' | 'medium' | 'high') {
    this.graphicsQuality = q;
    const dpr = window.devicePixelRatio || 1;
    let pixelRatio: number;
    let fogMul: number;
    switch (q) {
      case 'low':    pixelRatio = 1;                       fogMul = 0.6; break;
      case 'high':   pixelRatio = Math.min(dpr, 2);        fogMul = 1.4; break;
      case 'medium':
      default:       pixelRatio = Math.min(dpr, 1.5);      fogMul = 1.0; break;
    }
    this.renderer.setPixelRatio(pixelRatio);
    // Scale the existing fog's far distance if a fog is present (set by map).
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      // Reset to a reasonable baseline before scaling, so swapping low→high
      // doesn't compound. Maps default to fog.far around 140–220.
      // We store a "baseFogFar" on the fog object to remember the map's intent.
      const anyFog = fog as THREE.Fog & { _baseFar?: number };
      if (anyFog._baseFar === undefined) anyFog._baseFar = fog.far;
      fog.far = anyFog._baseFar * fogMul;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  /** Public so feature modules (e.g. GrenadeManager) can punch the camera. */
  applyShake(intensity: number, decay: number) {
    this.shake.intensity = Math.max(this.shake.intensity, intensity);
    this.shake.decay = decay;
  }

  /**
   * Visual reward for a confirmed local-player kill. Pulls the equipped kill
   * effect's config and triggers (1) a particle puff at the hit point via
   * CastFX, (2) a brief screen tint via the DOM. No-op if hitPoint is null
   * (e.g. MP kills where the server doesn't broadcast the impact point).
   */
  private playKillEffect(hitPoint: THREE.Vector3 | null) {
    const cfg = findKillEffect(this.account.equippedKillEffect());
    if (!cfg) return;
    if (hitPoint) {
      this.castFX.flash(hitPoint, cfg.particleColor, 0.35, 1.5, 0.4);
    }
    if (cfg.tintColor !== 0x000000) {
      // Brief screen tint by adding a class to body; CSS handles the fade.
      document.body.classList.add('kill-flash');
      const r = (cfg.tintColor >> 16) & 0xff;
      const g = (cfg.tintColor >>  8) & 0xff;
      const b =  cfg.tintColor        & 0xff;
      document.body.style.setProperty('--kill-flash-color', `rgba(${r}, ${g}, ${b}, 0.4)`);
      setTimeout(() => document.body.classList.remove('kill-flash'), 150);
    }
  }

  /** Reset per-match score tallies. Called on mode swap and on Play Again. */
  resetMatchScore() {
    this.matchKills.clear();
    this.matchDeaths.clear();
    this.matchEnded = false;
    this.teamScore[0] = 0;
    this.teamScore[1] = 0;
    // Power-ups: restore all pads + drop any active buff on a fresh match.
    this.powerups?.resetAll();
    this.clearBuffs();
  }

  /**
   * Build the per-tick list of targets the bots can engage. Always includes the
   * local player; in TDM it also includes every active bot so bots fight across
   * team lines. Vectors are reused via a cache to avoid per-frame allocation.
   */
  private targetCache = new Map<string, { eye: THREE.Vector3; vel: THREE.Vector3 }>();
  private buildBotTargets(): BotTarget[] {
    const out: BotTarget[] = [];
    let pc = this.targetCache.get('player');
    if (!pc) { pc = { eye: new THREE.Vector3(), vel: new THREE.Vector3() }; this.targetCache.set('player', pc); }
    this.player.eyePos(pc.eye);
    pc.vel.copy(this.player.vel);
    out.push({
      id: 'player', team: this.playerActor.team, eye: pc.eye, vel: pc.vel,
      cloaked: this.playerActor.isCloaked, dead: this.playerActor.health.dead,
    });
    // Only in TDM do bots see each other as targets — keeps FFA/Gun Game feel
    // identical (bots only ever hunt the player there).
    if (this.mode === 'tdm') {
      for (const b of this.bots) {
        if (!b.active) continue;
        let bc = this.targetCache.get(b.id);
        if (!bc) { bc = { eye: new THREE.Vector3(), vel: new THREE.Vector3() }; this.targetCache.set(b.id, bc); }
        b.getEye(bc.eye);   // bots carry ~no velocity, so vel stays zero (no lead)
        out.push({ id: b.id, team: b.team, eye: bc.eye, vel: bc.vel, cloaked: false, dead: b.health.dead });
      }
    }
    return out;
  }

  /**
   * Quick melee — a short-range knife strike straight ahead. Solo-only (gated
   * by the caller). Reuses the damage/kill bus so the killfeed, XP, hitmarker,
   * impact FX and announcer all "just work"; weaponId 'knife' is harmless to
   * mastery (no knife skins → no unlock). Friendly fire respects the TDM team.
   */
  private doMelee() {
    if (this.meleeCooldown > 0 || this.playerActor.health.dead) return;
    this.meleeCooldown = Game.MELEE_COOLDOWN;

    this.viewmodel.meleeSwing();
    this.audio.play('melee');
    this.applyShake(0.02, 12);

    this.player.eyePos(this._eyePos);
    this.player.aimDir(this._aimDir);
    const friendlyTeam = this.mode === 'tdm' ? this.playerActor.team : undefined;
    const hit = this.world.raycast(this._eyePos, this._aimDir, Game.MELEE_RANGE, 'player', friendlyTeam);
    if (!hit) return;
    // Impact spark even on world hits (you whacked a wall).
    this.impacts.spawn(hit.point, hit.target !== null);
    if (!hit.target) return;

    const dmg = Game.MELEE_DAMAGE * (hit.isHeadshot ? 1.3 : 1);
    const killed = hit.target.health.takeDamage(dmg);
    this.bus.emit('damage', {
      attackerId: 'player', targetId: hit.target.id, amount: dmg,
      isHeadshot: hit.isHeadshot, hitPoint: hit.point.clone(), weaponId: 'knife',
    });
    if (killed) {
      this.bus.emit('kill', {
        attackerId: 'player', targetId: hit.target.id, weaponId: 'knife',
        isHeadshot: hit.isHeadshot, hitPoint: hit.point.clone(),
      });
    }
  }

  /** Grenade readiness 0..1 (1 = ready) — drives the HUD utility pill. */
  get grenadeReadyFraction(): number {
    return 1 - this.grenadeCooldown / Game.GRENADE_COOLDOWN;
  }

  /** Throw a frag grenade along the current aim (solo-only; cooldown-gated). */
  private throwGrenade() {
    if (this.grenadeCooldown > 0 || this.playerActor.health.dead) return;
    this.grenadeCooldown = Game.GRENADE_COOLDOWN;
    this.player.eyePos(this._eyePos);
    this.player.aimDir(this._aimDir);
    this.grenades.throw(this._eyePos, this._aimDir);
  }

  // ── Arena power-ups (solo-only) ─────────────────────────────────────────────

  /** Spawn anchors for the current map — guaranteed clear of solids. Read by
   *  PowerupManager to place pads safely without per-map curation. */
  get mapSpawns(): ReadonlyArray<THREE.Vector3> {
    return this.currentMap.meta.ffaSpawns;
  }

  /** Grant a power-up to the local player: starts/refreshes its timer, applies
   *  the weapon-layer multiplier, and fires juicy grab feedback. Solo-only. */
  grantPowerup(type: PowerupType) {
    const until = performance.now() + Game.POWERUP_DURATION_MS;
    if (type === 'damage') {
      this.buffDamageUntil = until;
      this.inventory.setDamageMultiplier(Game.POWERUP_DAMAGE_MULT);
    } else if (type === 'haste') {
      this.buffHasteUntil = until;
      this.inventory.setFireRateMultiplier(Game.POWERUP_HASTE_MULT);
    } else {
      this.buffShieldUntil = until;
      this.playerActor.health.damageReduction = Game.POWERUP_SHIELD_REDUCTION;
    }
    // Grab feedback: SFX + a burst at the player + a label + a screen flash.
    this.audio.play('pickup_powerup');
    this.player.eyePos(this._eyePos);
    const color = type === 'damage' ? 0xff3b54 : type === 'haste' ? 0xffc23a : 0x3ad6ff;
    this.castFX.flash(this._eyePos, color, 0.5, 1.8, 0.4);
    const label = type === 'damage' ? 'OVERCHARGE!' : type === 'haste' ? 'RAPID FIRE!' : 'OVERSHIELD!';
    ScorePopup.pop(label, 'buff');
    this.applyShake(0.02, 12);
    const el = document.getElementById('powerup-flash');
    if (el) {
      el.style.setProperty('--pu-flash', `#${color.toString(16).padStart(6, '0')}`);
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      window.setTimeout(() => el.classList.remove('show'), 420);
    }
  }

  /** Active power-up buffs for the HUD tray (kind + remaining fraction 0..1). */
  powerupBuffs(): Array<{ kind: PowerupType; frac: number; seconds: number }> {
    const now = performance.now();
    const out: Array<{ kind: PowerupType; frac: number; seconds: number }> = [];
    if (this.buffDamageUntil > now) {
      const rem = this.buffDamageUntil - now;
      out.push({ kind: 'damage', frac: rem / Game.POWERUP_DURATION_MS, seconds: rem / 1000 });
    }
    if (this.buffHasteUntil > now) {
      const rem = this.buffHasteUntil - now;
      out.push({ kind: 'haste', frac: rem / Game.POWERUP_DURATION_MS, seconds: rem / 1000 });
    }
    if (this.buffShieldUntil > now) {
      const rem = this.buffShieldUntil - now;
      out.push({ kind: 'shield', frac: rem / Game.POWERUP_DURATION_MS, seconds: rem / 1000 });
    }
    return out;
  }

  /** Expire power-up buffs whose timer elapsed (resets the weapon multiplier on
   *  the edge so we don't reset every frame). Called each tick. */
  private tickBuffs() {
    const now = performance.now();
    if (this.buffDamageUntil !== 0 && now >= this.buffDamageUntil) {
      this.buffDamageUntil = 0;
      this.inventory.setDamageMultiplier(1.0);
    }
    if (this.buffHasteUntil !== 0 && now >= this.buffHasteUntil) {
      this.buffHasteUntil = 0;
      this.inventory.setFireRateMultiplier(1.0);
    }
    if (this.buffShieldUntil !== 0 && now >= this.buffShieldUntil) {
      this.buffShieldUntil = 0;
      this.playerActor.health.damageReduction = 0;
    }
  }

  /** Cancel any active power-up buffs immediately (death / mode swap / map). */
  private clearBuffs() {
    if (this.buffDamageUntil !== 0) { this.buffDamageUntil = 0; this.inventory.setDamageMultiplier(1.0); }
    if (this.buffHasteUntil !== 0) { this.buffHasteUntil = 0; this.inventory.setFireRateMultiplier(1.0); }
    if (this.buffShieldUntil !== 0) { this.buffShieldUntil = 0; this.playerActor.health.damageReduction = 0; }
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private tick = (now: number) => {
    if (!this.running) return;
    this.rafHandle = requestAnimationFrame(this.tick);

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt <= 0) dt = 1 / 240;

    // Lifetime playtime — only counts while actively in a match (pointer
    // locked), not while paused or sitting in a menu. Persisted coarsely.
    if (this.input.pointerLocked) this.account.addPlaytime(dt);

    // --- 1. Player movement + look ---
    this.player.update(dt);

    // Player audio edges — fire one-shot SFX on jump/land/jump-pad. These
    // are local-only (no spatial) because they're "you" doing the action.
    // PlayerController latches the edge so we can't miss or duplicate.
    if (this.player.consumeJumpedEdge())   this.audio.play('jump');
    if (this.player.consumeLandedEdge())   this.audio.play('land');
    if (this.player.consumeJumpPadEdge())  this.audio.play('jump_pad');
    // Footsteps — scaled by the class's footstep volume passive (Phantom 0 =
    // silent, Ghost 0.5, others full). Own steps play unspatialized.
    if (this.player.consumeFootstepEdge()) {
      const fsVol = this.abilities.config.passive.footstepVolume ?? 1.0;
      this.audio.play('footstep', fsVol);
    }

    // --- 2. Weapon update, slot swap, scope, reload, fire ---
    this.inventory.update(dt);

    // Reload-start SFX. Edge-triggered: fires on the frame the weapon enters
    // its reload state, regardless of *why* (manual R press OR auto-reload
    // when firing an empty mag).
    const isReloading = this.inventory.current.isReloading;
    if (isReloading && !this.lastReloadingState) this.audio.play('reload');
    this.lastReloadingState = isReloading;

    // MP respawn edge: in MP the server flips HP back from 0 inside a snapshot;
    // we detect the dead→alive transition and play respawn SFX. Solo respawn
    // is handled inline in respawnPlayer() since we control the timing there.
    const isDead = this.playerActor.health.dead;
    if (!isDead && this.lastDeadState && this.mp) {
      this.audio.play('respawn');
      if (this.mode === 'combat') this.audio.play('spawn_protect');
    }
    this.lastDeadState = isDead;

    // Slot keys — edge-triggered.
    if (this.input.consumeAction('slot1')) {
      if (this.inventory.selectSlot(0)) this.viewmodel.swapTo(this.inventory.current.config.id as WeaponId);
    }
    if (this.input.consumeAction('slot2')) {
      if (this.inventory.selectSlot(1)) this.viewmodel.swapTo(this.inventory.current.config.id as WeaponId);
    }
    if (this.input.consumeAction('slotLast')) {
      if (this.inventory.swapLast()) this.viewmodel.swapTo(this.inventory.current.config.id as WeaponId);
    }

    // Scope on RMB — only while pressed (CS-style hold-to-scope is the only
    // intuitive option for a single-stage scope, no half-zoom in v1).
    if (!this.playerActor.health.dead && !this.inventory.isSwapping) {
      this.inventory.setScoped(this.input.isMouseDown(2));
    } else {
      this.inventory.setScoped(false);
    }

    // FOV: scope drops camera FOV. Viewmodel hides while scoped.
    const scoped = this.inventory.isScoped;
    // Effective base FOV includes ability nudges (Rush Surge adds +8). Scope
    // overrides everything else — you can't scope-and-Surge for FOV stacking.
    const effectiveBase = this.baseFov + this.player.abilityFovOffset;
    const targetFov = scoped ? this.inventory.current.config.scopeFov ?? effectiveBase : effectiveBase;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      // Lerp fast — scope feels best near-instant.
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 22);
      this.camera.updateProjectionMatrix();
    }
    this.viewmodel.setHidden(scoped);
    // Mouse sensitivity scaled by FOV ratio so wrist motion is consistent.
    const fovRatio = this.camera.fov / this.baseFov;
    this.input.zoomSensitivityScale = fovRatio;

    if (this.input.consumeAction('reload')) this.inventory.current.startReload();

    // Quick melee (V / F) — edge-triggered, solo-only (MP damage is server-
    // authoritative and there's no melee in the protocol; a client-only hit
    // would mislead). The cooldown ticks regardless so the timer stays sane.
    if (this.meleeCooldown > 0) this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    // Gated on pointer-lock so a stray V/F in a menu can't deal damage to bots.
    if (this.input.pointerLocked && this.input.consumeAction('melee') && !this.mp) this.doMelee();

    // Frag grenade (G) — edge-triggered, solo-only, pointer-lock gated.
    if (this.grenadeCooldown > 0) this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    if (this.input.pointerLocked && this.input.consumeAction('grenade') && !this.mp) this.throwGrenade();
    this.grenades.update(dt);

    // Ability press (E) — edge-triggered.
    if (this.input.consumeAction('ability') && !this.playerActor.health.dead) {
      const triggered = this.abilities.tryTrigger();
      if (triggered) {
        // Local ability cast SFX (unspatialized — it's "you" doing it).
        const abilityId = this.abilities.ability.id;
        this.audio.play(`ability_${abilityId}` as SoundId);
      }
      // MP: tell the server we cast. Aim is needed for ranged abilities
      // (Blink, Dash) — we send it always; server ignores it for instant ones.
      if (triggered && this.mp) {
        const abilityId = this.abilities.ability.id;
        this.player.aimDir(this._aimDir);
        this.mp.sendAbility(abilityId, this._aimDir);
      }
    }
    this.abilities.update(dt);

    // Fire: automatic weapons read held LMB, semi-auto reads edge.
    const wpn = this.inventory.current;
    const wantsFire = !this.playerActor.health.dead && !this.inventory.isSwapping &&
      (wpn.config.automatic ? this.input.isMouseDown(0) : this.input.consumeMouseEdge(0));

    if (wantsFire) {
      // Dry-trigger click — pulled the trigger on an empty mag. Note: when
      // tryFire is called below it auto-starts a reload, so this only fires
      // on the FIRST empty pull (subsequent pulls during reload are silent
      // because isReloading is true). Edge-cased before tryFire so we don't
      // try to read post-fire state.
      if (wpn.ammo === 0 && !wpn.isReloading) this.audio.play('empty_click');
      this.player.eyePos(this._eyePos);
      this.player.aimDir(this._aimDir);
      // Stance + movement spread penalty — crouched/stationary = tighter,
      // moving/airborne = wider. Bots pass 1.0 (their own jitter handles it).
      const stanceMul = this.player.stanceAccuracyPenalty();
      const res = wpn.tryFire(this._eyePos, this._aimDir, stanceMul);
      if (res) {
        this.player.applyRecoil(res.recoilKick.pitch, res.recoilKick.yaw);
        this.applyShake(0.012, 14);
        // Cloak breaks on fire — runner forwards to the ability instance.
        this.abilities.notifyPlayerFired();
        // MP: notify server of the shot for authoritative hit-detection.
        // Note: in MP, the local damage handler still fires (predicted hit) —
        // the server's Damage event will reconcile if our prediction was wrong.
        this.mp?.sendFire(wpn.config.id, this._eyePos, this._aimDir);
      } else if (this.inventory.tryAutoSwapToPistol()) {
        // Primary was empty — auto-swap to pistol, do NOT fire this frame so
        // the user sees the swap animation. Next fire press fires the pistol.
        this.viewmodel.swapTo('pistol');
      }
    }

    // --- 3. Bots --- (skipped in Practice and MP modes)
    this.player.eyePos(this._eyePos);
    if (!this.mp) {
      const targets = this.buildBotTargets();
      for (const b of this.bots) {
        if (!b.active) continue;
        b.update(dt, targets);
      }
    }

    // --- 3b. Multiplayer: send input + interpolate remotes ---
    if (this.mp) {
      this.mp.sendFrameInput(dt);
      this.mp.renderRemotes(Date.now());
    }

    // --- 4. Viewmodel ---
    this.viewmodel.update(dt, this.player.speed, this.player.state !== 'air');

    // --- 5. Effects + world tick ---
    this.tracers.update(dt);
    this.impacts.update(dt);    // tick pooled bullet-impact sparks/puffs
    this.castFX.update(dt);     // tick ability cast effects (flashes, waves, trails)
    this.dmgNumbers.update(dt); // tick floating damage numbers
    this.pickups.update(dt);    // animate + (solo) run map health pickups
    this.powerups.update(dt);   // animate + (solo) run arena power-up pads
    this.tickBuffs();           // expire power-up buffs whose timer elapsed
    this.world.update();        // expires Engineer barrier solids when their TTL is up
    if (this.aimLab) this.aimLab.update(dt);   // Aim Lab timer + target animation
    if (this.onslaught) this.onslaught.update(dt);  // wave pacing + respawn timing
    if (this.duel) this.duel.update(dt);            // duel intro/intermission pacing
    if (this.hardpoint) this.hardpoint.update(dt);  // hardpoint scoring + zone rotation

    // Screen shake — random offset, decays exponentially.
    if (this.shake.intensity > 0.0005) {
      this._baseCamPos.copy(this.camera.position);
      this._shakeOffset.set(
        (Math.random() - 0.5) * 2 * this.shake.intensity,
        (Math.random() - 0.5) * 2 * this.shake.intensity,
        0,
      );
      this.camera.position.add(this._shakeOffset);
      this.shake.intensity *= Math.exp(-this.shake.decay * dt);

      // --- 6. Render with shake offset ---
      this.renderer.render(this.scene, this.camera);
      // Restore so movement code doesn't accumulate offset.
      this.camera.position.copy(this._baseCamPos);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // FPS update at ~5Hz.
    this.frameCount++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.2) {
      this.fps = Math.round(this.frameCount / this.fpsAccum);
      this.frameCount = 0;
      this.fpsAccum = 0;
    }

    this.onFrame?.({
      fps: this.fps,
      speed: this.player.speed,
      state: this.player.state,
      pos: this.player.pos,
    });
  };
}

const _SCRATCH_END = new THREE.Vector3();
const _SCRATCH_SPAWN_A = new THREE.Vector3();
const _SCRATCH_SPAWN_B = new THREE.Vector3();
