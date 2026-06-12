/**
 * Mastery — per-weapon kill-count progression tiers.
 *
 * A classic shooter retention grind: rack up kills with a weapon to climb its
 * mastery tiers (Bronze → Silver → Gold → Diamond), each tier-up paying a one-
 * off XP bonus. Pure data + helpers; the Account owns the persisted counts and
 * the ProfileUI renders them.
 */

export interface MasteryTier {
  /** Tier name shown in the UI. */
  name: string;
  /** Kills required to reach this tier. */
  at: number;
  /** Accent colour (hex string) for the badge. */
  color: string;
  /** One-off XP bonus granted when this tier is first reached. */
  bonus: number;
}

/** Ascending tiers. Index 0 = "unranked" baseline (no badge, no bonus). */
export const MASTERY_TIERS: MasteryTier[] = [
  { name: 'Unranked', at: 0,   color: '#5a6472', bonus: 0 },
  { name: 'Bronze',   at: 25,  color: '#c07a3a', bonus: 100 },
  { name: 'Silver',   at: 75,  color: '#c9d2dc', bonus: 200 },
  { name: 'Gold',     at: 200, color: '#f5d442', bonus: 400 },
  { name: 'Diamond',  at: 500, color: '#5fd0e6', bonus: 800 },
];

/** Index of the highest tier reached at `kills`. */
export function masteryTierIndex(kills: number): number {
  let idx = 0;
  for (let i = 1; i < MASTERY_TIERS.length; i++) {
    if (kills >= MASTERY_TIERS[i].at) idx = i; else break;
  }
  return idx;
}

export function masteryTier(kills: number): MasteryTier {
  return MASTERY_TIERS[masteryTierIndex(kills)];
}

/** Next tier above the current one, or null if maxed. */
export function nextMasteryTier(kills: number): MasteryTier | null {
  const idx = masteryTierIndex(kills);
  return idx + 1 < MASTERY_TIERS.length ? MASTERY_TIERS[idx + 1] : null;
}

/** Progress fraction (0..1) from the current tier's threshold to the next.
 *  Returns 1 when maxed. */
export function masteryProgress(kills: number): number {
  const idx = masteryTierIndex(kills);
  const cur = MASTERY_TIERS[idx];
  const next = MASTERY_TIERS[idx + 1];
  if (!next) return 1;
  return (kills - cur.at) / (next.at - cur.at);
}
