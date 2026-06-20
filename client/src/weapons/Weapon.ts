/**
 * Weapon — hitscan firearm with recoil pattern and spread.
 *
 * One generic class; concrete weapons (AR, SMG, Sniper, Shotgun, Pistol) are
 * config objects passed in. Designed to support both player and bot shooters.
 *
 * Firing math:
 *
 *   Each shot picks a direction by perturbing the shooter's aim:
 *     1. Recoil — deterministic offset that grows shot-by-shot, decays on stop.
 *        We model it as a 2D vector (pitch + yaw kick) the *viewmodel* will
 *        apply visually, and the Weapon also applies it to the *fire ray*
 *        — that way what you see is what you get.
 *     2. Spread — random cone within `currentSpread` radians. Spread grows
 *        while firing (hipfire bloom) and decays on stop.
 *
 *   Damage = baseDamage * (isHeadshot ? headMul : 1) * falloff(distance).
 *
 *   Falloff is a linear ramp between [falloffStart, falloffEnd] from 1 → minMul.
 *   Past falloffEnd, damage is clamped at minMul * base.
 */

import * as THREE from 'three';
import type { World, RayHit } from '../core/World';
import type { GameEventBus } from '../core/events';

export interface WeaponConfig {
  id: string;
  displayName: string;
  /** Rounds per second. */
  fireRate: number;
  /** Auto = held trigger keeps firing. Semi = one shot per click. */
  automatic: boolean;
  magSize: number;
  reloadTime: number;          // seconds
  reserveAmmo: number;         // for now, infinite if -1
  baseDamage: number;
  headshotMultiplier: number;
  maxRange: number;
  /** Damage falloff bookmarks, world units. */
  falloffStart: number;
  falloffEnd: number;
  /** Damage multiplier at and past falloffEnd. */
  falloffMinMultiplier: number;
  /** Idle/perfect spread in radians. */
  baseSpread: number;
  /** Max spread (full bloom) in radians. */
  maxSpread: number;
  /** Spread added per shot. */
  spreadPerShot: number;
  /** Spread decay per second when not firing. */
  spreadDecay: number;
  /** Vertical recoil kick per shot in radians (camera pitch up). */
  recoilPitch: number;
  /** Horizontal yaw kick per shot — sign alternates by shot index. */
  recoilYaw: number;
  /** Recoil decay (return-to-zero) per second. */
  recoilDecay: number;
  /** Number of pellets per trigger pull. 1 for normal guns, 8–12 for shotguns. */
  pellets?: number;
  /** If set, RMB toggles a scope that drops camera FOV to this value. */
  scopeFov?: number;
  /** Display class shown in HUD (PRIMARY / SECONDARY). Pistol = SECONDARY. */
  slot: 'primary' | 'secondary';
}

export const AR_CONFIG: WeaponConfig = {
  id: 'ar',
  displayName: 'Assault Rifle',
  fireRate: 9,                 // 9 RPS — Krunker AR territory
  automatic: true,
  magSize: 30,
  reloadTime: 1.8,
  reserveAmmo: -1,             // infinite reserve in Phase 2
  baseDamage: 24,              // 3-shot body kill at 100 HP, 2-shot with one head
  headshotMultiplier: 1.8,
  maxRange: 200,
  falloffStart: 25,
  falloffEnd: 70,
  falloffMinMultiplier: 0.6,
  baseSpread: 0.004,
  maxSpread: 0.06,
  spreadPerShot: 0.008,
  spreadDecay: 0.18,           // radians/sec
  recoilPitch: 0.014,
  recoilYaw: 0.006,
  recoilDecay: 0.6,
  slot: 'primary',
};

// SMG — high RPS, low per-shot damage, heavy bloom. Close-range melter.
export const SMG_CONFIG: WeaponConfig = {
  id: 'smg',
  displayName: 'SMG',
  fireRate: 14,
  automatic: true,
  magSize: 28,
  reloadTime: 1.6,
  reserveAmmo: -1,
  baseDamage: 14,
  headshotMultiplier: 1.6,
  maxRange: 120,
  falloffStart: 14,
  falloffEnd: 45,
  falloffMinMultiplier: 0.4,
  baseSpread: 0.010,
  maxSpread: 0.13,
  spreadPerShot: 0.018,
  spreadDecay: 0.32,
  recoilPitch: 0.011,
  recoilYaw: 0.009,
  recoilDecay: 0.9,
  slot: 'primary',
};

