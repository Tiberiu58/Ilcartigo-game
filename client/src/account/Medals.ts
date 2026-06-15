/**
 * Medals — a lightweight achievement track derived entirely from data the
 * Account already persists (lifetime stats + per-mode bests). No new saved
 * state: each medal is a pure function of the account, so they unlock
 * retroactively and stay correct across migrations.
 *
 * Medals are a cheap, high-retention "collectathon" layer (Krunker, CoD, etc.
 * all lean on them) — visible long-term goals that give a reason to come back.
 * Rendered in the Profile tab; progress is shown for locked ones.
 */

import { TIMEATTACK_MODE_ID } from '../modes/TimeAttack';
import type { Account } from './Account';

export interface Medal {
  id: string;
  label: string;
  desc: string;
  /** Goal value; unlocked once `value(account) >= goal`. */
  goal: number;
  /** Current progress value pulled from the account. */
  value: (a: Account) => number;
  /** Whole-number display for the progress readout (e.g. time formatting). */
  format?: (n: number) => string;
}

/** The full medal catalog, ordered roughly easy → hard within each theme. */
export const MEDALS: Medal[] = [
  // Combat volume.
  { id: 'centurion',   label: 'Centurion',    desc: '100 lifetime kills',       goal: 100,  value: (a) => a.stats.kills },
  { id: 'executioner', label: 'Executioner',  desc: '1,000 lifetime kills',     goal: 1000, value: (a) => a.stats.kills },
  // Precision.
  { id: 'headhunter',  label: 'Headhunter',   desc: '100 headshots',            goal: 100,  value: (a) => a.stats.headshots },
  // Streaks.
  { id: 'untouchable', label: 'Untouchable',  desc: 'A 10-kill streak',         goal: 10,   value: (a) => a.stats.bestStreak },
  { id: 'rampage',     label: 'Rampage',      desc: 'A 20-kill streak',         goal: 20,   value: (a) => a.stats.bestStreak },
  // Matches.
  { id: 'veteran',     label: 'Veteran',      desc: 'Finish 25 matches',        goal: 25,   value: (a) => a.stats.matches },
  { id: 'champion',    label: 'Champion',     desc: 'Win 10 matches',           goal: 10,   value: (a) => a.stats.wins },
  // Time Attack mastery.
  { id: 'sharpshot',   label: 'Sharpshooter', desc: 'Time Attack: 1,000 pts',   goal: 1000, value: (a) => a.bestScore(TIMEATTACK_MODE_ID) },
  { id: 'timelord',    label: 'Time Lord',    desc: 'Time Attack: 2,500 pts',   goal: 2500, value: (a) => a.bestScore(TIMEATTACK_MODE_ID) },
  // Dedication.
  { id: 'dedicated',   label: 'Dedicated',    desc: 'Play for 1 hour',          goal: 3600, value: (a) => a.stats.playSeconds, format: formatHours },
  { id: 'nolife',      label: 'No Life',      desc: 'Play for 5 hours',         goal: 18000, value: (a) => a.stats.playSeconds, format: formatHours },
];

function formatHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Count of unlocked medals for a given account. */
export function medalsUnlocked(a: Account): number {
  return MEDALS.reduce((n, m) => n + (m.value(a) >= m.goal ? 1 : 0), 0);
}
