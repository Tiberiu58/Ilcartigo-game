/**
 * Bot — single-player target practice with light AI.
 *
 * State machine:
 *
 *   IDLE      → patrol between waypoints, slow walk
 *   ENGAGE    → has LoS on player: face them, fire with the Weapon class,
 *               sidestep occasionally to look alive
 *   REPOSITION→ lost LoS or took damage from out of view: walk to a waypoint
 *               closer to the player's last known position
 *   DEAD      → fall over, despawn after RESPAWN_DELAY
 *
 * Aim model: a fixed reaction delay before opening fire (REACTION_TIME) +
 * gaussian-ish jitter on aim direction to give the player a fair chance.
 * Difficulty scales: easier = bigger jitter, longer reaction; harder = predictive
 * lead. For Phase 2 we ship "normal" only.
 *
 * The bot uses simple AABB ground-snap movement: it doesn't bunny-hop, doesn't
 * slide. It walks at a fixed speed and respects solid walls but not stairs —
 * that's good enough for the open test map.
 */

import * as THREE from 'three';
import { Health } from './Health';
import type { Damageable, HitAABB } from './Damageable';
import type { World } from '../core/World';
import { Weapon, AR_CONFIG } from '../weapons/Weapon';
import type { GameEventBus } from '../core/events';

const WALK_SPEED = 4.0;
const RESPAWN_DELAY = 3.0;

/**
 * Difficulty tier — three preset bundles of reaction time, aim jitter, and
 * predictive lead. Predict=0 means aim at the player's current eye position;
 * predict>0 means aim at their position + velocity * predict seconds.
 */
export type BotDifficulty = 'wanderer' | 'engager' | 'predictor';

/** Player-chosen global skill level. Layered on top of each bot's per-tier
 *  preset so the whole roster scales together without rebuilding weapons. */
export type GameDifficulty = 'easy' | 'normal' | 'hard';
/** Multipliers applied to the AI feel (NOT weapon stats): reaction window, aim
 *  jitter cone, predictive lead, and fire-cadence gap. Easy = slow + sloppy;
 *  Hard = fast, accurate, leads its shots. */
const SKILL: Record<GameDifficulty, { reaction: number; jitter: number; predict: number; fireGap: number }> = {
  easy:   { reaction: 1.7, jitter: 2.4, predict: 0.3, fireGap: 1.40 },
  normal: { reaction: 1.0, jitter: 1.0, predict: 1.0, fireGap: 1.00 },
  hard:   { reaction: 0.6, jitter: 0.45, predict: 1.5, fireGap: 0.78 },
};

/** Optional per-bot overrides — used by Onslaught to spawn HP-scaled regulars
 *  and emissive "boss" elites without touching the default 3-bot roster. */
export interface BotOptions {
  maxHp?: number;
  bodyColor?: number;
  headColor?: number;
  emissive?: number;
  elite?: boolean;
  /** Pre-set callsign (shown in killfeed/scoreboard). Defaults to the id. */
  name?: string;
  /** Per-bot global skill (Easy/Normal/Hard) applied at construction. Used by
   *  Duel to escalate a single opponent's AI feel without touching the roster. */
  skill?: GameDifficulty;
}
const DIFFICULTY: Record<BotDifficulty, {
  reactionTime: number; aimJitter: number; predictSeconds: number; fireRate: number; damageMul: number;
}> = {
  wanderer:  { reactionTime: 0.55, aimJitter: 0.045, predictSeconds: 0,   fireRate: 3.0, damageMul: 0.7 },
  engager:   { reactionTime: 0.35, aimJitter: 0.025, predictSeconds: 0,   fireRate: 4.0, damageMul: 0.8 },
  predictor: { reactionTime: 0.25, aimJitter: 0.015, predictSeconds: 0.18, fireRate: 5.0, damageMul: 0.9 },
};
const BODY_HALF = new THREE.Vector3(0.4, 0.9, 0.4);    // standing
const HEAD_OFFSET = 1.55;         // from feet
const HEAD_SIZE = 0.28;
const ENGAGE_RANGE = 60;

type BotState = 'idle' | 'engage' | 'reposition' | 'dead';