// Sniper — one-shot headshot, 2-shot body, slow ROF, scope.
// Headshot mul × baseDamage = 110 > 100 HP, so headshot is always lethal.
export const SNIPER_CONFIG: WeaponConfig = {
  id: 'sniper',
  displayName: 'Sniper',
  fireRate: 1.0,
  automatic: false,
  magSize: 5,
  reloadTime: 2.6,
  reserveAmmo: -1,
  baseDamage: 60,
  headshotMultiplier: 1.85,
  maxRange: 240,
  falloffStart: 200,
  falloffEnd: 240,
  falloffMinMultiplier: 0.85,
  baseSpread: 0.0,
  maxSpread: 0.0,
  spreadPerShot: 0.0,
  spreadDecay: 0.0,
  recoilPitch: 0.06,
  recoilYaw: 0.0,
  recoilDecay: 0.3,
  scopeFov: 30,
  slot: 'primary',
};

// Shotgun — 9 pellets, tight inner cone, high close damage, brutal falloff.
// 9 pellets × ~10 dmg = 90 close. Past 18m most pellets miss.
export const SHOTGUN_CONFIG: WeaponConfig = {
  id: 'shotgun',
  displayName: 'Shotgun',
  fireRate: 1.4,
  automatic: false,
  magSize: 6,
  reloadTime: 2.2,
  reserveAmmo: -1,
  baseDamage: 12,
  headshotMultiplier: 1.4,
  maxRange: 60,
  falloffStart: 6,
  falloffEnd: 22,
  falloffMinMultiplier: 0.3,
  baseSpread: 0.055,
  maxSpread: 0.055,
  spreadPerShot: 0.0,
  spreadDecay: 0.0,
  recoilPitch: 0.05,
  recoilYaw: 0.008,
  recoilDecay: 0.7,
  pellets: 9,
  slot: 'primary',
};

// Marksman — semi-auto precision rifle (DMR). Fills the gap between the AR's
// auto spray and the Sniper's scoped one-shot: hard-hitting per-click, pinpoint
// when paced, but punishing bloom if you spam. No scope — handles fast, rewards
// aim. 3-shot body, 2-shot with one head (40 + 80 = 120 > 100 HP).
export const MARKSMAN_CONFIG: WeaponConfig = {
  id: 'marksman',
  displayName: 'Marksman',
  fireRate: 4.5,
  automatic: false,
  magSize: 12,
  reloadTime: 2.0,
  reserveAmmo: -1,
  baseDamage: 40,
  headshotMultiplier: 2.0,
  maxRange: 220,
  falloffStart: 60,
  falloffEnd: 140,
  falloffMinMultiplier: 0.7,
  baseSpread: 0.0015,
  maxSpread: 0.03,
  spreadPerShot: 0.02,         // spamming blooms hard — pace your shots
  spreadDecay: 0.5,
  recoilPitch: 0.03,
  recoilYaw: 0.004,
  recoilDecay: 0.7,
  slot: 'primary',
};

// Pistol — semi-auto sidearm. Always equipped, decent damage, no reserve cap.
export const PISTOL_CONFIG: WeaponConfig = {
  id: 'pistol',
  displayName: 'Pistol',
  fireRate: 5.5,
  automatic: false,
  magSize: 12,
  reloadTime: 1.2,
  reserveAmmo: -1,
  baseDamage: 22,
  headshotMultiplier: 1.7,
  maxRange: 90,
  falloffStart: 18,
  falloffEnd: 55,
  falloffMinMultiplier: 0.55,
  baseSpread: 0.003,
  maxSpread: 0.04,
  spreadPerShot: 0.011,
  spreadDecay: 0.3,
  recoilPitch: 0.018,
  recoilYaw: 0.005,
  recoilDecay: 0.75,
  slot: 'secondary',
};

