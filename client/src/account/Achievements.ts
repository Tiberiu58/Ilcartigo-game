/**
 * Achievements — a persistent career-medal system.
 *
 * A long-horizon "rewards" loop layered on top of the existing lifetime stats:
 * each achievement is a milestone (X kills, X headshots, a streak, mastering a
 * weapon, surviving N waves…) that, when reached, unlocks a permanent medal +
 * grants bonus XP and pops a flashy toast. Players chase them across many
 * sessions — exactly the "constant desire to improve" hook, and every
 * achievement panel visit is on the ad-bearing menu.
 *
 * Pure-client, migration-safe (the Account stores only the unlocked-id set and
 * the reward grant). The definitions + evaluation live here so adding medals is
 * data-only. No protocol change.
 */

import type { Account } from './Account';

/** Visual rarity tier — drives the toast/medal colour. */
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'elite';

export interface AchievementDef {
  id: string;
  name: string;
  /** Short flavour describing what earns it. */
  desc: string;
  /** Emoji medal icon. */
  icon: string;
  tier: AchievementTier;
  /** Bonus XP granted on unlock. */
  reward: number;
  /** Target value of the metric. */
  goal: number;
  /** Current progress toward the goal, read from the account / local bests. */
  metric: (a: Account) => number;
  /** Optional medal-exclusive cosmetic this unlocks (prestige flair you can
   *  ONLY earn, never buy). The cosmetic carries a matching `medal: id`. */
  grants?: { kind: 'tracer' | 'effect' | 'finish'; id: string };
}

/** Best-effort numeric read of a localStorage personal best (modes). */
function lsBest(key: string): number {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The medal catalogue. Ordered roughly by theme then escalating difficulty so
 * the Awards panel reads as a natural progression. Metrics read only public
 * Account accessors (+ mode bests in localStorage), so they never go stale.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Kills (the bread-and-butter grind) ──────────────────────────────────
  { id: 'kills-100',  name: 'First Blood Drawn', desc: 'Get 100 lifetime kills',   icon: '🩸', tier: 'bronze', reward: 150,  goal: 100,   metric: (a) => a.stats.kills },
  { id: 'kills-500',  name: 'Seasoned',          desc: 'Get 500 lifetime kills',   icon: '⚔️', tier: 'silver', reward: 400,  goal: 500,   metric: (a) => a.stats.kills },
  { id: 'kills-2500', name: 'Warmonger',         desc: 'Get 2,500 lifetime kills', icon: '💀', tier: 'gold',   reward: 1000, goal: 2500,  metric: (a) => a.stats.kills, grants: { kind: 'effect', id: 'conqueror' } },
  { id: 'kills-5000', name: 'Annihilator',       desc: 'Get 5,000 lifetime kills', icon: '☄️', tier: 'gold',   reward: 1800, goal: 5000,  metric: (a) => a.stats.kills },
  { id: 'kills-10000',name: 'Legend of the Arena', desc: 'Get 10,000 lifetime kills', icon: '👑', tier: 'elite', reward: 3000, goal: 10000, metric: (a) => a.stats.kills },

  // ── Headshots (precision) ────────────────────────────────────────────────
  { id: 'hs-50',   name: 'Marksman',     desc: 'Land 50 headshots',    icon: '🎯', tier: 'bronze', reward: 200,  goal: 50,   metric: (a) => a.stats.headshots },
  { id: 'hs-100',  name: 'Sharpshooter', desc: 'Land 100 headshots',   icon: '🏹', tier: 'bronze', reward: 300,  goal: 100,  metric: (a) => a.stats.headshots },
  { id: 'hs-250',  name: 'Deadeye',      desc: 'Land 250 headshots',   icon: '🦅', tier: 'silver', reward: 500,  goal: 250,  metric: (a) => a.stats.headshots, grants: { kind: 'tracer', id: 'tracer-headhunter' } },
  { id: 'hs-1000', name: 'Headhunter',   desc: 'Land 1,000 headshots', icon: '☠️', tier: 'gold',   reward: 1200, goal: 1000, metric: (a) => a.stats.headshots },

  // ── Streaks (clutch / momentum) ──────────────────────────────────────────
  { id: 'streak-5',  name: 'On a Roll',     desc: 'Reach a 5-kill streak',   icon: '🔥', tier: 'bronze', reward: 150, goal: 5,  metric: (a) => a.stats.bestStreak },
  { id: 'streak-10', name: 'Unstoppable',   desc: 'Reach a 10-kill streak',  icon: '⚡', tier: 'silver', reward: 400, goal: 10, metric: (a) => a.stats.bestStreak },
  { id: 'streak-20', name: 'Godlike',       desc: 'Reach a 20-kill streak',  icon: '🌟', tier: 'gold',   reward: 900, goal: 20, metric: (a) => a.stats.bestStreak },

  // ── Wins / matches (commitment) ──────────────────────────────────────────
  { id: 'wins-10',   name: 'Contender',    desc: 'Win 10 matches',     icon: '🏅', tier: 'bronze', reward: 250, goal: 10,  metric: (a) => a.stats.wins, grants: { kind: 'tracer', id: 'tracer-champion' } },
  { id: 'wins-25',   name: 'Decorated',    desc: 'Win 25 matches',     icon: '🎗️', tier: 'silver', reward: 450, goal: 25,  metric: (a) => a.stats.wins },
  { id: 'wins-50',   name: 'Champion',     desc: 'Win 50 matches',     icon: '🏆', tier: 'gold',   reward: 800, goal: 50,  metric: (a) => a.stats.wins },
  { id: 'matches-100', name: 'Veteran',    desc: 'Finish 100 matches', icon: '🎖️', tier: 'silver', reward: 500, goal: 100, metric: (a) => a.stats.matches },

  // ── Progression (level) ──────────────────────────────────────────────────
  { id: 'level-10',  name: 'Rising Star',  desc: 'Reach account level 10', icon: '✨', tier: 'bronze', reward: 200, goal: 10, metric: (a) => a.level },
  { id: 'level-25',  name: 'Elite Operator', desc: 'Reach account level 25', icon: '💎', tier: 'gold', reward: 1000, goal: 25, metric: (a) => a.level, grants: { kind: 'finish', id: 'finish-prestige' } },

  // ── Weapon mastery (variety) ─────────────────────────────────────────────
  { id: 'wm-ar-200',     name: 'Rifle Master',   desc: 'Get 200 kills with the AR',      icon: '🔫', tier: 'silver', reward: 400, goal: 200, metric: (a) => a.weaponKillsFor('ar') },
  { id: 'wm-sniper-150', name: 'One Shot One Kill', desc: 'Get 150 kills with the Sniper', icon: '🎯', tier: 'silver', reward: 400, goal: 150, metric: (a) => a.weaponKillsFor('sniper') },
  { id: 'wm-railgun-100',name: 'Line Em Up',     desc: 'Get 100 kills with the Railgun', icon: '⚡', tier: 'gold',   reward: 600, goal: 100, metric: (a) => a.weaponKillsFor('railgun') },
  { id: 'wm-breacher-100', name: 'Door Kicker',  desc: 'Get 100 kills with the Breacher', icon: '🚪', tier: 'silver', reward: 400, goal: 100, metric: (a) => a.weaponKillsFor('breacher') },
  { id: 'wm-knife-25',   name: 'Up Close',       desc: 'Get 25 melee kills',             icon: '🔪', tier: 'bronze', reward: 250, goal: 25,  metric: (a) => a.weaponKillsFor('knife') },
  { id: 'wm-grenade-25', name: 'Boom',           desc: 'Get 25 grenade kills',           icon: '💣', tier: 'bronze', reward: 250, goal: 25,  metric: (a) => a.weaponKillsFor('grenade') },

  // ── Mode bests (challenge modes) ─────────────────────────────────────────
  { id: 'onslaught-10', name: 'Wave Breaker', desc: 'Survive to Onslaught wave 10', icon: '🌊', tier: 'silver', reward: 500, goal: 10, metric: () => lsBest('ilc.onslaught.best') },
  { id: 'duel-5',       name: 'Duelist',      desc: 'Win 5 duels in one gauntlet',  icon: '🤺', tier: 'silver', reward: 500, goal: 5,  metric: () => lsBest('ilc.duel.best') },
  { id: 'duel-10',      name: 'Gladiator',    desc: 'Win 10 duels in one gauntlet', icon: '⚔️', tier: 'gold',   reward: 900, goal: 10, metric: () => lsBest('ilc.duel.best') },
  // Hardpoint best is a clear TIME (lower = better); any value > 0 means you've
  // secured at least one hill. Treat "a clear exists" as the milestone.
  { id: 'hardpoint-win', name: 'Hill Master', desc: 'Secure a Hardpoint', icon: '⛳', tier: 'silver', reward: 500, goal: 1, metric: () => (lsBest('ilc.hardpoint.best') > 0 ? 1 : 0) },

  // ── Dedication (playtime) ────────────────────────────────────────────────
  { id: 'time-1h', name: 'Just One More', desc: 'Play for 1 hour total',   icon: '⏱️', tier: 'bronze', reward: 150, goal: 3600,  metric: (a) => a.stats.playSeconds },
  { id: 'time-10h', name: 'No Life',      desc: 'Play for 10 hours total', icon: '🕹️', tier: 'gold',   reward: 1000, goal: 36000, metric: (a) => a.stats.playSeconds },
];

