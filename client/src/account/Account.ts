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

import {
  findSkin, findTracer, findFinish, findWeaponSkin,
  defaultSkinForClass, defaultWeaponSkin, weaponSkinsFor,
  DEFAULT_KILL_EFFECT, DEFAULT_TRACER, DEFAULT_FINISH,
  type SkinId, type KillEffectId, type TracerId, type FinishId,
  type WeaponSkinId, type WeaponSkinConfig,
} from './Cosmetics';
import { generateShop, type ShopOffer, type CosmeticKind } from './Shop';
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

/** Today's shop: the date it was rolled for + the chosen offers (stable across
 *  the day so buying one item doesn't reshuffle the rest). */
interface ShopState {
  date: string;
  offers: ShopOffer[];
}

interface AccountData {
  xp: number;
  /** Soft currency earned in matches, spent in the daily shop. */
  coins: number;
  /** Set of unlocked cosmetic IDs (we store as array for JSON). */
  unlockedSkins: SkinId[];
  unlockedEffects: KillEffectId[];
  unlockedTracers: TracerId[];
  unlockedFinishes: FinishId[];
  /** Per-class equipped skin. If a class isn't here, the default is used. */
  equippedSkin: Partial<Record<ClassId, SkinId>>;
  equippedKillEffect: KillEffectId;
  equippedTracer: TracerId;
  equippedFinish: FinishId;
  /** Lifetime kills per weapon id — drives weapon mastery + skin unlocks. */
  weaponKills: Record<string, number>;
  /** Per-weapon equipped skin id. Missing = the weapon's default skin. */
  equippedWeaponSkin: Record<string, WeaponSkinId>;
  /** Lifetime career stats. */
  stats: LifetimeStats;
  /** Player's chosen display name (shown on scoreboard). Empty = "You". */
  name: string;
  /** Today's daily challenges (regenerated when the date rolls over). */
  daily: DailyState;
  /** Daily-login streak (show-up reward, separate from the in-match challenges). */
  login: LoginState;
  /** Unlocked career-achievement (medal) ids. Generic string set so the medal
   *  catalogue can grow without touching this storage shape. */
  unlockedAchievements: string[];
  /** Today's daily-rotating coin shop. */
  shop: ShopState;
  /** YYYY-MM-DD of the last claimed "first win of the day" bonus ('' = never). */
  firstWinDate: string;
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
  return dateKey(new Date());
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Local date key for yesterday — used to decide if a login streak continues. */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/** Escalating 7-day login-reward cycle (XP). Day 7 is the jackpot; it repeats. */
export const LOGIN_REWARDS = [100, 150, 200, 300, 400, 600, 1200];

/** Daily-login streak state. `last` = YYYY-MM-DD of the last claim, `streak` =
 *  consecutive days claimed (the cycle day = ((streak - 1) % 7)). */
interface LoginState {
  last: string;
  streak: number;
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
    coins: 0,
    unlockedSkins: [
      'phantom-default', 'rush-default', 'vanguard-default',
      'ghost-default', 'engineer-default', 'hunter-default',
    ],
    unlockedEffects: [DEFAULT_KILL_EFFECT],
    unlockedTracers: [DEFAULT_TRACER],
    unlockedFinishes: [DEFAULT_FINISH],
    equippedSkin: {},
    equippedKillEffect: DEFAULT_KILL_EFFECT,
    equippedTracer: DEFAULT_TRACER,
    equippedFinish: DEFAULT_FINISH,
    weaponKills: {},
    equippedWeaponSkin: {},
    stats: freshStats(),
    name: '',
    daily: freshDaily(freshStats()),
    login: { last: '', streak: 0 },
    unlockedAchievements: [],
    shop: { date: '', offers: [] },
    firstWinDate: '',
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
        coins: typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? parsed.coins : fresh.coins,
        unlockedSkins: Array.isArray(parsed.unlockedSkins) ? parsed.unlockedSkins : fresh.unlockedSkins,
        unlockedEffects: Array.isArray(parsed.unlockedEffects) ? parsed.unlockedEffects : fresh.unlockedEffects,
        // Always keep the default tracer unlocked even on an older save.
        unlockedTracers: Array.isArray(parsed.unlockedTracers)
          ? Array.from(new Set([DEFAULT_TRACER, ...parsed.unlockedTracers]))
          : fresh.unlockedTracers,
        // Always keep the default finish unlocked even on an older save.
        unlockedFinishes: Array.isArray(parsed.unlockedFinishes)
          ? Array.from(new Set([DEFAULT_FINISH, ...parsed.unlockedFinishes]))
          : fresh.unlockedFinishes,
        equippedSkin: (parsed.equippedSkin && typeof parsed.equippedSkin === 'object')
          ? parsed.equippedSkin as Partial<Record<ClassId, SkinId>>
          : fresh.equippedSkin,
        equippedKillEffect: typeof parsed.equippedKillEffect === 'string'
          ? parsed.equippedKillEffect
          : fresh.equippedKillEffect,
        equippedTracer: typeof parsed.equippedTracer === 'string'
          ? parsed.equippedTracer
          : fresh.equippedTracer,
        equippedFinish: typeof parsed.equippedFinish === 'string'
          ? parsed.equippedFinish
          : fresh.equippedFinish,
        weaponKills: (parsed.weaponKills && typeof parsed.weaponKills === 'object')
          ? parsed.weaponKills as Record<string, number>
          : fresh.weaponKills,
        equippedWeaponSkin: (parsed.equippedWeaponSkin && typeof parsed.equippedWeaponSkin === 'object')
          ? parsed.equippedWeaponSkin as Record<string, WeaponSkinId>
          : fresh.equippedWeaponSkin,
        // Merge stats field-by-field so a save from before a stat was added
        // still upgrades cleanly (missing fields default to 0).
        stats: mergeStats(parsed.stats, fresh.stats),
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 16) : fresh.name,
        daily: (parsed.daily && typeof parsed.daily === 'object' && Array.isArray((parsed.daily as DailyState).challenges))
          ? parsed.daily as DailyState
          : fresh.daily,
        login: (parsed.login && typeof parsed.login === 'object'
          && typeof (parsed.login as LoginState).last === 'string'
          && typeof (parsed.login as LoginState).streak === 'number')
          ? parsed.login as LoginState
          : fresh.login,
        unlockedAchievements: Array.isArray(parsed.unlockedAchievements)
          ? parsed.unlockedAchievements.filter((x): x is string => typeof x === 'string')
          : fresh.unlockedAchievements,
        shop: (parsed.shop && typeof parsed.shop === 'object'
          && typeof (parsed.shop as ShopState).date === 'string'
          && Array.isArray((parsed.shop as ShopState).offers))
          ? parsed.shop as ShopState
          : fresh.shop,
        firstWinDate: typeof parsed.firstWinDate === 'string' ? parsed.firstWinDate : fresh.firstWinDate,
      };
      // Roll over to a new day's challenges if needed, and rebase baselines.
      this.refreshDaily();
      this.refreshShop();
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
  get coins(): number { return this.data.coins; }
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
  isFinishUnlocked(id: FinishId): boolean {
    return this.data.unlockedFinishes.includes(id);
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

  /** Equipped weapon finish id, falling back to default if invalid. */
  equippedFinish(): FinishId {
    const id = this.data.equippedFinish;
    if (this.isFinishUnlocked(id) && findFinish(id)) return id;
    return DEFAULT_FINISH;
  }

  /** Equipped finish emissive tint (hex) — read by the Viewmodel. */
  equippedFinishEmissive(): number {
    return findFinish(this.equippedFinish())?.emissive ?? 0x000000;
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

  // ── Finishes (kill-finisher cosmetics) ────────────────────────────────────

  tryUnlockFinish(id: FinishId, cost: number): boolean {
    if (this.isFinishUnlocked(id)) return true;
    if (this.data.xp < cost) return false;
    this.data.xp -= cost;
    this.data.unlockedFinishes.push(id);
    this.save();
    return true;
  }

  equipFinish(id: FinishId): boolean {
    if (!this.isFinishUnlocked(id)) return false;
    this.data.equippedFinish = id;
    this.save();
    return true;
  }

  // ── Weapon mastery + skins ────────────────────────────────────────────────

  /** Lifetime kills with a given weapon (its mastery count). */
  weaponKillsFor(weaponId: string): number {
    return this.data.weaponKills[weaponId] ?? 0;
  }

  /** A weapon skin is unlocked once its weapon's mastery meets the kill req. */
  isWeaponSkinUnlocked(skin: WeaponSkinConfig): boolean {
    return this.weaponKillsFor(skin.weaponId) >= skin.killReq;
  }

  /** Equipped skin id for a weapon, falling back to default if unset/locked. */
  equippedWeaponSkinId(weaponId: string): WeaponSkinId {
    const id = this.data.equippedWeaponSkin[weaponId];
    const skin = id ? findWeaponSkin(id) : undefined;
    if (skin && skin.weaponId === weaponId && this.isWeaponSkinUnlocked(skin)) return id;
    return defaultWeaponSkin(weaponId);
  }

  /** Equipped skin tint colour for a weapon, or null for the stock (default) look. */
  equippedWeaponSkinColor(weaponId: string): number | null {
    const skin = findWeaponSkin(this.equippedWeaponSkinId(weaponId));
    return skin?.color ?? null;
  }

  /** Equip an unlocked weapon skin. No-op if locked or unknown. */
  equipWeaponSkin(id: WeaponSkinId): boolean {
    const skin = findWeaponSkin(id);
    if (!skin || !this.isWeaponSkinUnlocked(skin)) return false;
    this.data.equippedWeaponSkin[skin.weaponId] = id;
    this.save();
    return true;
  }

  /**
   * Record a local-player kill with a weapon → bumps that weapon's mastery.
   * Returns the skin that JUST unlocked on this kill (its killReq exactly
   * equals the new count), or null — so callers can celebrate it. Saves once.
   */
  recordWeaponKill(weaponId: string): WeaponSkinConfig | null {
    const next = this.weaponKillsFor(weaponId) + 1;
    this.data.weaponKills[weaponId] = next;
    this.save();
    return weaponSkinsFor(weaponId).find((s) => s.killReq === next) ?? null;
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
    this.data.coins += Math.round(c.reward * 0.4);
    this.save();
    return true;
  }

  // ── Coins economy + daily shop ────────────────────────────────────────────

  /** Award coins (the match-earned soft currency). Returns the new balance. */
  awardCoins(amount: number): number {
    if (amount > 0) {
      this.data.coins += Math.round(amount);
      this.save();
    }
    return this.data.coins;
  }

  /** True if a cosmetic of the given kind/id is already owned. */
  private isOwnedByKind(kind: CosmeticKind, id: string): boolean {
    switch (kind) {
      case 'skin':   return this.isSkinUnlocked(id);
      case 'effect': return this.isEffectUnlocked(id);
      case 'tracer': return this.isTracerUnlocked(id);
      case 'finish': return this.isFinishUnlocked(id);
    }
  }

  /** Mark a cosmetic unlocked (no cost) + auto-equip it. Used by the buy path. */
  private grantAndEquip(kind: CosmeticKind, id: string) {
    switch (kind) {
      case 'skin':
        if (!this.data.unlockedSkins.includes(id)) this.data.unlockedSkins.push(id);
        { const s = findSkin(id); if (s) this.data.equippedSkin[s.classId] = id; }
        break;
      case 'effect':
        if (!this.data.unlockedEffects.includes(id)) this.data.unlockedEffects.push(id);
        this.data.equippedKillEffect = id;
        break;
      case 'tracer':
        if (!this.data.unlockedTracers.includes(id)) this.data.unlockedTracers.push(id);
        this.data.equippedTracer = id;
        break;
      case 'finish':
        if (!this.data.unlockedFinishes.includes(id)) this.data.unlockedFinishes.push(id);
        this.data.equippedFinish = id;
        break;
    }
  }

  /** Regenerate the shop if the day rolled over (or it was never built). */
  private refreshShop() {
    if (this.data.shop.date !== todayKey()) {
      this.data.shop = {
        date: todayKey(),
        offers: generateShop(todayKey(), (kind, id) => this.isOwnedByKind(kind, id)),
      };
      this.save();
    }
  }

  /** Today's shop offers, each annotated with owned/affordable flags for the UI. */
  get shopOffers(): Array<ShopOffer & { owned: boolean; affordable: boolean }> {
    this.refreshShop();
    return this.data.shop.offers.map((o) => ({
      ...o,
      owned: this.isOwnedByKind(o.kind, o.id),
      affordable: this.data.coins >= o.price,
    }));
  }

  /**
   * Buy a shop offer with coins → deduct coins, unlock + equip the cosmetic.
   * Returns 'ok' on success, or a reason it failed (so the UI can react).
   */
  buyShopItem(id: string): 'ok' | 'owned' | 'poor' | 'gone' {
    this.refreshShop();
    const offer = this.data.shop.offers.find((o) => o.id === id);
    if (!offer) return 'gone';
    if (this.isOwnedByKind(offer.kind, offer.id)) return 'owned';
    if (this.data.coins < offer.price) return 'poor';
    this.data.coins -= offer.price;
    this.grantAndEquip(offer.kind, offer.id);
    this.save();
    return 'ok';
  }

  /** First match win of the local day → a one-time bonus. Returns the granted
   *  {xp, coins} the first time it's called on a winning match each day, or null
   *  if today's first-win bonus was already claimed. */
  claimFirstWinOfDay(): { xp: number; coins: number } | null {
    const today = todayKey();
    if (this.data.firstWinDate === today) return null;
    this.data.firstWinDate = today;
    const xp = 200, coins = 50;
    this.data.xp += xp;
    this.data.coins += coins;
    this.save();
    return { xp, coins };
  }

  // ── Daily-login streak ────────────────────────────────────────────────────

  /**
   * Today's login-reward status. `day` is the streak day claiming now would set
   * (1-based), `cycleIndex` the 0..6 position in the 7-day cycle, `reward` the
   * XP it grants. `available` is false once today's reward is already claimed.
   */
  dailyLoginStatus(): { available: boolean; day: number; cycleIndex: number; reward: number; streak: number } {
    const today = todayKey();
    const claimedToday = this.data.login.last === today;
    // The day that a claim right now would land on: continue the streak if the
    // last claim was yesterday, otherwise it resets to day 1.
    const day = claimedToday
      ? this.data.login.streak
      : (this.data.login.last === yesterdayKey() ? this.data.login.streak + 1 : 1);
    const cycleIndex = ((Math.max(1, day) - 1) % 7);
    return {
      available: !claimedToday,
      day,
      cycleIndex,
      reward: LOGIN_REWARDS[cycleIndex],
      streak: this.data.login.streak,
    };
  }

  /** Claim today's login reward (once per day). Awards XP, advances the streak.
   *  Returns the granted reward + day, or null if already claimed today. */
  claimDailyLogin(): { day: number; reward: number } | null {
    const st = this.dailyLoginStatus();
    if (!st.available) return null;
    this.data.login.last = todayKey();
    this.data.login.streak = st.day;
    this.data.xp += st.reward;
    this.data.coins += Math.round(st.reward * 0.5);
    this.save();
    return { day: st.day, reward: st.reward };
  }

  // ── Career achievements (medals) ──────────────────────────────────────────

  /** True if the given medal id has been earned. */
  isAchievementUnlocked(id: string): boolean {
    return this.data.unlockedAchievements.includes(id);
  }

  /** Number of medals earned so far. */
  get achievementCount(): number { return this.data.unlockedAchievements.length; }

  /**
   * Unlock a medal: record its id + grant the bonus XP, once. Returns true if it
   * was newly unlocked (false if already earned). Evaluation lives in
   * AchievementTracker; Account only owns the storage + reward grant.
   */
  unlockAchievement(id: string, reward: number): boolean {
    if (this.data.unlockedAchievements.includes(id)) return false;
    this.data.unlockedAchievements.push(id);
    if (reward > 0) this.data.xp += reward;
    this.save();
    return true;
  }

  /** Reset to fresh state. Wipes XP, cosmetics, AND lifetime stats. */
  reset() {
    this.data = freshData();
    this.save();
  }
}