export const WEAPON_LIBRARY = {
  ar: AR_CONFIG,
  smg: SMG_CONFIG,
  sniper: SNIPER_CONFIG,
  shotgun: SHOTGUN_CONFIG,
  marksman: MARKSMAN_CONFIG,
  pistol: PISTOL_CONFIG,
} as const;
export type WeaponId = keyof typeof WEAPON_LIBRARY;

export interface FireResult {
  hit: RayHit | null;
  /** Camera pitch/yaw kick this shot — UI applies it to the camera. */
  recoilKick: { pitch: number; yaw: number };
}

export class Weapon {
  readonly config: WeaponConfig;
  private world: World;
  private bus: GameEventBus;
  private ownerId: string;
  /** TDM team for friendly-fire skipping. Undefined = FFA (hit everyone but
   *  self). Set by Game when entering Team Deathmatch. */
  ownerTeam: number | undefined = undefined;

  private ammoInMag: number;
  private cooldown = 0;             // time until next shot is allowed
  private reloadRemaining = 0;
  /** Scales reload time. Rush passive sets this to 0.7 (30% faster). */
  reloadMultiplier = 1.0;
  private currentSpread = 0;
  private recoilPitchAccum = 0;
  private recoilYawAccum = 0;
  private shotIndex = 0;

  // PRNG seeded per weapon instance so spread is reproducible-per-player but
  // distinct across shooters. (Future: seed from server tick for determinism.)
  private rngState: number;

  constructor(config: WeaponConfig, world: World, bus: GameEventBus, ownerId: string) {
    this.config = config;
    this.world = world;
    this.bus = bus;
    this.ownerId = ownerId;
    this.ammoInMag = config.magSize;
    this.currentSpread = config.baseSpread;
    this.rngState = (ownerId.length * 2654435761) >>> 0 || 1;
  }

  get ammo(): number { return this.ammoInMag; }
  /** Current bloomed spread in radians, for HUD crosshair visualization. */
  get spread(): number { return this.currentSpread; }
  get isReloading(): boolean { return this.reloadRemaining > 0; }
  get reloadProgress(): number {
    if (this.reloadRemaining <= 0) return 1;
    return 1 - this.reloadRemaining / (this.config.reloadTime * this.reloadMultiplier);
  }

