/**
 * Room — one FFA room. Owns all connected players, runs the 32Hz tick.
 *
 * MVP design:
 *   - Single hardcoded Sandstone room. No matchmaking, no multiple rooms.
 *   - 6 player cap (FFA spec says first-to-30 kills, 10min — those are
 *     gameplay-level; the room just caps the connections).
 *   - Each connected socket = one ServerPlayer.
 *   - 32Hz simulation: every 31.25ms, drain each player's input queue,
 *     advance their controller, broadcast a snapshot to everyone.
 *
 * Hitscan + damage happens out-of-tick on Fire events (lag-compensated).
 */

import type { Server, Socket } from 'socket.io';
import { ServerController, type PlayerInput } from './Controller.js';
import { COLLISION_BY_MAP, type SolidAABB } from './MapCollision.js';
import {
  EV, PROTOCOL_VERSION, type ClientInput, type PlayerSnapshot,
  type Snapshot, type ServerWelcome, type ServerPlayerJoined, type ServerPlayerLeft,
  type ClientFireRequest, type ServerShotEvent, type ServerDamageEvent, type ServerKillEvent,
  type Vec3, type ClientAbilityRequest, type ServerAbilityCast,
  type ServerAddSolid, type ServerRemoveSolid, type ClientHello,
  type ServerMatchOver, type ServerMatchReset,
} from './Protocol.js';

const VALID_CLASSES = new Set(['phantom', 'rush', 'vanguard', 'ghost', 'engineer', 'hunter']);
const VALID_WEAPONS = new Set(['ar', 'smg', 'sniper', 'shotgun', 'pistol', 'marksman']);

/**
 * Authoritative per-weapon damage model — MUST mirror each WeaponConfig in
 * client/src/weapons/Weapon.ts (baseDamage / headshotMultiplier / maxRange /
 * falloff* / pellets / baseSpread). Before Phase 14 the server hardcoded AR
 * damage (24 / ×1.8, single ray) for EVERY weapon, so online a sniper didn't
 * one-shot, a shotgun fired one pellet, and an SMG hit like a rifle. With this
 * table the server runs the same TTK the client's loadout implies — weapon
 * choice finally matters in multiplayer. Keep in sync with the client lib.
 */
interface WeaponStats {
  baseDamage: number;
  headMul: number;
  maxRange: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMin: number;
  /** Rays per trigger pull (shotgun = 9). Each pellet is its own spread sample. */
  pellets: number;
  /** Idle cone radius in radians, used for the server-side pellet/spread sample. */
  baseSpread: number;
}
const WEAPON_STATS: Record<string, WeaponStats> = {
  ar:       { baseDamage: 24, headMul: 1.8,  maxRange: 200, falloffStart: 25,  falloffEnd: 70,  falloffMin: 0.6,  pellets: 1, baseSpread: 0.004 },
  smg:      { baseDamage: 14, headMul: 1.6,  maxRange: 120, falloffStart: 14,  falloffEnd: 45,  falloffMin: 0.4,  pellets: 1, baseSpread: 0.010 },
  sniper:   { baseDamage: 60, headMul: 1.85, maxRange: 240, falloffStart: 200, falloffEnd: 240, falloffMin: 0.85, pellets: 1, baseSpread: 0.0 },
  shotgun:  { baseDamage: 12, headMul: 1.4,  maxRange: 60,  falloffStart: 6,   falloffEnd: 22,  falloffMin: 0.3,  pellets: 9, baseSpread: 0.055 },
  pistol:   { baseDamage: 22, headMul: 1.7,  maxRange: 90,  falloffStart: 18,  falloffEnd: 55,  falloffMin: 0.55, pellets: 1, baseSpread: 0.003 },
  marksman: { baseDamage: 48, headMul: 2.0,  maxRange: 220, falloffStart: 55,  falloffEnd: 130, falloffMin: 0.7,  pellets: 1, baseSpread: 0.0015 },
};

const TICK_HZ = 32;
const TICK_MS = 1000 / TICK_HZ;
const MAX_PLAYERS = 6;
/** FFA win condition (spec: first to 30 kills). Server is authoritative.
 *  Overridable via MATCH_GOAL env for dev/testing (e.g. MATCH_GOAL=3 for a
 *  quick match in a smoke test); falls back to 30 for anything non-positive. */
