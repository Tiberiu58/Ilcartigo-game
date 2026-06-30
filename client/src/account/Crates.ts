/**
 * Crates — the loot-reward loop.
 *
 * Coins (earned by playing) buy a crate; opening it grants a RANDOM locked
 * cosmetic drawn from the existing XP-cost pools (skins · kill effects · tracers
 * · finishes), with a rarity tier derived from each item's original XP cost. The
 * crate is the *alternative* unlock path — instead of saving XP for one specific
 * item, you gamble Coins for a surprise. Weapon-mastery skins are deliberately
 * NOT in crates (they stay the play-to-earn track), so the two reward economies
 * don't overlap.
 *
 * Pure logic — no DOM, no THREE. `openCrate` only reads the Account to know
 * what's still locked; `applyCrateResult` commits the grant + bonus Coins.
 */

import type { Account } from './Account';
import {
  SKINS, KILL_EFFECTS, TRACERS, FINISHES,
} from './Cosmetics';

/** Coin price of one crate. */
export const CRATE_COST = 600;

export type CrateRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CrateKind = 'skin' | 'effect' | 'tracer' | 'finish';

export interface CrateItem {
  kind: CrateKind;
  id: string;
  name: string;
  /** Representative colour (hex) for the reveal swatch. */
  color: number;
  /** Original XP cost — drives the rarity tier. */
  cost: number;
  rarity: CrateRarity;
}

/** Per-rarity presentation + drop weight + consolation-coin scale. */
export const RARITY_META: Record<CrateRarity, { label: string; color: string; weight: number; coins: number }> = {
  common:    { label: 'COMMON',    color: '#b7c0cc', weight: 58, coins: 120  },
  rare:      { label: 'RARE',      color: '#4cc6ff', weight: 28, coins: 260  },
  epic:      { label: 'EPIC',      color: '#c061ff', weight: 11, coins: 520  },
  legendary: { label: 'LEGENDARY', color: '#ffb020', weight:  3, coins: 1000 },
};

export const RARITY_ORDER: CrateRarity[] = ['common', 'rare', 'epic', 'legendary'];

const KIND_LABEL: Record<CrateKind, string> = {
  skin: 'Player Skin', effect: 'Kill Effect', tracer: 'Bullet Tracer', finish: 'Weapon Finish',
};
export function kindLabel(kind: CrateKind): string { return KIND_LABEL[kind]; }

/** Map an XP cost to a rarity bucket. */
function rarityForCost(cost: number): CrateRarity {
  if (cost <= 500) return 'common';
  if (cost <= 1500) return 'rare';
  if (cost <= 3000) return 'epic';
  return 'legendary';
}

/** Build the full crate pool once (all non-default cosmetics). */
function buildPool(): CrateItem[] {
  const out: CrateItem[] = [];
  for (const s of SKINS) if (s.cost > 0)
    out.push({ kind: 'skin', id: s.id, name: s.displayName, color: s.bodyColor, cost: s.cost, rarity: rarityForCost(s.cost) });
  for (const e of KILL_EFFECTS) if (e.cost > 0)
    out.push({ kind: 'effect', id: e.id, name: e.displayName, color: e.particleColor, cost: e.cost, rarity: rarityForCost(e.cost) });
  for (const t of TRACERS) if (t.cost > 0)
    out.push({ kind: 'tracer', id: t.id, name: t.displayName, color: t.color, cost: t.cost, rarity: rarityForCost(t.cost) });
  for (const f of FINISHES) if (f.cost > 0)
    out.push({ kind: 'finish', id: f.id, name: f.displayName, color: f.swatch, cost: f.cost, rarity: rarityForCost(f.cost) });
  return out;
}

/** Every crate-eligible cosmetic, immutable. */
export const CRATE_POOL: ReadonlyArray<CrateItem> = buildPool();

/** Is this crate item already unlocked on the account? */
function isOwned(acc: Account, item: CrateItem): boolean {
  switch (item.kind) {
    case 'skin':   return acc.isSkinUnlocked(item.id);
    case 'effect': return acc.isEffectUnlocked(item.id);
    case 'tracer': return acc.isTracerUnlocked(item.id);
    case 'finish': return acc.isFinishUnlocked(item.id);
  }
}

/** Count of still-locked crate items per rarity (for the odds display). */
export function lockedCounts(acc: Account): Record<CrateRarity, number> {
  const out: Record<CrateRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (const i of CRATE_POOL) if (!isOwned(acc, i)) out[i.rarity]++;
  return out;
}

/** Total crate items still locked. 0 = collection complete. */
export function totalLocked(acc: Account): number {
  let n = 0;
  for (const i of CRATE_POOL) if (!isOwned(acc, i)) n++;
  return n;
}
export const POOL_SIZE = CRATE_POOL.length;

export interface CrateResult {
  /** The cosmetic unlocked, or null when the whole pool is already owned. */
  item: CrateItem | null;
  /** The visual rarity tier of the reveal (item's tier, or a token tier when null). */
  rarity: CrateRarity;
  /** Bonus Coins dropped on top (Krunker-style shards / collection-complete payout). */
  coins: number;
  newlyUnlocked: boolean;
}

/**
 * Roll a crate. Picks a rarity by weight — but only among rarities that still
 * have locked items — then a uniform-random locked item in that tier. When the
 * whole collection is complete the crate pays out Coins instead (never a waste).
 * `rand` is injectable so tests are deterministic.
 */
export function openCrate(acc: Account, rand: () => number = Math.random): CrateResult {
  const locked = CRATE_POOL.filter((i) => !isOwned(acc, i));
  if (locked.length === 0) {
    return { item: null, rarity: 'rare', coins: 350, newlyUnlocked: false };
  }
  const byRarity = new Map<CrateRarity, CrateItem[]>();
  for (const r of RARITY_ORDER) byRarity.set(r, []);
  for (const i of locked) byRarity.get(i.rarity)!.push(i);

  const avail = RARITY_ORDER.filter((r) => byRarity.get(r)!.length > 0);
  let totalW = 0;
  for (const r of avail) totalW += RARITY_META[r].weight;
  let roll = rand() * totalW;
  let chosen: CrateRarity = avail[avail.length - 1];
  for (const r of avail) { roll -= RARITY_META[r].weight; if (roll <= 0) { chosen = r; break; } }

  const bucket = byRarity.get(chosen)!;
  const item = bucket[Math.floor(rand() * bucket.length)];
  const coins = Math.round(RARITY_META[chosen].coins * 0.25);
  return { item, rarity: chosen, coins, newlyUnlocked: true };
}

/** Commit a crate result to the account: grant the cosmetic + bonus Coins (one save). */
export function applyCrateResult(acc: Account, res: CrateResult) {
  if (res.item) {
    switch (res.item.kind) {
      case 'skin':   acc.grantSkin(res.item.id); break;
      case 'effect': acc.grantEffect(res.item.id); break;
      case 'tracer': acc.grantTracer(res.item.id); break;
      case 'finish': acc.grantFinish(res.item.id); break;
    }
  }
  // awardCoins persists (covering the pending grant above); if somehow 0, commit.
  if (res.coins > 0) acc.awardCoins(res.coins);
  else acc.commit();
}