  /** Mulberry32 — small deterministic PRNG, plenty random for spread. */
  private rand(): number {
    this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  startReload() {
    if (this.reloadRemaining > 0) return;
    if (this.ammoInMag >= this.config.magSize) return;
    this.reloadRemaining = this.config.reloadTime * this.reloadMultiplier;
  }

  update(dt: number) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadRemaining > 0) {
      this.reloadRemaining -= dt;
      if (this.reloadRemaining <= 0) {
        this.reloadRemaining = 0;
        this.ammoInMag = this.config.magSize;
      }
    }
    // Spread + recoil decay toward rest.
    this.currentSpread = Math.max(
      this.config.baseSpread,
      this.currentSpread - this.config.spreadDecay * dt,
    );
    const k = Math.exp(-this.config.recoilDecay * dt * 6); // exponential return
    this.recoilPitchAccum *= k;
    this.recoilYawAccum *= k;
  }

  /**
   * Try to fire. Returns the shot result (with first-pellet hit, if any) or
   * null if the trigger was pulled but the weapon couldn't shoot (cooldown /
   * reload / empty).
   *
   * `spreadMultiplier` lets the caller apply a stance / movement penalty on
   * top of the weapon's tuned spread. 1.0 = baseline (no change). The player
   * uses PlayerController.stanceAccuracyPenalty(); bots pass 1.0.
   *
   * Multi-pellet weapons (shotgun): N raycasts per trigger pull, each its own
   * spread sample. Damage stacks naturally on the same target because
   * `health.takeDamage` is called per pellet. Tracers also emit per pellet,
   * which is what makes a shotgun feel visceral.
   */
  tryFire(origin: THREE.Vector3, aim: THREE.Vector3, spreadMultiplier = 1.0): FireResult | null {
    if (this.cooldown > 0 || this.reloadRemaining > 0) return null;
    if (this.ammoInMag <= 0) {
      this.startReload();
      return null;
    }

    this.cooldown = 1 / this.config.fireRate;
    this.ammoInMag--;
    this.shotIndex++;

    // Recoil kick is per *trigger pull*, not per pellet, so apply once.
    const yawDir = (this.shotIndex % 2 === 0) ? 1 : -1;
    const kick = {
      pitch: this.config.recoilPitch,
      yaw: this.config.recoilYaw * yawDir,
    };
    this.recoilPitchAccum += kick.pitch;
    this.recoilYawAccum += kick.yaw;

    const pellets = this.config.pellets ?? 1;
    let firstHit: RayHit | null = null;
    for (let p = 0; p < pellets; p++) {
      const hit = this.firePellet(origin, aim, spreadMultiplier);
      if (p === 0) firstHit = hit;
    }

    // Spread bloom is per trigger pull (single bullet) but pellet weapons
    // already have a fat baseSpread so we leave it alone — the cone is the
    // gun's identity, not a fatigue effect.
    if (pellets === 1) {
      this.currentSpread = Math.min(this.config.maxSpread, this.currentSpread + this.config.spreadPerShot);
    }

    return { hit: firstHit, recoilKick: kick };
  }

  /**
   * Fire a single pellet/bullet. Samples spread, casts ray, emits shot+damage
   * events, returns the hit (or null) so callers can aggregate for tracers.
   *
   * The effective cone radius is `currentSpread × spreadMultiplier` — the
   * stance penalty stacks multiplicatively on top of recoil bloom.
   */
  private firePellet(origin: THREE.Vector3, aim: THREE.Vector3, spreadMultiplier: number): RayHit | null {
    const dir = aim.clone().normalize();
    const base = this.currentSpread || (this.config.pellets ? this.config.baseSpread : 0);
    const r = base * spreadMultiplier;
    if (r > 0) {
      // Random point in a disk perpendicular to dir, projected onto unit sphere.
      const a = this.rand() * Math.PI * 2;
      const m = Math.sqrt(this.rand()) * r;
      const up = Math.abs(dir.y) < 0.95 ? _UP : _RIGHT;
      const right = _SCRATCH_A.crossVectors(dir, up).normalize();
      const upPerp = _SCRATCH_B.crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * m);
      dir.addScaledVector(upPerp, Math.sin(a) * m);
      dir.normalize();
    }

    const hit = this.world.raycast(origin, dir, this.config.maxRange, this.ownerId, this.ownerTeam);

    this.bus.emit('shot', {
      shooterId: this.ownerId,
      weaponId: this.config.id,
      origin: origin.clone(),
      direction: dir.clone(),
      hit: hit
        ? { point: hit.point.clone(), targetId: hit.target?.id ?? null, isHeadshot: hit.isHeadshot }
        : null,
    });

    if (hit && hit.target) {
      const damage = this.computeDamage(hit.distance, hit.isHeadshot);
      const killed = hit.target.health.takeDamage(damage);
      this.bus.emit('damage', {
        attackerId: this.ownerId,
        targetId: hit.target.id,
        amount: damage,
        isHeadshot: hit.isHeadshot,
        hitPoint: hit.point.clone(),
        weaponId: this.config.id,
      });
      if (killed) {
        this.bus.emit('kill', {
          attackerId: this.ownerId,
          targetId: hit.target.id,
          weaponId: this.config.id,
          isHeadshot: hit.isHeadshot,
          hitPoint: hit.point.clone(),
        });
      }
    }

    return hit;
  }

  private computeDamage(distance: number, isHeadshot: boolean): number {
    const c = this.config;
    let mul = 1;
    if (distance > c.falloffStart) {
      const t = Math.min(1, (distance - c.falloffStart) / (c.falloffEnd - c.falloffStart));
      mul = 1 - t * (1 - c.falloffMinMultiplier);
    }
    if (isHeadshot) mul *= c.headshotMultiplier;
    return c.baseDamage * mul;
  }
}

// Module-scope scratch vectors so we don't allocate per shot.
const _UP = new THREE.Vector3(0, 1, 0);
const _RIGHT = new THREE.Vector3(1, 0, 0);
const _SCRATCH_A = new THREE.Vector3();
const _SCRATCH_B = new THREE.Vector3();
