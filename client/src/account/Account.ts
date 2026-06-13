/**
 * Account — local progression state.
 *
 * Stores XP, derived level, unlocked cosmetics, equipped cosmetics. Persists
 * to localStorage under `ilc.account` as a single JSON blob. Per Phase 9 spec
 * (local-only for v1), there's no server backend — this is the source of truth.
 *
 * If we ever add a real account backend (Supabase/Firebase), this same shape
 * is what we'd sync. localStorage is intentionally the same model: load on
 * boot, save on mutation, both async-friendly.
 *
 * Level curve: 1000 XP per level. Simple and predictable.
 */

import { findSkin, findTracer, defaultSkinForClass, DEFAULT_KILL_EFFECT, DEFAULT_TRACER, type SkinId, type KillEffectId, type TracerId } from './Cosmetics';
import type { ClassId } from '../classes/types';

const STORAGE_KEY = 'ilc.account';
const XP_PER_LEVEL = 1000;

/** Lifetime career stats — purely cosmetic/bragging, persisted across sessions. */
export interface LifetimeStats {
  kills: number;
  deaths: number;
  headshots: number;
  /** Matches finished (MP match-end reached). */
  matches: number;
  /** Matches won (finished rank #1). */
  wins: number;
  /** Best single-life killstreak ever. */
  bestStreak: number;
  /** Total seconds spent in-game (combat + practice). */
  playSeconds: number;
}

function freshStats(): LifetimeStats {
  return { kills: 0, deaths: 0, headshots: 0, matches: 0, wins: 0, bestStreak: 0, playSeconds: 0 };
}

/** Per-mode personal records — a retention hook (chase your best). */
export interface ModeStat {
  /** Best kills in a single round/match of this mode. */
  bestKills: number;
  /** Rounds/matches won in this mode. */
  wins: number;
  /** Rounds/matches played to completion in this mode. */
  plays: number;
}

function freshModeStat(): ModeStat {
  return { bestKills: 0, wins: 0, plays: 0 };
}

/** Merge a (possibly partial) saved per-mode-stats map onto fresh defaults. */
function mergeModeStats(saved: unknown): Record<string, ModeStat> {
  const out: Record<string, ModeStat> = {};
  if (!saved || typeof saved !== 'object') return out;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const s = v as Partial<ModeStat>;
    out[k] = { bestKills: num(s.bestKills), wins: num(s.wins), plays: num(s.plays) };
  }
  return out;
}

/** Merge a (possibly partial / possibly undefined) saved stats object onto fresh defaults. */
function mergeStats(saved: Partial<LifetimeStats> | undefined, fresh: LifetimeStats): LifetimeStats {
  if (!saved || typeof saved !== 'object') return fresh;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    kills: num(saved.kills, fresh.kills),
    deaths: num(saved.deaths, fresh.deaths),
    headshots: num(saved.headshots, fresh.headshots),
    matches: num(saved.matches, fresh.matches),
    wins: num(saved.wins, fresh.wins),
    bestStreak: num(saved.bestStreak, fresh.bestStreak),
    playSeconds: num(saved.playSeconds, fresh.playSeconds),
  };
}

interface AccountData {
  xp: number;
  /** Set of unlocked cosmetic IDs (we store as array for JSON). */
  unlockedSkins: SkinId[];
  unlockedEffects: KillEffectId[];
  unlockedTracers: TracerId[];
  /** Per-class equipped skin. If a class isn't here, the default is used. */
  equippedSkin: Partial<Record<ClassId, SkinId>>;
  equippedKillEffect: KillEffectId;
  equippedTracer: TracerId;
  /** Lifetime career stats. */
  stats: LifetimeStats;
  /** Per-mode personal records (best kills / wins / plays), keyed by mode id. */
  modeStats: Record<string, ModeStat>;
  /** Player's chosen display name (shown on scoreboard). Empty = "You". */
  name: string;
  /** Today's daily challenges (regenerated when the date rolls over). */
  daily: DailyState;
}

/** A single daily challenge: a stat to grow by `goal` for `reward` XP. */
export interface DailyChallenge {
  id: string;
  label: string;
  /** Which lifetime stat this tracks. */
  stat: keyof LifetimeStats;
  goal: number;
  reward: number;
  /** Snapshot of the stat when the challenge was issued; progress = now - baseline. */
  baseline: number;
  claimed: boolean;
}

