/**
 * Weapons — authoritative per-weapon damage for MP hitscan.
 *
 * Previously the server hardcoded AR damage (24) for EVERY weapon, so online a
 * sniper, SMG and shotgun all hit for the same number — weapon choice was
 * cosmetic in MP. This mirrors the client's `Weapon.computeDamage` so the
 * server (the source of truth) deals the right damage per weapon, with range
 * falloff + headshot multipliers.
 *
 * KEEP IN SYNC with `client/src/weapons/Weapon.ts` WEAPON_LIBRARY — the damage
 * fields below are copied from there. (Movement controllers are already
 * manually mirrored across client/server; this is the same deal for weapons.)
 *
 * Shotgun note: the server models a single authoritative ray, not 9 pellets.
 * We approximate the spread by scaling damage by an *effective pellet count*
 * that's high point-blank and decays to ~1 by the falloff end — close enough to
 * the client's 9-pellet feel without modeling each pellet server-side.
 */

interface ServerWeaponDamage {
  baseDamage: number;
  headshotMultiplier: number;
  maxRange: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMinMultiplier: number;
  /** Present only for the shotgun — triggers the pellet-cluster approximation. */
  pellets?: number;
}

/** Mirror of the client weapon damage stats. */
const TABLE: Record<string, ServerWeaponDamage> = {
  ar:      { baseDamage: 24, headshotMultiplier: 1.8,  maxRange: 200, falloffStart: 25,  falloffEnd: 70,  falloffMinMultiplier: 0.6 },
  smg:     { baseDamage: 14, headshotMultiplier: 1.6,  maxRange: 120, falloffStart: 14,  falloffEnd: 45,  falloffMinMultiplier: 0.4 },
  sniper:  { baseDamage: 60, headshotMultiplier: 1.85, maxRange: 240, falloffStart: 200, falloffEnd: 240, falloffMinMultiplier: 0.85 },
  shotgun: { baseDamage: 12, headshotMultiplier: 1.4,  maxRange: 60,  falloffStart: 6,   falloffEnd: 22,  falloffMinMultiplier: 0.3, pellets: 9 },
  pistol:  { baseDamage: 22, headshotMultiplier: 1.7,  maxRange: 90,  falloffStart: 18,  falloffEnd: 55,  falloffMinMultiplier: 0.55 },
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Authoritative damage for a confirmed hit at `distance` metres. Returns 0 when
 * the target is past the weapon's effective range (so the caller treats it as a
 * miss). Unknown weapon ids fall back to the AR profile.
 */
export function weaponDamage(weaponId: string, distance: number, isHeadshot: boolean): number {
  const c = TABLE[weaponId] ?? TABLE.ar;
  if (distance > c.maxRange) return 0;

  if (c.pellets) {
    // Shotgun: effective pellet count high up close, ~1 by the falloff end.
    const t = clamp01((distance - c.falloffStart) / (c.falloffEnd - c.falloffStart));
    const effectivePellets = c.pellets * 0.85 + (1 - c.pellets * 0.85) * t; // lerp(0.85N → 1)
    let dmg = c.baseDamage * Math.max(1, effectivePellets);
    if (isHeadshot) dmg *= c.headshotMultiplier;
    return dmg;
  }

  let mul = 1;
  if (distance > c.falloffStart) {
    const t = clamp01((distance - c.falloffStart) / (c.falloffEnd - c.falloffStart));
    mul = 1 - t * (1 - c.falloffMinMultiplier);
  }
  if (isHeadshot) mul *= c.headshotMultiplier;
  return c.baseDamage * mul;
}
