/**
 * Achievements — persistent, tiered career medals.
 *
 * Each achievement tracks one career metric (lifetime stats or a persisted
 * best) across a few escalating tiers. Reaching a tier grants a one-time XP
 * reward + pops a toast. This is the long-term "always something to chase"
 * retention hook on top of the per-day daily challenges.
 *
 * Pure data — `Account` owns the granted-tier bookkeeping (migration-safe:
 * existing players are baselined to their already-met tier on first load, so
 * we never retro-dump XP or spam toasts for stats earned before the update).
 *
 * The metric reads the live Account (type-only import, no cycle at runtime).
 */

import type { Account } from './Account';

export interface AchievementTier {
  /** Metric value needed to reach this tier. */
  goal: number;
  /** One-time XP granted on reaching it. */
  reward: number;
}

export interface Achievement {
  id: string;
  /** Display name (the medal title). */
  name: string;
  /** Emoji glyph shown on the medal + toast. */
  glyph: string;
  /** Accent colour (hex string). */
  color: string;
  /** Short noun for what the metric counts (e.g. "kills"). */
  unit: string;
  /** Current metric value for this achievement, read from the account. */
  metric: (acc: Account) => number;
  /** Escalating thresholds, ascending. */
  tiers: AchievementTier[];
}

/** Roman-ish tier labels (I..V) for the medal's current rank. */
export const TIER_LABELS = ['I', 'II', 'III', 'IV', 'V'];

/**
 * The medal registry. Metrics read lifetime stats (career) or a mode's
 * persisted personal-best from localStorage (the modes own those keys).
 */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'kills', name: 'Eliminator', glyph: '🎯', color: '#ff5a5a', unit: 'kills',
    metric: (a) => a.stats.kills,
    tiers: [
      { goal: 50, reward: 200 }, { goal: 250, reward: 500 },
      { goal: 1000, reward: 1500 }, { goal: 5000, reward: 4000 },
    ],
  },
  {
    id: 'headshots', name: 'Headhunter', glyph: '💀', color: '#ffd24a', unit: 'headshots',
    metric: (a) => a.stats.headshots,
    tiers: [
      { goal: 25, reward: 250 }, { goal: 100, reward: 700 }, { goal: 500, reward: 2000 },
    ],
  },
  {
    id: 'wins', name: 'Champion', glyph: '🏆', color: '#ffcf33', unit: 'wins',
    metric: (a) => a.stats.wins,
    tiers: [
      { goal: 5, reward: 300 }, { goal: 25, reward: 800 }, { goal: 100, reward: 2500 },
    ],
  },
  {
    id: 'matches', name: 'Veteran', glyph: '🎖️', color: '#7ad7ff', unit: 'matches',
    metric: (a) => a.stats.matches,
    tiers: [
      { goal: 10, reward: 200 }, { goal: 50, reward: 600 }, { goal: 200, reward: 1800 },
    ],
  },
  {
    id: 'streak', name: 'Unstoppable', glyph: '🔥', color: '#ff8a3a', unit: 'streak',
    metric: (a) => a.stats.bestStreak,
    tiers: [
      { goal: 5, reward: 250 }, { goal: 10, reward: 700 }, { goal: 20, reward: 2000 },
    ],
  },
  {
    id: 'playtime', name: 'No Life', glyph: '⏱️', color: '#9b8cff', unit: 'hours',
    metric: (a) => Math.floor(a.stats.playSeconds / 3600),
    tiers: [
      { goal: 1, reward: 300 }, { goal: 5, reward: 900 }, { goal: 20, reward: 2500 },
    ],
  },
  {
    id: 'onslaught', name: 'Survivor', glyph: '☠️', color: '#a0ff9b', unit: 'wave',
    metric: () => Number(localStorage.getItem('ilc.onslaught.best')) || 0,
    tiers: [
      { goal: 5, reward: 300 }, { goal: 10, reward: 800 }, { goal: 20, reward: 2000 },
    ],
  },
  {
    id: 'duel', name: 'Duelist', glyph: '⚔️', color: '#ff9bd0', unit: 'streak',
    metric: () => Number(localStorage.getItem('ilc.duel.best')) || 0,
    tiers: [
      { goal: 3, reward: 300 }, { goal: 7, reward: 800 }, { goal: 15, reward: 2000 },
    ],
  },
];

/** Total tiers across all medals — used for the "N/total" completion readout. */
export const TOTAL_ACHIEVEMENT_TIERS = ACHIEVEMENTS.reduce((n, a) => n + a.tiers.length, 0);

/** A freshly-unlocked tier, passed to listeners so the UI can celebrate it. */
export interface AchievementUnlock {
  ach: Achievement;
  /** 0-based index of the tier that just unlocked. */
  tierIndex: number;
  reward: number;
}