const MATCH_KILL_GOAL = (() => {
  const n = Number(process.env.MATCH_GOAL);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

// FFA spawn points per map. Kept in sync with each map's MapMeta.ffaSpawns
// in the client. Industrial includes one elevated spawn on the L1 catwalk.
const SPAWNS_BY_MAP: Record<string, ReadonlyArray<Vec3>> = {
  sandstone: [
    [ 32, 0.5,  32],
    [-32, 0.5,  32],
    [ 32, 0.5, -32],
    [-32, 0.5, -32],
  ],
  industrial: [
    [-42, 0.5,  32],     // NW warehouse interior corner
    [-42, 0.5, -32],     // SW warehouse interior corner
    [ 28, 4.5,    0],    // mid L1 catwalk
    [ 42, 0.5, -28],     // SE yard corner
  ],
};

interface AbilityState {
  /** Wall-clock ms when the ability is next castable (cooldown). */
  cooldownUntil: number;
  /** For multi-charge abilities (Dash). 1 by default. */
  charges: number;
  maxCharges: number;
  /** For duration abilities (Surge, Cloak): when the active state ends. */
  activeUntil: number;
  /** Surge: server-side speed multiplier toggle. */
  surgeMultiplier: number;
  /** Cloak: server-side flag (also synced to PlayerSnapshot.cloaked). */
  cloakActive: boolean;
}

interface ServerPlayer {
  socket: Socket;
  id: string;
  classId: string;
  weaponId: string;
  skinId: string;
  controller: ServerController;
  hp: number;
  maxHp: number;
  alive: boolean;
  cloaked: boolean;
  kills: number;
  deaths: number;
  /** Pending inputs sorted by seq, applied at next tick. */
  inputQueue: ClientInput[];
  /** Highest seq we've applied for this player (echoed to them in snapshots). */
  ackSeq: number;
  /** Position history for lag-comp: ring of (t, [x,y,z]). */
  posHistory: Array<{ t: number; pos: Vec3 }>;
  /** Wall-clock ms when this player's HP can next take damage (spawn protection). */
  invulnUntil: number;
  /** Ability bookkeeping. */
  ability: AbilityState;
}

/** Networked Engineer Barrier (or future temp solids). */
interface TempSolid {
  id: number;
  ownerId: string;
  /** AABB stored as [minX, minY, minZ, maxX, maxY, maxZ] for raycast/collision uniformity. */
  aabb: [number, number, number, number, number, number];
  center: Vec3;
  size: Vec3;
  expiresAt: number;
}

// Per-class ability config — base cooldowns from spec.
const ABILITY_BASE_COOLDOWN: Record<string, number> = {
  blink: 12, surge: 18, dash: 8, cloak: 25, barrier: 20, pulse: 22,
};
const ABILITY_MAX_CHARGES: Record<string, number> = {
  dash: 2,
  blink: 1, surge: 1, cloak: 1, barrier: 1, pulse: 1,
};
const ABILITY_DURATION: Record<string, number> = {
  surge: 4, cloak: 5, blink: 0, dash: 0, barrier: 0, pulse: 0,
};
const CLASS_TO_ABILITY: Record<string, string> = {
  phantom: 'blink', rush: 'surge', vanguard: 'dash',
  ghost: 'cloak', engineer: 'barrier', hunter: 'pulse',
};

// Per-class max HP — MUST mirror the client's ClassPassive.bonusMaxHp
// (classes/types.ts). The server is authoritative on death, so without this
// the Vanguard's +15 HP passive silently does nothing in MP. Base is 100.
const CLASS_MAX_HP: Record<string, number> = {
  phantom: 100, rush: 100, vanguard: 115,
  ghost: 100, engineer: 100, hunter: 100,
};
const BASE_MAX_HP = 100;

// Per-class ability-cooldown multiplier — mirrors ClassPassive.cooldownMultiplier
// (classes/types.ts). Engineer gets -15% cooldowns. Authoritative so the
// passive actually works online, not just on the client's HUD ring.
const CLASS_COOLDOWN_MULT: Record<string, number> = {
  phantom: 1, rush: 1, vanguard: 1,
  ghost: 1, engineer: 0.85, hunter: 1,
};

const POS_HISTORY_MS = 1000;   // keep 1s of history for lag-comp rewinds

export class Room {
  private io: Server;
  private players = new Map<string, ServerPlayer>();
  readonly mapId: string;
  private staticSolids: readonly SolidAABB[];
  private spawns: ReadonlyArray<Vec3>;
  /** Networked temporary solids (Engineer Barriers). */
  private tempSolids = new Map<number, TempSolid>();
  private nextSolidId = 1;
  private tick = 0;
  private tickInterval: NodeJS.Timeout | null = null;
  /** True once a player has hit MATCH_KILL_GOAL. Blocks re-triggering match
   *  end and freezes scoring until a rematch resets it. */
  private matchOver = false;

  /** Active collision set = static + non-expired temp. Rebuilt lazily. */
  private get solids(): SolidAABB[] {
    const out: SolidAABB[] = [...this.staticSolids];
    for (const t of this.tempSolids.values()) out.push(t.aabb as SolidAABB);
    return out;
  }

  constructor(io: Server, mapId: string) {
    this.io = io;
    this.mapId = COLLISION_BY_MAP[mapId] ? mapId : 'sandstone';
    this.staticSolids = COLLISION_BY_MAP[this.mapId];
    this.spawns = SPAWNS_BY_MAP[this.mapId] ?? SPAWNS_BY_MAP['sandstone'];
  }

  start() {
    this.tickInterval = setInterval(() => this.tickOnce(), TICK_MS);
    console.log(`[room] started, ticking at ${TICK_HZ}Hz`);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
  }

  /** Called from io.on('connection'). Returns the ServerPlayer or null if rejected. */
  onConnection(socket: Socket): ServerPlayer | null {
    if (this.players.size >= MAX_PLAYERS) {
      socket.emit(EV.Err, { code: 'room_full', message: 'Room is full' });
      socket.disconnect();
      return null;
    }

    const spawn = this.spawns[this.players.size % this.spawns.length];
    const controller = new ServerController(() => this.solids, [...spawn] as [number, number, number]);
    const classId = 'vanguard';
    const abilityId = CLASS_TO_ABILITY[classId];
    const p: ServerPlayer = {
      socket,
      id: socket.id,
      classId,
      weaponId: 'ar',
      skinId: `${classId}-default`,
      controller,
      hp: 100,
      maxHp: 100,
      alive: true,
      cloaked: false,
      kills: 0,
      deaths: 0,
      inputQueue: [],
      ackSeq: 0,
      posHistory: [],
      invulnUntil: Date.now() + 2000,
      ability: {
        cooldownUntil: 0,
        charges: ABILITY_MAX_CHARGES[abilityId] ?? 1,
        maxCharges: ABILITY_MAX_CHARGES[abilityId] ?? 1,
        activeUntil: 0,
        surgeMultiplier: 1,
        cloakActive: false,
      },
    };
    this.players.set(socket.id, p);

    // Send welcome to the joiner.
    const welcome: ServerWelcome = {
      protocolVersion: PROTOCOL_VERSION,
      yourId: socket.id,
      mapId: this.mapId,
      serverTick: this.tick,
      tickHz: TICK_HZ,
      players: Array.from(this.players.values()).map((pp) => this.toSnapshot(pp)),
    };
    socket.emit(EV.Welcome, welcome);

    // Tell everyone else about the new player.
    const joined: ServerPlayerJoined = { player: this.toSnapshot(p) };
    socket.broadcast.emit(EV.Join, joined);

    // Wire socket message handlers.
    socket.on(EV.Input, (input: ClientInput) => {
      const pp = this.players.get(socket.id);
      if (!pp) return;
      pp.inputQueue.push(input);
      // Sanity cap so a malicious client can't DOS us via input flood.
      if (pp.inputQueue.length > 60) pp.inputQueue.splice(0, pp.inputQueue.length - 60);
    });

    socket.on(EV.Fire, (req: ClientFireRequest) => this.onFire(socket.id, req));
    socket.on(EV.Ability, (req: ClientAbilityRequest) => this.onAbility(socket.id, req));
    socket.on(EV.Hello, (req: ClientHello) => this.onHello(socket.id, req));
    socket.on(EV.Rematch, () => this.resetMatch());

    socket.on('disconnect', () => {
      console.log(`[room] disconnect ${socket.id}`);
      this.players.delete(socket.id);
      const left: ServerPlayerLeft = { id: socket.id };
      this.io.emit(EV.Left, left);
    });

    console.log(`[room] join ${socket.id} (${this.players.size}/${MAX_PLAYERS})`);
    return p;
  }

  // ── Tick loop ─────────────────────────────────────────────────────────────

  private tickOnce() {
    const dt = 1 / TICK_HZ;
    this.tick++;
    const now = Date.now();

    // Tick ability state: expire durations, regen charges, expire temp solids.
    this.tickAbilities();

    // Apply each player's queued inputs.
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.inputQueue.length === 0) {
        // No input this tick — advance with the last-known intent (zero, since
        // we don't track sticky state across ticks for the MVP). This means a
        // briefly-disconnected client comes to a smooth stop instead of
        // drifting at their last velocity forever.
        p.controller.step(dt, { fwd: 0, str: 0, jump: false, crouch: false, yaw: p.controller.yaw, pitch: p.controller.pitch });
      } else {
        for (const input of p.inputQueue) {
          const pInput: PlayerInput = {
            fwd: input.fwd, str: input.str,
            jump: input.jump, crouch: input.crouch,
            yaw: input.yaw, pitch: input.pitch,
          };
          p.controller.step(dt / p.inputQueue.length, pInput);
          p.ackSeq = Math.max(p.ackSeq, input.seq);
        }
        p.inputQueue.length = 0;
      }

      // Record position history for lag-comp.
      p.posHistory.push({ t: now, pos: [...p.controller.position] as Vec3 });
      // Prune older than POS_HISTORY_MS.
      const cutoff = now - POS_HISTORY_MS;
      while (p.posHistory.length > 0 && p.posHistory[0].t < cutoff) p.posHistory.shift();
    }

    // Broadcast snapshots. Each player gets their own ackSeq.
    const allPlayers = Array.from(this.players.values()).map((p) => this.toSnapshot(p));
    for (const p of this.players.values()) {
      const snap: Snapshot = {
        tick: this.tick,
        t: now,
        ackSeq: p.ackSeq,
        players: allPlayers,
      };
      p.socket.emit(EV.Snapshot, snap);
    }
  }

  private toSnapshot(p: ServerPlayer): PlayerSnapshot {
    return {
      id: p.id,
      pos: [...p.controller.position] as Vec3,
      vel: [...p.controller.velocity] as Vec3,
      yaw: p.controller.yaw,
      pitch: p.controller.pitch,
      hp: p.hp,
      classId: p.classId,
      weaponId: p.weaponId,
      skinId: p.skinId,
      cloaked: p.cloaked,
      kills: p.kills,
    };
  }

  // ── Fire / hit detection ──────────────────────────────────────────────────

  /**
   * Lag-compensated hitscan.
   *
   * The shooter's client saw remote players at where they were ~render-delay
   * ago (we use 100ms interpolation). To make their shot fair, we rewind
   * every other player's position to where THEY were ~100ms ago, then run
   * the raycast against that rewound state.
   *
   * For the MVP we use a fixed 100ms rewind. Tighter implementations measure
   * each shooter's actual one-way latency + their interpolation buffer depth.
   */
  private onFire(shooterId: string, req: ClientFireRequest) {
    const shooter = this.players.get(shooterId);
    if (!shooter || !shooter.alive) return;

    // Resolve the weapon the shooter is ALLOWED to fire: their chosen primary,
    // or the pistol (always-available secondary). Anything else (a client
    // claiming a stronger gun than it's holding) falls back to the primary so
    // damage can't be inflated. Then look up the authoritative stat block.
    const reqId = typeof req.weaponId === 'string' ? req.weaponId : shooter.weaponId;
    const allowed = (reqId === 'pistol' || reqId === shooter.weaponId) && !!WEAPON_STATS[reqId];
    const weaponId = allowed ? reqId : shooter.weaponId;
    const stats = WEAPON_STATS[weaponId] ?? WEAPON_STATS['ar'];

    const REWIND_MS = 100;
    const rewindT = Date.now() - REWIND_MS;
    const eyeOrigin: Vec3 = [
      shooter.controller.position[0],
      shooter.controller.position[1] + 1.5,
      shooter.controller.position[2],
    ];
    const aimDir = normalize(req.aim);
    if (aimDir === null) return;

    const MAX_RANGE = stats.maxRange;
    const pellets = Math.max(1, stats.pellets);

    // Pre-compute each candidate target's rewound AABBs once — shared across
    // every pellet of this trigger pull (cheaper for the shotgun's 9 rays).
    const targets: Array<{ p: ServerPlayer; body: SolidAABB; head: SolidAABB }> = [];
    for (const p of this.players.values()) {
      if (p.id === shooterId || !p.alive) continue;
      const rp = rewindPos(p, rewindT);
      if (!rp) continue;
      targets.push({
        p,
        // Body AABB: HALF_X 0.35, height 1.55 to head base; head 0.28 cube above.
        body: [rp[0] - 0.35, rp[1],        rp[2] - 0.35, rp[0] + 0.35, rp[1] + 1.55, rp[2] + 0.35],
        head: [rp[0] - 0.14, rp[1] + 1.55, rp[2] - 0.14, rp[0] + 0.14, rp[1] + 1.83, rp[2] + 0.14],
      });
    }

    // Seeded PRNG for this trigger pull's spread samples — reproducible per
    // shooter+tick (so smoke tests are deterministic) but varied across shots.
    let seed = (Math.imul(this.tick, 2654435761) + hashStr(shooterId)) >>> 0;
    const rng = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const hits: Array<{ point: Vec3; targetId: string | null; isHeadshot: boolean }> = [];
    // Aggregate damage per target across pellets (shotgun stacks naturally).
    const dmgByTarget = new Map<string, { dmg: number; head: boolean; point: Vec3 }>();

    for (let pel = 0; pel < pellets; pel++) {
      const dir = (pellets > 1 || stats.baseSpread > 0)
        ? perturb(aimDir, stats.baseSpread, rng)
        : aimDir;

      let bestT = MAX_RANGE;
      let bestTarget: ServerPlayer | null = null;
      let bestHead = false;
      let bestPoint: Vec3 = eyeOrigin;

      for (const b of this.solids) {
        const t = rayBox(eyeOrigin, dir, b, MAX_RANGE);
        if (t < bestT) {
          bestT = t; bestTarget = null; bestHead = false;
          bestPoint = [eyeOrigin[0] + dir[0] * t, eyeOrigin[1] + dir[1] * t, eyeOrigin[2] + dir[2] * t];
        }
      }
      for (const tg of targets) {
        const tHead = rayBox(eyeOrigin, dir, tg.head, MAX_RANGE);
        if (tHead < bestT) {
          bestT = tHead; bestTarget = tg.p; bestHead = true;
          bestPoint = [eyeOrigin[0] + dir[0] * tHead, eyeOrigin[1] + dir[1] * tHead, eyeOrigin[2] + dir[2] * tHead];
        }
        const tBody = rayBox(eyeOrigin, dir, tg.body, MAX_RANGE);
        if (tBody < bestT) {
          bestT = tBody; bestTarget = tg.p; bestHead = false;
          bestPoint = [eyeOrigin[0] + dir[0] * tBody, eyeOrigin[1] + dir[1] * tBody, eyeOrigin[2] + dir[2] * tBody];
        }
      }

      if (bestTarget) {
        hits.push({ point: bestPoint, targetId: bestTarget.id, isHeadshot: bestHead });
        const dmg = computeWeaponDamage(stats, bestT, bestHead);
        const cur = dmgByTarget.get(bestTarget.id);
        if (cur) { cur.dmg += dmg; cur.head = cur.head || bestHead; cur.point = bestPoint; }
        else dmgByTarget.set(bestTarget.id, { dmg, head: bestHead, point: bestPoint });
      } else if (bestT < MAX_RANGE) {
        hits.push({ point: bestPoint, targetId: null, isHeadshot: false });
      }
    }

    // Broadcast the shot for VFX (every client gets it).
    const shotEvent: ServerShotEvent = {
      shooterId, weaponId, origin: eyeOrigin, dir: aimDir, hits,
    };
    this.io.emit(EV.Shot, shotEvent);

    // Apply the aggregated damage to each hit player.
    const now = Date.now();
    for (const [targetId, agg] of dmgByTarget) {
      const target = this.players.get(targetId);
      if (!target || !target.alive) continue;
      if (now < target.invulnUntil) continue;     // spawn protection

      target.hp = Math.max(0, target.hp - agg.dmg);
      const dmgEvent: ServerDamageEvent = {
        attackerId: shooterId, targetId, amount: agg.dmg,
        isHeadshot: agg.head, hitPoint: agg.point, weaponId,
      };
      this.io.emit(EV.Damage, dmgEvent);

      if (target.hp <= 0) {
        target.alive = false;
        shooter.kills++;
        target.deaths++;
        const killEvent: ServerKillEvent = {
          attackerId: shooterId, targetId, weaponId, isHeadshot: agg.head,
        };
        this.io.emit(EV.Kill, killEvent);

        // Authoritative match end — fires exactly once when a server-side kill
        // count hits the goal. Clients never decide this themselves.
        if (!this.matchOver && shooter.kills >= MATCH_KILL_GOAL) {
          this.endMatch(shooter.id);
        }
        // Respawn after 1.8s unless the match just ended.
        if (!this.matchOver) {
          const dyingTarget = target;
          setTimeout(() => this.respawn(dyingTarget.id), 1800);
        }
      }
    }
  }

  private respawn(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    const spawn = this.spawns[Math.floor(Math.random() * this.spawns.length)];
    p.controller.position[0] = spawn[0];
    p.controller.position[1] = spawn[1];
    p.controller.position[2] = spawn[2];
    p.controller.velocity[0] = 0;
    p.controller.velocity[1] = 0;
    p.controller.velocity[2] = 0;
    p.hp = p.maxHp;
    p.alive = true;
    p.invulnUntil = Date.now() + 2000;
    // Reset ability state to a fresh ability of the same id.
    const abilityId = CLASS_TO_ABILITY[p.classId] ?? 'dash';
    p.ability.cooldownUntil = 0;
    p.ability.charges = ABILITY_MAX_CHARGES[abilityId] ?? 1;
    p.ability.maxCharges = ABILITY_MAX_CHARGES[abilityId] ?? 1;
    p.ability.activeUntil = 0;
    p.ability.surgeMultiplier = 1;
    p.ability.cloakActive = false;
    p.cloaked = false;
    p.controller.speedMultiplier = 1;
  }

  // ── Match lifecycle ───────────────────────────────────────────────────────

  /**
   * Declare the match over and broadcast the authoritative result + standings
   * to every client. Idempotent via the `matchOver` guard at the call site.
   */
  private endMatch(winnerId: string) {
    this.matchOver = true;
    const standings = Array.from(this.players.values())
      .map((p) => ({ id: p.id, kills: p.kills, deaths: p.deaths }))
      .sort((a, b) => b.kills - a.kills);
    const msg: ServerMatchOver = { winnerId, standings };
    this.io.emit(EV.MatchOver, msg);
    console.log(`[room] match over — winner ${winnerId} (${standings[0]?.kills ?? 0} kills)`);
  }

  /**
   * Start a fresh match: zero every player's score, clear the match-over flag,
   * respawn everyone, and tell all clients to dismiss their post-match overlay.
   * Triggered by any client's RequestRematch; a no-op if the match isn't over
   * (so a stray click mid-match can't wipe scores).
   */
  private resetMatch() {
    if (!this.matchOver) return;
    this.matchOver = false;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      this.respawn(p.id);
    }
    const msg: ServerMatchReset = {};
    this.io.emit(EV.MatchReset, msg);
    console.log('[room] match reset — fresh game');
  }

  // ── Hello (class/weapon selection) ────────────────────────────────────────

  /**
   * Apply the client's class + weapon choice. Called once after Welcome and
   * again on any class-swap mid-session. Idempotent.
   *
   * Side effects:
   *   - Updates ServerPlayer.classId / weaponId so Snapshots reflect reality.
   *   - Resets the ability state (cooldown / charges) for the new ability
   *     and tears down any cloak that was active under the old class.
   *   - Removes any orphaned Cloak active state (server's cloaked flag).
   *
   * Without this, the server expects `dash` for everyone (Vanguard default)
   * and silently rejects every other class's ability triggers — which is the
   * bug players reported in Phase 7b.
   */
  private onHello(playerId: string, req: ClientHello) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (!VALID_CLASSES.has(req.classId)) return;
    if (!VALID_WEAPONS.has(req.primaryWeaponId)) return;

    const oldClassId = p.classId;
    const wasFullHp = p.hp >= p.maxHp;
    p.classId = req.classId;
    p.weaponId = req.primaryWeaponId;

    // Apply the class's max-HP passive (Vanguard +15). Authoritative — without
    // this the bonus HP only existed on the client and the server killed the
    // Vanguard at 100. If the player was at full health (e.g. fresh spawn /
    // first hello), top them up to the new max; otherwise clamp so switching
    // to a lower-HP class can't leave you over-healed.
    p.maxHp = CLASS_MAX_HP[req.classId] ?? BASE_MAX_HP;
    if (wasFullHp) p.hp = p.maxHp;
    else p.hp = Math.min(p.hp, p.maxHp);
    // Skin id is freeform — we accept whatever the client claims. Cosmetic only,
    // no gameplay effect, so trust-the-client is fine here.
    if (req.skinId && req.skinId.length < 64) p.skinId = req.skinId;
    else p.skinId = `${req.classId}-default`;

    // Reset ability state for the new class.
    const abilityId = CLASS_TO_ABILITY[req.classId];
    p.ability.cooldownUntil = 0;
    p.ability.charges = ABILITY_MAX_CHARGES[abilityId] ?? 1;
    p.ability.maxCharges = ABILITY_MAX_CHARGES[abilityId] ?? 1;
    p.ability.activeUntil = 0;

    // Tear down per-ability state that may be active under the previous class.
    if (p.ability.surgeMultiplier !== 1) {
      p.ability.surgeMultiplier = 1;
      p.controller.speedMultiplier = 1;
    }
    if (p.ability.cloakActive) {
      p.ability.cloakActive = false;
      p.cloaked = false;
      // Broadcast cloak-end so remote viewers fade us back to full opacity.
      const cast: ServerAbilityCast = { abilityId: 'cloak', casterId: p.id, active: false, duration: 0 };
      this.io.emit(EV.AbilityCast, cast);
    }

    if (oldClassId !== req.classId) {
      console.log(`[room] ${playerId} class: ${oldClassId} → ${req.classId}`);
    }
  }

  // ── Abilities ─────────────────────────────────────────────────────────────

  /**
   * Validate + apply an ability cast. Cooldowns are spec-aligned: 12/18/8/25/20/22s.
   * For multi-charge abilities (Dash), the cooldown timer regenerates one charge.
   *
   * On success: broadcasts ServerAbilityCast to all clients. Side effects
   * (server-side speed mul, cloak flag, temp solid) are applied here so the
   * server's authoritative simulation reflects them in subsequent snapshots.
   */
  private onAbility(playerId: string, req: ClientAbilityRequest) {
    const p = this.players.get(playerId);
    if (!p || !p.alive) return;
    const expectedAb = CLASS_TO_ABILITY[p.classId];
    if (expectedAb !== req.abilityId) return;     // mismatch — reject silently
    const now = Date.now();
    if (p.ability.charges <= 0) return;
    if (p.ability.activeUntil > now) return;       // duration ability mid-active
    if (p.ability.cooldownUntil > now && p.ability.charges < p.ability.maxCharges) return;

    p.ability.charges--;
    // Cooldown starts only if we're now below max. (Dash's 2nd charge regen
    // after using 1 of 2.) Scaled by the class cooldown passive (Engineer).
    if (p.ability.cooldownUntil <= now) {
      const cdMult = CLASS_COOLDOWN_MULT[p.classId] ?? 1;
      p.ability.cooldownUntil = now + ABILITY_BASE_COOLDOWN[req.abilityId] * cdMult * 1000;
    }
    const duration = ABILITY_DURATION[req.abilityId] ?? 0;
    if (duration > 0) p.ability.activeUntil = now + duration * 1000;

    switch (req.abilityId) {
      case 'blink': this.castBlink(p, req); break;
      case 'surge': this.castSurge(p); break;
      case 'dash':  this.castDash(p, req); break;
      case 'cloak': this.castCloak(p); break;
      case 'barrier': this.castBarrier(p, req); break;
      case 'pulse': this.castPulse(p); break;
    }
  }

  private castBlink(p: ServerPlayer, req: ClientAbilityRequest) {
    const MAX = 14, SKIN = 0.6, FEET_DROP = 1.65;
    const aim = req.aim ? [...req.aim] : [0, 0, -1];
    // Flat-aim direction (horizontal only) — matches client.
    const flat: [number, number, number] = [aim[0], 0, aim[2]];
    const m = Math.hypot(flat[0], flat[2]);
    if (m < 1e-4) { flat[0] = 0; flat[2] = -1; } else { flat[0] /= m; flat[2] /= m; }
    const eye: Vec3 = [p.controller.position[0], p.controller.position[1] + 1.5, p.controller.position[2]];
    // Cast horizontally from eye-height; find nearest world solid in range.
    let best = MAX;
    for (const b of this.solids) {
      const t = rayBoxLocal(eye, [flat[0], 0, flat[2]], b, MAX);
      if (t < best) best = t;
    }
    let dist = best < MAX ? Math.max(0, best - SKIN) : MAX;

    // Step back from the proposed target until landing is valid. Stops the
    // player from blinking through the south archway gap or any other place
    // where the ray misses but the destination is outside the play area.
    const STEP = 0.5;
    let validDist = -1;
    while (dist >= 0) {
      const fx = eye[0] + flat[0] * dist;
      const fz = eye[2] + flat[2] * dist;
      const fy = eye[1] - FEET_DROP;
      if (this.isBlinkLandingValid(fx, fy, fz)) {
        validDist = dist;
        break;
      }
      dist -= STEP;
    }
    if (validDist < 0) {
      // No valid landing — refund the cost so the player can re-aim.
      p.ability.charges = Math.min(p.ability.maxCharges, p.ability.charges + 1);
      p.ability.cooldownUntil = 0;
      return;
    }
    const to: Vec3 = [
      eye[0] + flat[0] * validDist,
      eye[1] - FEET_DROP,
      eye[2] + flat[2] * validDist,
    ];
    p.controller.position[0] = to[0];
    p.controller.position[1] = to[1];
    p.controller.position[2] = to[2];
    p.controller.velocity[0] = 0;
    p.controller.velocity[1] = 0;
    p.controller.velocity[2] = 0;
    // Post-blink invuln — 300ms.
    p.invulnUntil = Math.max(p.invulnUntil, Date.now() + 300);

    const cast: ServerAbilityCast = {
      abilityId: 'blink', casterId: p.id,
      from: eye, to: [to[0], to[1] + 1.2, to[2]],
    };
    this.io.emit(EV.AbilityCast, cast);
  }

  /**
   * Blink target validation: player AABB at the proposed feet position must
   * not overlap a solid, AND there must be ground beneath the feet (catches
   * "blink through the south arch into the void" — the perimeter floor ends
   * outside the playable area). Mirrors Blink.ts/isLandingValid.
   */
  private isBlinkLandingValid(x: number, feetY: number, z: number): boolean {
    const HX = 0.35, HY = 0.9, HZ = 0.35;
    // Body AABB overlap check.
    const pMinX = x - HX, pMinY = feetY, pMinZ = z - HZ;
    const pMaxX = x + HX, pMaxY = feetY + HY * 2, pMaxZ = z + HZ;
    for (const b of this.solids) {
      if (pMinX < b[3] && pMaxX > b[0] &&
          pMinY < b[4] && pMaxY > b[1] &&
          pMinZ < b[5] && pMaxZ > b[2]) {
        return false;
      }
    }
    // Foot-ground probe: small box just under the feet — must overlap *something*.
    const fHX = 0.30, fHY = 0.05, fHZ = 0.30;
    const fCY = feetY - 0.1;
    const fMinX = x - fHX, fMinY = fCY - fHY, fMinZ = z - fHZ;
    const fMaxX = x + fHX, fMaxY = fCY + fHY, fMaxZ = z + fHZ;
    for (const b of this.solids) {
      if (fMinX < b[3] && fMaxX > b[0] &&
          fMinY < b[4] && fMaxY > b[1] &&
          fMinZ < b[5] && fMaxZ > b[2]) {
        return true;
      }
    }
    return false;
  }

  private castSurge(p: ServerPlayer) {
    p.controller.speedMultiplier = 2.0;
    p.ability.surgeMultiplier = 2.0;
    const cast: ServerAbilityCast = { abilityId: 'surge', casterId: p.id, duration: 4 };
    this.io.emit(EV.AbilityCast, cast);
  }

  private castDash(p: ServerPlayer, req: ClientAbilityRequest) {
    const IMPULSE = 30;
    const aim = req.aim ? [...req.aim] : [0, 0, -1];
    const flat = [aim[0], 0, aim[2]];
    const m = Math.hypot(flat[0], flat[2]);
    if (m < 1e-4) { flat[0] = 0; flat[2] = -1; } else { flat[0] /= m; flat[2] /= m; }
    p.controller.velocity[0] += flat[0] * IMPULSE;
    p.controller.velocity[2] += flat[2] * IMPULSE;
    const from: Vec3 = [p.controller.position[0], p.controller.position[1] + 1.0, p.controller.position[2]];
    const to: Vec3 = [
      from[0] + flat[0] * IMPULSE * 0.15,
      from[1],
      from[2] + flat[2] * IMPULSE * 0.15,
    ];
    const cast: ServerAbilityCast = { abilityId: 'dash', casterId: p.id, from, to };
    this.io.emit(EV.AbilityCast, cast);
  }

  private castCloak(p: ServerPlayer) {
    p.cloaked = true;
    p.ability.cloakActive = true;
    const cast: ServerAbilityCast = { abilityId: 'cloak', casterId: p.id, active: true, duration: 5 };
    this.io.emit(EV.AbilityCast, cast);
  }

  private castBarrier(p: ServerPlayer, _req: ClientAbilityRequest) {
    const LIFETIME = 8;
    const OFFSET = 2.2;
    const W = 2.2, H = 2.0, D = 0.2;
    // Use the player's current yaw for forward direction.
    const yaw = p.controller.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const center: Vec3 = [
      p.controller.position[0] + fwdX * OFFSET,
      p.controller.position[1] + H / 2,
      p.controller.position[2] + fwdZ * OFFSET,
    ];
    // Axis-aligned AABB: we ignore the wall's rotation in collision for MVP —
    // the player perceives a wall in front of them, and the AABB is roughly
    // right. Yaw-aware AABB is a Phase 7c polish.
    // Choose the bigger horizontal dimension based on whether facing more N/S or E/W.
    const facingX = Math.abs(fwdX) > Math.abs(fwdZ);
    const sx = facingX ? D : W;
    const sz = facingX ? W : D;
    const size: Vec3 = [sx, H, sz];
    const id = this.nextSolidId++;
    const aabb: [number, number, number, number, number, number] = [
      center[0] - sx / 2, center[1] - H / 2, center[2] - sz / 2,
      center[0] + sx / 2, center[1] + H / 2, center[2] + sz / 2,
    ];
    const ts: TempSolid = { id, ownerId: p.id, aabb, center, size, expiresAt: Date.now() + LIFETIME * 1000 };
    this.tempSolids.set(id, ts);

    const addSolid: ServerAddSolid = {
      solidId: id, center, size, ownerId: p.id, expiresAt: ts.expiresAt,
    };
    this.io.emit(EV.AddSolid, addSolid);

    const cast: ServerAbilityCast = { abilityId: 'barrier', casterId: p.id, solidId: id, center, size };
    this.io.emit(EV.AbilityCast, cast);
  }

  private castPulse(p: ServerPlayer) {
    const origin: Vec3 = [p.controller.position[0], p.controller.position[1] + 1.5, p.controller.position[2]];
    const cast: ServerAbilityCast = { abilityId: 'pulse', casterId: p.id, origin };
    this.io.emit(EV.AbilityCast, cast);
  }

  /**
   * Per-tick ability bookkeeping: expire Surge/Cloak durations, regen Dash
   * charges, expire Barrier solids. Called from tickOnce.
   */
  private tickAbilities() {
    const now = Date.now();
    for (const p of this.players.values()) {
      // Duration abilities — expire active state.
      if (p.ability.activeUntil > 0 && now >= p.ability.activeUntil) {
        p.ability.activeUntil = 0;
        if (p.ability.surgeMultiplier !== 1) {
          p.ability.surgeMultiplier = 1;
          p.controller.speedMultiplier = 1;
        }
        if (p.ability.cloakActive) {
          p.ability.cloakActive = false;
          p.cloaked = false;
          // Broadcast end-of-cloak so remote clients fade back in.
          const cast: ServerAbilityCast = { abilityId: 'cloak', casterId: p.id, active: false, duration: 0 };
          this.io.emit(EV.AbilityCast, cast);
        }
      }
      // Charge regeneration — multi-charge abilities refill after cooldown.
      if (p.ability.charges < p.ability.maxCharges && now >= p.ability.cooldownUntil) {
        p.ability.charges = Math.min(p.ability.maxCharges, p.ability.charges + 1);
        if (p.ability.charges < p.ability.maxCharges) {
          // Start the next regen timer (class cooldown passive applies here too).
          const abilityId = CLASS_TO_ABILITY[p.classId];
          const cdMult = CLASS_COOLDOWN_MULT[p.classId] ?? 1;
          p.ability.cooldownUntil = now + ABILITY_BASE_COOLDOWN[abilityId] * cdMult * 1000;
        }
      }
    }

    // Expire temp solids.
    for (const [id, ts] of this.tempSolids.entries()) {
      if (now >= ts.expiresAt) {
        this.tempSolids.delete(id);
        const msg: ServerRemoveSolid = { solidId: id };
        this.io.emit(EV.RemoveSolid, msg);
      }
    }
  }
}