/**
 * A potential combat target a bot can engage, built by Game each tick. Unifies
 * the player and other bots so one targeting path serves both FFA (the bot only
 * ever sees the player as an enemy) and TDM (bots fight whichever team isn't
 * theirs). Vectors are owned by the caller — the bot only reads them.
 */
export interface BotTarget {
  id: string;
  team: number;
  /** Eye position (for aim + line-of-sight). */
  eye: THREE.Vector3;
  /** Velocity (predictor-tier lead). Zero for bots — they move slowly. */
  vel: THREE.Vector3;
  cloaked: boolean;
  dead: boolean;
}

// Generic patrol points — chosen to avoid Sandstone's buildings and the
// TestMap's central pillar. Per-map waypoint sets come in Phase 5b polish.
const WAYPOINTS: THREE.Vector3[] = [
  new THREE.Vector3( 12, 0,  -6),    // east of plaza, south side
  new THREE.Vector3(-12, 0,  -6),    // west of plaza, south side
  new THREE.Vector3(-15, 0,  15),    // NW of plaza
  new THREE.Vector3( 15, 0,  15),    // NE of plaza
  new THREE.Vector3(  6, 0,  22),    // long lane, east of centre
  new THREE.Vector3( -6, 0, -22),    // alley, west of centre
];

export class Bot implements Damageable {
  readonly id: string;
  readonly health: Health;
  /** Team — 1 by default (enemy of the team-0 player) in FFA. Reassigned per
   *  match by Game in Team Deathmatch. */
  team = 1;
  readonly weapon: Weapon;

  private world: World;
  private bus: GameEventBus;
  /** Public so ability silhouettes (Hunter Pulse) can attach overlays. */
  readonly group: THREE.Group;
  /** Soft on/off switch — Practice Range deactivates bots without destroying them. */
  active = true;
  /** When false, a killed bot stays a corpse instead of respawning. Onslaught
   *  (wave survival) sets this false so each wave is a finite set of enemies. */
  autoRespawn = true;
  /** Tags bots spawned by a transient mode (Onslaught waves) so they can be
   *  disposed wholesale without touching the persistent base roster. */
  ephemeral = false;

  private position = new THREE.Vector3();
  private yaw = 0;
  private state: BotState = 'idle';
  private currentWaypoint = 0;
  private engageTime = 0;       // seconds in ENGAGE state, gates first shot
  private deathTime = 0;
  /** Visual-only sink offset during death animation. Reset on respawn so the
   * corpse doesn't drift below the floor across multiple deaths. */
  private deathFallOffset = 0;
  private timeSinceLastShot = 0;
  private sidestepPhase = 0;
  private tier: typeof DIFFICULTY[BotDifficulty];
  readonly difficulty: BotDifficulty;
  /** Humanized callsign shown in the killfeed + scoreboard. Defaults to the id;
   *  Game assigns a real one. The id stays the stable key for scoring. */
  name: string;
  /** Active global skill modifier (Easy/Normal/Hard). */
  private skill = SKILL.normal;

  // Mesh refs + base colours so TDM can re-tint to team colours and restore.
  private bodyMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;
  private baseBodyColor: number;
  private baseHeadColor: number;
  /** TDM respawn anchor (team's spawn area). null = FFA waypoint respawn. */
  homeSpawn: THREE.Vector3 | null = null;

  // Re-used vectors.
  private _bodyMin = new THREE.Vector3();
  private _bodyMax = new THREE.Vector3();
  private _headMin = new THREE.Vector3();
  private _headMax = new THREE.Vector3();
  private _toTarget = new THREE.Vector3();
  private _aim = new THREE.Vector3();

  /** True for Onslaught "boss"/elite bots — used by HUD/feedback to read them
   *  as a special kill. Cosmetic + tracked only; no gameplay branch here. */
  readonly elite: boolean;

