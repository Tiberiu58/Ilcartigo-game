/**
 * Crates — the "spin for a cosmetic" reward loop.
 *
 * A Krunker-style crate/spin layer on top of the existing cosmetics economy.
 * Players earn **crate keys** by levelling up (every XP source feeds it via
 * `Account.creditLevelKeys`) plus a free daily crate. Opening a crate force-
 * unlocks a random cosmetic (skin / kill effect / tracer / finish) — bypassing
 * its XP cost — or, if already owned, refunds XP. Weapon skins stay out of the
 * pool: those are earned by *using* the gun (mastery), and that loop is kept
 * pure.
 *
 * Pure logic + a flat reward pool built from the cosmetics registries. The
 * animated reel lives in `ui/CrateUI.ts`; this module only decides *what* drops
 * and applies the grant/refund to the account.
 */

import {
  SKINS, KILL_EFFECTS, TRACERS, FINISHES,
} from './Cosmetics';
import type { Account, CosmeticAxis } from './Account';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface CrateItem {
  axis: CosmeticAxis;
  id: string;
  name: string;
  /** Swatch / glow colour for the reel card (hex). */
  swatch: number;
  rarity: Rarity;
}

export interface CrateResult {
  item: CrateItem;
  /** True when the player already owned the item → XP refund instead. */
  duplicate: boolean;
  /** XP refunded on a duplicate (0 on a fresh unlock). */
  xpRefund: number;
}

/** Rarity → display label + accent colour (used by the UI). */
export const RARITY_META: Record<Rarity, { label: string; color: number; css: string }> = {
  common:    { label: 'COMMON',    color: 0x9aa6b4, css: '#9aa6b4' },
  rare:      { label: 'RARE',      color: 0x4cc6ff, css: '#4cc6ff' },
  epic:      { label: 'EPIC',      color: 0xb060ff, css: '#b060ff' },
  legendary: { label: 'LEGENDARY', color: 0xffc233, css: '#ffc233' },
};

/** Drop weight per rarity (relative). Lower rarity is far more common. */
const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 56, rare: 28, epic: 12, legendary: 4,
};

/** XP refunded when a crate lands on something you already own. */
const DUPE_XP: Record<Rarity, number> = {
  common: 60, rare: 150, epic: 350, legendary: 700,
};

/** Map a cosmetic's XP cost onto a rarity band. */
function rarityForCost(cost: number): Rarity {
  if (cost <= 500) return 'common';
  if (cost <= 1200) return 'rare';
  if (cost <= 2500) return 'epic';
  return 'legendary';
}

/**
 * The flat reward pool — every non-default unlockable cosmetic across the four
 * axes the registries expose. Built once at module load; the cosmetics UI and
 * crates share the same source of truth, so new registry entries automatically
 * appear in crates with no code change.
 */
export const CRATE_POOL: ReadonlyArray<CrateItem> = (() => {
  const out: CrateItem[] = [];
  for (const s of SKINS) {
    if (s.cost <= 0) continue;
    out.push({ axis: 'skin', id: s.id, name: s.displayName, swatch: s.bodyColor, rarity: rarityForCost(s.cost) });
  }
  for (const e of KILL_EFFECTS) {
    if (e.cost <= 0) continue;
    out.push({ axis: 'effect', id: e.id, name: e.displayName, swatch: e.particleColor, rarity: rarityForCost(e.cost) });
  }
  for (const t of TRACERS) {
    if (t.cost <= 0) continue;
    out.push({ axis: 'tracer', id: t.id, name: t.displayName, swatch: t.color, rarity: rarityForCost(t.cost) });
  }
  for (const f of FINISHES) {
    if (f.cost <= 0) continue;
    out.push({ axis: 'finish', id: f.id, name: f.displayName, swatch: f.swatch, rarity: rarityForCost(f.cost) });
  }
  return out;
})();

/** Items of a given rarity. */
function ofRarity(r: Rarity): CrateItem[] {
  return CRATE_POOL.filter((i) => i.rarity === r);
}

/** Weighted pick of a rarity that actually has items. */
function rollRarity(): Rarity {
  const present = (Object.keys(RARITY_WEIGHT) as Rarity[]).filter((r) => ofRarity(r).length > 0);
  let total = 0;
  for (const r of present) total += RARITY_WEIGHT[r];
  let roll = Math.random() * total;
  for (const r of present) {
    roll -= RARITY_WEIGHT[r];
    if (roll < 0) return r;
  }
  return present[present.length - 1] ?? 'common';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Roll a crate item. Rolls a rarity by weight, then — bad-luck protection —
 * prefers an *unowned* item of that rarity (so crates keep handing out new
 * cosmetics until a tier is exhausted), falling back to any item of that
 * rarity once everything in the tier is owned (a guaranteed duplicate → XP).
 */
function rollItem(acc: Account): CrateItem {
  const rarity = rollRarity();
  const tier = ofRarity(rarity);
  const unowned = tier.filter((i) => !acc.hasCosmetic(i.axis, i.id));
  if (unowned.length > 0) return pick(unowned);
  if (tier.length > 0) return pick(tier);
  // Absolute fallback (pool somehow empty for this rarity) — any pool item.
  const anyUnowned = CRATE_POOL.filter((i) => !acc.hasCosmetic(i.axis, i.id));
  return pick(anyUnowned.length > 0 ? anyUnowned : (CRATE_POOL as CrateItem[]));
}

/**
 * Open one crate against an account: rolls an item, then either force-unlocks it
 * (fresh) or refunds XP (duplicate), and bumps the lifetime counter. The caller
 * is responsible for having already spent a key (`Account.spendCrateKey`).
 */
export function openCrate(acc: Account): CrateResult {
  const item = rollItem(acc);
  const already = acc.hasCosmetic(item.axis, item.id);
  let xpRefund = 0;
  if (already) {
    xpRefund = DUPE_XP[item.rarity];
    acc.awardXP(xpRefund);
  } else {
    acc.grantCosmetic(item.axis, item.id);
  }
  acc.recordCrateOpened();
  return { item, duplicate: already, xpRefund };
}

/**
 * Build a reel strip for the UI animation: `length` random filler items with
 * the winning item placed at `landIndex`. Fillers are weighted to mostly show
 * commons/rares so the rare landed item still feels special.
 */
export function buildReel(landed: CrateItem, length: number, landIndex: number): CrateItem[] {
  const strip: CrateItem[] = [];
  for (let i = 0; i < length; i++) {
    if (i === landIndex) { strip.push(landed); continue; }
    strip.push(pick(ofRarity(rollRarity())));
  }
  return strip;
}