/** Local copy of slab ray-AABB test (mirrors Room's rayBox) — used in Blink. */
function rayBoxLocal(origin: Vec3, dir: Vec3, b: SolidAABB, maxT: number): number {
  const invX = 1 / (dir[0] || 1e-12);
  const invY = 1 / (dir[1] || 1e-12);
  const invZ = 1 / (dir[2] || 1e-12);
  const t1 = (b[0] - origin[0]) * invX;
  const t2 = (b[3] - origin[0]) * invX;
  const t3 = (b[1] - origin[1]) * invY;
  const t4 = (b[4] - origin[1]) * invY;
  const t5 = (b[2] - origin[2]) * invZ;
  const t6 = (b[5] - origin[2]) * invZ;
  const tEnter = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tExit  = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  if (tExit < 0 || tEnter > tExit || tEnter > maxT) return Infinity;
  return tEnter < 0 ? 0 : tEnter;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function normalize(v: Vec3): Vec3 | null {
  const m = Math.hypot(v[0], v[1], v[2]);
  if (m < 1e-9) return null;
  return [v[0] / m, v[1] / m, v[2] / m];
}

/** FNV-1a string hash → uint32. Seeds the per-shot spread PRNG. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Perturb a unit direction within a cone of radius `spread` (radians) — the
 * server-side mirror of the client's per-pellet spread sampler (Weapon.firePellet).
 * Random point in a disk perpendicular to `dir`, re-projected to a unit vector.
 */
function perturb(dir: Vec3, spread: number, rng: () => number): Vec3 {
  if (spread <= 0) return dir;
  const a = rng() * Math.PI * 2;
  const m = Math.sqrt(rng()) * spread;
  // Orthonormal basis around dir.
  const up: Vec3 = Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let rx = dir[1] * up[2] - dir[2] * up[1];
  let ry = dir[2] * up[0] - dir[0] * up[2];
  let rz = dir[0] * up[1] - dir[1] * up[0];
  const rmag = Math.hypot(rx, ry, rz) || 1;
  rx /= rmag; ry /= rmag; rz /= rmag;
  // upPerp = right × dir
  const ux = ry * dir[2] - rz * dir[1];
  const uy = rz * dir[0] - rx * dir[2];
  const uz = rx * dir[1] - ry * dir[0];
  const c = Math.cos(a) * m, s = Math.sin(a) * m;
  const nx = dir[0] + rx * c + ux * s;
  const ny = dir[1] + ry * c + uy * s;
  const nz = dir[2] + rz * c + uz * s;
  const nm = Math.hypot(nx, ny, nz) || 1;
  return [nx / nm, ny / nm, nz / nm];
}

/**
 * Authoritative damage for a single ray — mirrors the client's
 * Weapon.computeDamage (linear falloff between falloffStart/End to falloffMin,
 * then the headshot multiplier).
 */
function computeWeaponDamage(s: WeaponStats, distance: number, head: boolean): number {
  let mul = 1;
  if (distance > s.falloffStart) {
    const t = Math.min(1, (distance - s.falloffStart) / (s.falloffEnd - s.falloffStart));
    mul = 1 - t * (1 - s.falloffMin);
  }
  if (head) mul *= s.headMul;
  return s.baseDamage * mul;
}

/** Slab ray-AABB test. Returns t along dir to first hit, or +Infinity if miss. */
function rayBox(origin: Vec3, dir: Vec3, b: SolidAABB, maxT: number): number {
  const invX = 1 / (dir[0] || 1e-12);
  const invY = 1 / (dir[1] || 1e-12);
  const invZ = 1 / (dir[2] || 1e-12);
  const t1 = (b[0] - origin[0]) * invX;
  const t2 = (b[3] - origin[0]) * invX;
  const t3 = (b[1] - origin[1]) * invY;
  const t4 = (b[4] - origin[1]) * invY;
  const t5 = (b[2] - origin[2]) * invZ;
  const t6 = (b[5] - origin[2]) * invZ;
  const tEnter = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tExit  = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  if (tExit < 0 || tEnter > tExit || tEnter > maxT) return Infinity;
  return tEnter < 0 ? 0 : tEnter;
}

/** Find the position the player was at `t` ms (wall-clock), via linear interp. */
function rewindPos(p: { posHistory: Array<{ t: number; pos: Vec3 }> }, t: number): Vec3 | null {
  const h = p.posHistory;
  if (h.length === 0) return null;
  if (t >= h[h.length - 1].t) return h[h.length - 1].pos;
  if (t <= h[0].t) return h[0].pos;
  for (let i = 1; i < h.length; i++) {
    const b = h[i];
    if (b.t >= t) {
      const a = h[i - 1];
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 0;
      return [
        a.pos[0] + (b.pos[0] - a.pos[0]) * k,
        a.pos[1] + (b.pos[1] - a.pos[1]) * k,
        a.pos[2] + (b.pos[2] - a.pos[2]) * k,
      ];
    }
  }
  return h[h.length - 1].pos;
}