  constructor(
    id: string, spawn: THREE.Vector3, world: World, bus: GameEventBus,
    difficulty: BotDifficulty = 'engager', opts: BotOptions = {},
  ) {
    this.id = id;
    this.health = new Health(opts.maxHp ?? 100);
    this.world = world;
    this.bus = bus;
    this.difficulty = difficulty;
    this.tier = DIFFICULTY[difficulty];
    this.name = opts.name ?? id;
    this.elite = opts.elite ?? false;
    if (opts.skill) this.skill = SKILL[opts.skill];

    // Bots share the AR config but each tier modulates fire rate + damage.
    // damageMul is applied to baseDamage — easier bots hit softer.
    this.weapon = new Weapon(
      {
        ...AR_CONFIG,
        fireRate: this.tier.fireRate,
        recoilPitch: 0,
        recoilYaw: 0,
        baseDamage: AR_CONFIG.baseDamage * this.tier.damageMul,
      },
      world, bus, id,
    );
    this.position.copy(spawn);

    this.group = new THREE.Group();
    // Color by difficulty: orange (wanderer) → red (engager) → magenta (predictor).
    // Elites override to a menacing dark crimson with an emissive glow so they
    // read instantly as the wave's threat.
    const bodyColor = opts.bodyColor ?? (difficulty === 'wanderer' ? 0xe88c3a
      : difficulty === 'predictor' ? 0xb43a8a
      : 0xd84a4a);
    const headColor = opts.headColor ?? (difficulty === 'wanderer' ? 0x955020
      : difficulty === 'predictor' ? 0x6a1f4f
      : 0x8a2c2c);
    this.baseBodyColor = bodyColor;
    this.baseHeadColor = headColor;
    const emissive = opts.emissive ?? 0x000000;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_HALF.x * 2, BODY_HALF.y * 2, BODY_HALF.z * 2),
      new THREE.MeshLambertMaterial({ color: bodyColor, emissive, emissiveIntensity: 0.6, flatShading: true }),
    );
    body.position.y = BODY_HALF.y;
    this.group.add(body);
    this.bodyMesh = body;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE),
      new THREE.MeshLambertMaterial({ color: headColor, emissive, emissiveIntensity: 0.6, flatShading: true }),
    );
    head.position.y = HEAD_OFFSET + HEAD_SIZE / 2;
    this.group.add(head);
    this.headMesh = head;

    // Eye band so you can tell facing direction.
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.05, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
    );
    eye.position.set(0, HEAD_OFFSET + HEAD_SIZE / 2, -HEAD_SIZE / 2 - 0.01);
    this.group.add(eye);

    this.syncMesh();
    world.scene.add(this.group);
    world.registerDamageable(this);
  }

  bodyAABB(): HitAABB {
    this._bodyMin.set(this.position.x - BODY_HALF.x, this.position.y, this.position.z - BODY_HALF.z);
    this._bodyMax.set(this.position.x + BODY_HALF.x, this.position.y + BODY_HALF.y * 2, this.position.z + BODY_HALF.z);
    return { min: this._bodyMin, max: this._bodyMax };
  }

  headAABB(): HitAABB {
    const h2 = HEAD_SIZE / 2;
    const y = this.position.y + HEAD_OFFSET;
    this._headMin.set(this.position.x - h2, y, this.position.z - h2);
    this._headMax.set(this.position.x + h2, y + HEAD_SIZE, this.position.z + h2);
    return { min: this._headMin, max: this._headMax };
  }

  /**
   * Called every frame with the list of potential targets (built by Game). The
   * bot engages the nearest visible ENEMY (different team, alive, not cloaked).
   * In FFA the list is just the player, so behaviour is unchanged; in TDM it's
   * the player + every bot, so allies are ignored and enemies are hunted.
   * Predictor-tier bots lead their shots using the target's velocity.
   */
  update(dt: number, targets: BotTarget[]) {
    this.weapon.update(dt);
    this.timeSinceLastShot += dt;

    if (this.health.dead) {
      this.state = 'dead';
      this.deathTime += dt;
      // Visual-only effects: ragdoll rotation + slow sink. AABB stays put;
      // raycast already gates on health.dead so dead bots aren't hittable.
      this.group.rotation.z = Math.min(Math.PI / 2, this.group.rotation.z + dt * 4);
      this.deathFallOffset = Math.min(this.position.y, this.deathFallOffset + dt * 0.3);
      this.group.position.set(
        this.position.x,
        this.position.y - this.deathFallOffset,
        this.position.z,
      );
      if (this.autoRespawn && this.deathTime >= RESPAWN_DELAY) this.respawn();
      return;
    }
    this.group.rotation.z = 0;

    // Eye position of bot (mid-head).
    const botEye = _SCRATCH.set(this.position.x, this.position.y + HEAD_OFFSET + HEAD_SIZE / 2, this.position.z);

    // Pick the nearest visible enemy: different team, alive, not cloaked, within
    // engage range, with line of sight. (Cloaked = invisible — Ghost passive.)
    let best: BotTarget | null = null;
    let bestDist = ENGAGE_RANGE;
    for (const t of targets) {
      if (t.id === this.id || t.dead || t.cloaked || t.team === this.team) continue;
      const d = botEye.distanceTo(t.eye);
      if (d < bestDist && this.world.hasLineOfSight(botEye, t.eye)) {
        best = t;
        bestDist = d;
      }
    }
    const hasLoS = best !== null;

    // Transition logic.
    if (hasLoS) {
      if (this.state !== 'engage') this.engageTime = 0;
      this.state = 'engage';
    } else if (this.state === 'engage') {
      this.state = 'reposition';
    } else if (this.state === 'reposition') {
      // Continue toward current waypoint; once reached, return to idle.
      const target = WAYPOINTS[this.currentWaypoint];
      if (this.position.distanceTo(target) < 1.0) this.state = 'idle';
    }

    if (this.state === 'engage' && best) {
      this.engageTime += dt;
      this.faceTarget(best.eye, dt);

      // Sidestep so we don't stand still — sinusoidal lateral motion at ~1Hz.
      this.sidestepPhase += dt * 1.4;
      const sideAmount = Math.sin(this.sidestepPhase) * WALK_SPEED * 0.45;
      const sideDir = _SIDE.set(Math.cos(this.yaw + Math.PI / 2), 0, -Math.sin(this.yaw + Math.PI / 2));
      this.tryStep(sideDir.multiplyScalar(sideAmount * dt));

      // Fire after the reaction window. Both gates scale with the chosen
      // difficulty (slower + rarer on Easy, snappier on Hard). Predictor-tier
      // leads the target; Hard widens the lead.
      const reaction = this.tier.reactionTime * this.skill.reaction;
      const fireGap = (1 / this.weapon.config.fireRate) * this.skill.fireGap;
      if (this.engageTime > reaction && this.timeSinceLastShot > fireGap) {
        const aimPoint = _AIM_POINT.copy(best.eye);
        const predict = this.tier.predictSeconds * this.skill.predict;
        if (predict > 0) {
          aimPoint.addScaledVector(best.vel, predict);
        }
        this.fireAt(botEye, aimPoint);
      }
    } else {
      // Patrol movement: walk toward currentWaypoint.
      this.patrol(dt);
    }

    this.syncMesh();
  }

  /** Apply the player-chosen global skill level (Easy/Normal/Hard). */
  setDifficulty(level: GameDifficulty) {
    this.skill = SKILL[level];
  }

  /** Read-only world position (feet). Used by objective modes (Hardpoint) for
   *  zone-occupancy checks without exposing the mutable internal vector. */
  get pos(): THREE.Vector3 {
    return this.position;
  }

  /** Eye position (mid-head) in world space — for Game's target list + LoS. */
  getEye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + HEAD_OFFSET + HEAD_SIZE / 2, this.position.z);
  }

  /** Override the figure's colour for team identity in TDM. null restores the
   *  difficulty-based colour (FFA). */
  setTeamColor(color: number | null) {
    (this.bodyMesh.material as THREE.MeshLambertMaterial).color.setHex(color ?? this.baseBodyColor);
    // Head a touch darker than the body so the silhouette still reads.
    const head = color === null ? this.baseHeadColor : (color & 0xfefefe) >> 1;
    (this.headMesh.material as THREE.MeshLambertMaterial).color.setHex(head);
  }

  private faceTarget(target: THREE.Vector3, dt: number) {
    this._toTarget.set(target.x - this.position.x, 0, target.z - this.position.z);
    const targetYaw = Math.atan2(-this._toTarget.x, -this._toTarget.z);
    // Lerp yaw with shortest-angle wrap.
    let delta = targetYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 9);
  }

  private fireAt(origin: THREE.Vector3, target: THREE.Vector3) {
    this._aim.subVectors(target, origin).normalize();
    // Aim jitter — uniform in a cone whose half-angle scales with difficulty.
    const r = this.tier.aimJitter * this.skill.jitter;
    const ax = (Math.random() - 0.5) * 2 * r;
    const ay = (Math.random() - 0.5) * 2 * r;
    this._aim.x += ax;
    this._aim.y += ay;
    this._aim.normalize();

    const res = this.weapon.tryFire(origin, this._aim);
    if (res) this.timeSinceLastShot = 0;
  }

  private patrol(dt: number) {
    const wp = WAYPOINTS[this.currentWaypoint];
    const toX = wp.x - this.position.x;
    const toZ = wp.z - this.position.z;
    const dist = Math.hypot(toX, toZ);
    if (dist < 0.8) {
      this.currentWaypoint = (this.currentWaypoint + 1) % WAYPOINTS.length;
      return;
    }
    const speed = (this.state === 'reposition' ? WALK_SPEED * 1.2 : WALK_SPEED * 0.55) * dt;
    const stepX = (toX / dist) * speed;
    const stepZ = (toZ / dist) * speed;
    this.tryStep(_STEP.set(stepX, 0, stepZ));

    // Face direction of travel.
    const targetYaw = Math.atan2(-stepX, -stepZ);
    let delta = targetYaw - this.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.yaw += delta * Math.min(1, dt * 5);
  }

  /** Move by `step` if the destination is clear; else nudge by axis. */
  private tryStep(step: THREE.Vector3) {
    const proposed = _PROP.copy(this.position).add(step);
    if (this.world.firstOverlap(proposed, BODY_HALF) === null) {
      this.position.copy(proposed);
      return;
    }
    // Try sliding along walls — X-only then Z-only.
    proposed.copy(this.position).add(_AX.set(step.x, 0, 0));
    if (this.world.firstOverlap(proposed, BODY_HALF) === null) {
      this.position.copy(proposed);
      return;
    }
    proposed.copy(this.position).add(_AZ.set(0, 0, step.z));
    if (this.world.firstOverlap(proposed, BODY_HALF) === null) {
      this.position.copy(proposed);
    }
  }

  private syncMesh() {
    this.group.position.set(this.position.x, this.position.y, this.position.z);
    this.group.rotation.y = this.yaw;
  }

  /**
   * Public so mode-swap (Practice ↔ Combat) can force a clean reset on bots
   * mid-animation. Internally called when deathTime exceeds RESPAWN_DELAY.
   */
  respawn() {
    this.health.reset();
    this.health.grantInvulnerability(2);  // 2s spawn protection, matches player
    this.deathTime = 0;
    this.deathFallOffset = 0;
    this.state = 'idle';
    this.engageTime = 0;
    if (this.homeSpawn) {
      // TDM: respawn near the team's spawn anchor with a little scatter, nudged
      // back to the anchor if the jittered point lands inside a solid.
      const jx = (Math.random() - 0.5) * 6;
      const jz = (Math.random() - 0.5) * 6;
      this.position.set(this.homeSpawn.x + jx, 0.5, this.homeSpawn.z + jz);
      if (this.world.firstOverlap(this.position, BODY_HALF) !== null) {
        this.position.set(this.homeSpawn.x, 0.5, this.homeSpawn.z);
      }
    } else {
      this.currentWaypoint = Math.floor(Math.random() * WAYPOINTS.length);
      const wp = WAYPOINTS[this.currentWaypoint];
      this.position.set(wp.x, 0.5, wp.z);
    }
    this.group.rotation.set(0, this.yaw, 0);
    this.syncMesh();
    void this.bus;
  }

  /**
   * Permanently remove this bot from the world: unregister it as a damage
   * target, pull its mesh from the scene, and free GPU resources. Used by
   * transient modes (Onslaught) that spawn fresh bots each wave. Safe to call
   * once — the instance must be dropped from any roster afterwards.
   */
  dispose() {
    this.active = false;
    this.world.unregisterDamageable(this.id);
    this.world.scene.remove(this.group);
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
  }
}

const _SCRATCH = new THREE.Vector3();
const _SIDE = new THREE.Vector3();
const _STEP = new THREE.Vector3();
const _PROP = new THREE.Vector3();
const _AX = new THREE.Vector3();
const _AZ = new THREE.Vector3();
const _AIM_POINT = new THREE.Vector3();