/** Total medals available (for the panel header). */
export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

/** Progress (0..1) toward an achievement for the given account. */
export function achievementProgress(a: Account, def: AchievementDef): number {
  return Math.max(0, Math.min(1, def.metric(a) / def.goal));
}

/**
 * AchievementTracker — watches the account and unlocks medals as their metric
 * crosses the goal. Decoupled from Account (Account stores only the generic
 * unlocked set + reward grant), so there's no import cycle.
 *
 * On unlock it grants the bonus XP (via Account.unlockAchievement) and invokes
 * `onUnlock` so the UI can pop a toast + play a sting. Re-entrancy guarded:
 * granting XP fires account.onChange again, but already-unlocked medals are
 * skipped, so the cascade terminates.
 */
export class AchievementTracker {
  private account: Account;
  private onUnlock: (def: AchievementDef) => void;
  private evaluating = false;

  constructor(account: Account, onUnlock: (def: AchievementDef) => void) {
    this.account = account;
    this.onUnlock = onUnlock;
    this.account.onChange(() => this.evaluate());
    // Catch up on anything already earned from a prior version (silent — no
    // toast spam on first boot after the feature lands).
    this.evaluate(true);
  }

  /** Check every not-yet-unlocked medal; unlock + announce the ones now earned. */
  evaluate(silent = false) {
    if (this.evaluating) return;
    this.evaluating = true;
    try {
      for (const def of ACHIEVEMENTS) {
        if (this.account.isAchievementUnlocked(def.id)) continue;
        if (def.metric(this.account) >= def.goal) {
          const newly = this.account.unlockAchievement(def.id, def.reward);
          // Grant any medal-exclusive cosmetic (silent or not — it persists).
          if (def.grants) this.account.grantCosmetic(def.grants.kind, def.grants.id);
          if (newly && !silent) this.onUnlock(def);
        }
      }
    } finally {
      this.evaluating = false;
    }
  }
}
