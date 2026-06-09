/**
 * WeaponStats — server-authoritative weapon damage table.
 *
 * Mirrors the gameplay-relevant fields of each WeaponConfig in
 * /client/src/weapons/Weapon.ts. The server only needs the numbers that affect
 * hit registration + damage (not recoil/spread-bloom/reload visuals), so this
 * is a trimmed copy. KEEP IN SYNC with the client weapon library.
 *
 * Before Phase 13A the server hard-coded AR damage (24, 1.8× head) for every
 * weapon and cast a single ray — the Sniper hit for 24 instead of 60, the
 * Shotgun fired one pellet instead of nine. This table fixes that.
 */

export interface ServerWeaponStat {
  baseDamage: number;
  headshotMultiplier: number;
  maxRange: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMinMultiplier: number;
  /** Pellets per trigger pull (Shotgun = 9). 1 for normal guns. */
  pellets: number;
  /** Cone radius in radians used for pellet spread (Shotgun). */
  baseSpread: number;
}

export const WEAPON_STATS: Record<string, ServerWeaponStat> = {
  ar:      { baseDamage: 24, headshotMultiplier: 1.8,  maxRange: 200, falloffStart: 25,  falloffEnd: 70,  falloffMinMultiplier: 0.6,  pellets: 1, baseSpread: 0.0 },
  smg:     { baseDamage: 14, headshotMultiplier: 1.6,  maxRange: 120, falloffStart: 14,  falloffEnd: 45,  falloffMinMultiplier: 0.4,  pellets: 1, baseSpread: 0.0 },
  sniper:  { baseDamage: 60, headshotMultiplier: 1.85, maxRange: 240, falloffStart: 200, falloffEnd: 240, falloffMinMultiplier: 0.85, pellets: 1, baseSpread: 0.0 },
  shotgun: { baseDamage: 12, headshotMultiplier: 1.4,  maxRange: 60,  falloffStart: 6,   falloffEnd: 22,  falloffMinMultiplier: 0.3,  pellets: 9, baseSpread: 0.055 },
  pistol:  { baseDamage: 22, headshotMultiplier: 1.7,  maxRange: 90,  falloffStart: 18,  falloffEnd: 55,  falloffMinMultiplier: 0.55, pellets: 1, baseSpread: 0.0 },
};

/** Largest maxRange in the table — used to size the hitscan search. */
export const MAX_WEAPON_RANGE = Math.max(...Object.values(WEAPON_STATS).map((w) => w.maxRange));

/** Resolve a weapon id to its stats, falling back to the AR if unknown. */
export function statFor(weaponId: string): ServerWeaponStat {
  return WEAPON_STATS[weaponId] ?? WEAPON_STATS.ar;
}

/**
 * Per-shot damage = base × falloff(distance) × (headshot ? headMul : 1).
 * Falloff is a linear ramp from 1 at falloffStart down to minMul at falloffEnd.
 * Mirrors Weapon.computeDamage on the client.
 */
export function computeWeaponDamage(stat: ServerWeaponStat, distance: number, isHeadshot: boolean): number {
  let mul = 1;
  if (distance > stat.falloffStart) {
    const t = Math.min(1, (distance - stat.falloffStart) / (stat.falloffEnd - stat.falloffStart));
    mul = 1 - t * (1 - stat.falloffMinMultiplier);
  }
  if (isHeadshot) mul *= stat.headshotMultiplier;
  return stat.baseDamage * mul;
}