interface DailyState {
  /** YYYY-MM-DD the challenges were generated for. */
  date: string;
  challenges: DailyChallenge[];
}

/** Local date key (YYYY-MM-DD) for daily-challenge rollover. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Deterministic small PRNG seeded from a string (so a given day's challenges
 *  are stable across reloads within that day). */
function seededPick<T>(seed: string, arr: T[], count: number): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519); h >>>= 0;
    const idx = h % pool.length;
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** The pool of possible daily challenges. Three are picked per day. */
const CHALLENGE_POOL: Omit<DailyChallenge, 'baseline' | 'claimed'>[] = [
  { id: 'kills20',  label: 'Get 20 kills',        stat: 'kills',     goal: 20, reward: 150 },
  { id: 'kills40',  label: 'Get 40 kills',        stat: 'kills',     goal: 40, reward: 300 },
  { id: 'hs5',      label: 'Land 5 headshots',    stat: 'headshots', goal: 5,  reward: 200 },
  { id: 'hs10',     label: 'Land 10 headshots',   stat: 'headshots', goal: 10, reward: 350 },
  { id: 'win1',     label: 'Win a match',         stat: 'wins',      goal: 1,  reward: 250 },
  { id: 'match3',   label: 'Finish 3 matches',    stat: 'matches',   goal: 3,  reward: 200 },
];

/** Generate today's challenges with baselines captured from the current stats
 *  so progress counts only from now (issue time), not from career totals. */
function freshDaily(stats: LifetimeStats): DailyState {
  const date = todayKey();
  const picks = seededPick(date, CHALLENGE_POOL, 3);
  return {
    date,
    challenges: picks.map((c) => ({ ...c, baseline: stats[c.stat], claimed: false })),
  };
}

function freshData(): AccountData {
  return {
    xp: 0,
    unlockedSkins: [
      'phantom-default', 'rush-default', 'vanguard-default',
      'ghost-default', 'engineer-default', 'hunter-default',
    ],
    unlockedEffects: [DEFAULT_KILL_EFFECT],
    unlockedTracers: [DEFAULT_TRACER],
    equippedSkin: {},
    equippedKillEffect: DEFAULT_KILL_EFFECT,
    equippedTracer: DEFAULT_TRACER,
    stats: freshStats(),
    modeStats: {},
    name: '',
    daily: freshDaily(freshStats()),
  };
}

