/**
 * Ranks — a named rank ladder derived purely from the account's level.
 *
 * Level is `floor(xp / 1000)` (see Account). This module maps a level to a
 * rank "tier" with a display name, accent colour, and a glyph. The ladder is
 * the cosmetic identity that makes progression *feel* like something — the HUD
 * badge, the menu badge, and the level-up banner all read from here.
 *
 * Pure data + helpers. No DOM, no engine coupling — safe to import anywhere.
 */

export interface Rank {
  /** Display name, e.g. "Veteran". */
  name: string;
  /** Lowest level (inclusive) that maps to this rank. */
  minLevel: number;
  /** Accent colour (hex string) for badges + the level-up banner. */
  color: string;
  /** Short glyph rendered alongside the name. */
  glyph: string;
}

// Ordered low → high. rankForLevel picks the highest tier whose minLevel the
// player has reached. Tuned so a brand-new player ranks up quickly (early
// dopamine) and the top tiers stay aspirational (Mythic = level 50 = 50k XP).
export const RANKS: Rank[] = [
  { name: 'Recruit',  minLevel: 0,  color: '#9aa6b2', glyph: '✦' },
  { name: 'Soldier',  minLevel: 2,  color: '#7fd4a6', glyph: '✦' },
  { name: 'Veteran',  minLevel: 5,  color: '#4ac8e0', glyph: '✧' },
  { name: 'Elite',    minLevel: 9,  color: '#5a8cff', glyph: '★' },
  { name: 'Master',   minLevel: 14, color: '#b06aff', glyph: '★' },
  { name: 'Champion', minLevel: 20, color: '#ffb020', glyph: '✪' },
  { name: 'Legend',   minLevel: 30, color: '#ff5a7e', glyph: '❖' },
  { name: 'Mythic',   minLevel: 50, color: '#ff3b6b', glyph: '✺' },
];

/** The rank for a given level — the highest tier the level qualifies for. */
export function rankForLevel(level: number): Rank {
  let chosen = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) chosen = r;
    else break;
  }
  return chosen;
}

/**
 * Progress toward the NEXT rank, 0..1. Returns 1 at the top tier (Mythic), where
 * there's no next rank to climb toward. Used to draw a thin promotion bar.
 */
export function rankProgress(level: number): number {
  const idx = RANKS.findIndex((r) => r === rankForLevel(level));
  const next = RANKS[idx + 1];
  if (!next) return 1;
  const cur = RANKS[idx];
  const span = next.minLevel - cur.minLevel;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (level - cur.minLevel) / span));
}