export class Account {
  private data: AccountData = freshData();
  /** Listeners notified on any mutation (XP gain, unlock, equip). */
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AccountData>;
      // Merge defensively — older saves might be missing newer fields.
      const fresh = freshData();
      this.data = {
        xp: typeof parsed.xp === 'number' ? parsed.xp : fresh.xp,
        unlockedSkins: Array.isArray(parsed.unlockedSkins) ? parsed.unlockedSkins : fresh.unlockedSkins,
        unlockedEffects: Array.isArray(parsed.unlockedEffects) ? parsed.unlockedEffects : fresh.unlockedEffects,
        // Always keep the default tracer unlocked even on an older save.
        unlockedTracers: Array.isArray(parsed.unlockedTracers)
          ? Array.from(new Set([DEFAULT_TRACER, ...parsed.unlockedTracers]))
          : fresh.unlockedTracers,
        equippedSkin: (parsed.equippedSkin && typeof parsed.equippedSkin === 'object')
          ? parsed.equippedSkin as Partial<Record<ClassId, SkinId>>
          : fresh.equippedSkin,
        equippedKillEffect: typeof parsed.equippedKillEffect === 'string'
          ? parsed.equippedKillEffect
          : fresh.equippedKillEffect,
        equippedTracer: typeof parsed.equippedTracer === 'string'
          ? parsed.equippedTracer
          : fresh.equippedTracer,
        // Merge stats field-by-field so a save from before a stat was added
        // still upgrades cleanly (missing fields default to 0).
        stats: mergeStats(parsed.stats, fresh.stats),
        modeStats: mergeModeStats(parsed.modeStats),
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 16) : fresh.name,
        daily: (parsed.daily && typeof parsed.daily === 'object' && Array.isArray((parsed.daily as DailyState).challenges))
          ? parsed.daily as DailyState
          : fresh.daily,
      };
      // Roll over to a new day's challenges if needed, and rebase baselines.
      this.refreshDaily();
    } catch (e) {
      console.warn('[account] load failed, resetting', e);
      this.data = freshData();
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[account] save failed', e);
    }
    for (const fn of this.listeners) fn();
  }

  /** Subscribe to mutations. Returns an unsubscribe fn. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── Read accessors ────────────────────────────────────────────────────────

  get xp(): number { return this.data.xp; }
  get level(): number { return Math.floor(this.data.xp / XP_PER_LEVEL); }
  /** XP into the current level. 0..XP_PER_LEVEL-1. */
  get xpIntoLevel(): number { return this.data.xp % XP_PER_LEVEL; }
  get xpPerLevel(): number { return XP_PER_LEVEL; }

  isSkinUnlocked(id: SkinId): boolean {
    return this.data.unlockedSkins.includes(id);
  }
  isEffectUnlocked(id: KillEffectId): boolean {
    return this.data.unlockedEffects.includes(id);
  }
  isTracerUnlocked(id: TracerId): boolean {
    return this.data.unlockedTracers.includes(id);
  }

  /** Equipped skin for the given class, falling back to default. */
  equippedSkinFor(classId: ClassId): SkinId {
    const eq = this.data.equippedSkin[classId];
    if (eq && this.isSkinUnlocked(eq) && findSkin(eq)) return eq;
    return defaultSkinForClass(classId);
  }

  equippedKillEffect(): KillEffectId {
    return this.data.equippedKillEffect;
  }

  /** Equipped tracer id, falling back to default if the saved one is invalid. */
  equippedTracer(): TracerId {
    const id = this.data.equippedTracer;
    if (this.isTracerUnlocked(id) && findTracer(id)) return id;
    return DEFAULT_TRACER;
  }

  /** Equipped tracer colour (hex number) — read by Game for local tracers. */
  equippedTracerColor(): number {
    return findTracer(this.equippedTracer())?.color ?? 0xfff0a0;
  }

  /** Lifetime career stats (read-only snapshot). */
  get stats(): Readonly<LifetimeStats> { return this.data.stats; }
  /** Lifetime kill/death ratio as a display string. */
  get lifetimeKD(): string {
    const { kills, deaths } = this.data.stats;
    return deaths === 0 ? kills.toFixed(1) : (kills / deaths).toFixed(2);
  }
  /** Player display name, or 'You' if unset. */
  get name(): string { return this.data.name || 'You'; }
  /** True if the player has set a custom name. */
  get hasName(): boolean { return this.data.name.length > 0; }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Add XP. Triggers persistence + listeners. Returns the new total. */
  awardXP(amount: number): number {
    if (amount <= 0) return this.data.xp;
    this.data.xp += amount;
    this.save();
    return this.data.xp;
  }

  /**
   * Attempt to unlock a cosmetic. If the player has enough XP, deducts cost
   * and adds to unlocked list. Returns true on success.
   */
  tryUnlockSkin(id: SkinId): boolean {
    if (this.isSkinUnlocked(id)) return true;
    const skin = findSkin(id);
    if (!skin) return false;
    if (this.data.xp < skin.cost) return false;
    this.data.xp -= skin.cost;
    this.data.unlockedSkins.push(id);
    this.save();
    return true;
  }

  tryUnlockEffect(id: KillEffectId, cost: number): boolean {
    if (this.isEffectUnlocked(id)) return true;
    if (this.data.xp < cost) return false;
    this.data.xp -= cost;
    this.data.unlockedEffects.push(id);
    this.save();
    return true;
  }

  /** Equip an unlocked skin for its class. No-op if not unlocked. */
  equipSkin(id: SkinId): boolean {
    const skin = findSkin(id);
    if (!skin) return false;
    if (!this.isSkinUnlocked(id)) return false;
    this.data.equippedSkin[skin.classId] = id;
    this.save();
    return true;
  }

  equipKillEffect(id: KillEffectId): boolean {
    if (!this.isEffectUnlocked(id)) return false;
    this.data.equippedKillEffect = id;
    this.save();
    return true;
  }

  tryUnlockTracer(id: TracerId, cost: number): boolean {
    if (this.isTracerUnlocked(id)) return true;
    if (this.data.xp < cost) return false;
    this.data.xp -= cost;
    this.data.unlockedTracers.push(id);
    this.save();
    return true;
  }

  equipTracer(id: TracerId): boolean {
    if (!this.isTracerUnlocked(id)) return false;
    this.data.equippedTracer = id;
    this.save();
    return true;
  }

  // ── Lifetime stat recording ───────────────────────────────────────────────

  /** Record a local-player kill (optionally a headshot). */
  recordKill(isHeadshot: boolean) {
    this.data.stats.kills++;
    if (isHeadshot) this.data.stats.headshots++;
    this.save();
  }

  /** Record a local-player death. */
  recordDeath() {
    this.data.stats.deaths++;
    this.save();
  }

  /** Update the best-streak high-water mark if `streak` beats it. */
  recordStreak(streak: number) {
    if (streak > this.data.stats.bestStreak) {
      this.data.stats.bestStreak = streak;
      this.save();
    }
  }

  /** Record a finished match (and whether it was won). */
  recordMatchEnd(won: boolean) {
    this.data.stats.matches++;
    if (won) this.data.stats.wins++;
    this.save();
  }

  /** Per-mode record snapshot (read-only), defaulting to zeros. */
  modeStat(mode: string): Readonly<ModeStat> {
    return this.data.modeStats[mode] ?? freshModeStat();
  }

  /**
   * Record a finished round/match result for a mode. Updates plays, wins, and
   * the best-kills high-water mark. Returns whether this round set a new
   * best-kills personal record (for the post-match celebration).
   */
  recordModeResult(mode: string, kills: number, won: boolean): { newBest: boolean } {
    const cur = this.data.modeStats[mode] ?? freshModeStat();
    cur.plays++;
    if (won) cur.wins++;
    const newBest = kills > cur.bestKills;
    if (newBest) cur.bestKills = kills;
    this.data.modeStats[mode] = cur;
    this.save();
    return { newBest: newBest && kills > 0 };
  }

  /** Accumulate played time. Called periodically with elapsed seconds; we
   *  persist coarsely (rounded) to avoid hammering localStorage every frame. */
  private playSecondsAccum = 0;
  addPlaytime(seconds: number) {
    this.playSecondsAccum += seconds;
    if (this.playSecondsAccum >= 5) {
      this.data.stats.playSeconds += Math.floor(this.playSecondsAccum);
      this.playSecondsAccum -= Math.floor(this.playSecondsAccum);
      this.save();
    }
  }

  /** Set the player's display name (trimmed, max 16 chars). */
  setName(name: string) {
    this.data.name = name.trim().slice(0, 16);
    this.save();
  }

  // ── Daily challenges ──────────────────────────────────────────────────────

  /** Regenerate today's challenges if the date rolled over. Baselines are
   *  captured at generation time (from current stats) so progress measures
   *  only today's gains. Called on load + lazily before any daily read. */
  private refreshDaily() {
    if (this.data.daily.date !== todayKey()) {
      this.data.daily = freshDaily(this.data.stats);
      this.save();
    }
  }

  /** Today's challenges with computed progress. Read-only view for the UI. */
  get dailyChallenges(): Array<DailyChallenge & { progress: number; complete: boolean }> {
    this.refreshDaily();
    return this.data.daily.challenges.map((c) => {
      const progress = Math.max(0, Math.min(c.goal, this.data.stats[c.stat] - c.baseline));
      return { ...c, progress, complete: progress >= c.goal };
    });
  }

  /** Claim a completed, unclaimed challenge → award its XP. Returns true on success. */
  claimChallenge(id: string): boolean {
    this.refreshDaily();
    const c = this.data.daily.challenges.find((x) => x.id === id);
    if (!c || c.claimed) return false;
    const progress = this.data.stats[c.stat] - c.baseline;
    if (progress < c.goal) return false;
    c.claimed = true;
    this.data.xp += c.reward;
    this.save();
    return true;
  }

  /** Reset to fresh state. Wipes XP, cosmetics, AND lifetime stats. */
  reset() {
    this.data = freshData();
    this.save();
  }
}
