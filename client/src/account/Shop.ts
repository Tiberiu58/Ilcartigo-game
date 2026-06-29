/**
 * Shop — the coins economy's catalogue + daily-rotation generator.
 *
 * Pure data (no DOM, no Account dependency) so it stays trivially testable and
 * Account can import it the same way it imports Cosmetics. The shop sells the
 * SAME cosmetic registry items as the Cosmetics tab, but for **coins** (a new
 * soft currency earned in matches) instead of XP — two independent paths to the
 * same unlocks, plus a daily-rotating featured selection that pulls players back
 * (more menu visits → more ad impressions).
 *
 * Weapon skins are deliberately excluded — those are mastery-gated (earned by
 * using the gun), not for sale.
 */

import { SKINS, KILL_EFFECTS, TRACERS, FINISHES } from './Cosmetics';

export type CosmeticKind = 'skin' | 'effect' | 'tracer' | 'finish';

/** A purchasable cosmetic, normalised across the four registries. */
export interface CatalogItem {
  kind: CosmeticKind;
  id: string;
  displayName: string;
  /** A short category/subtitle line ("Phantom skin", "Tracer", …). */
  sub: string;
  /** The item's XP cost in the Cosmetics tab — drives coin pricing + rarity. */
  xpCost: number;
  /** Preview swatch colour (hex). */
  swatch: number;
}

/** A single shop offer for the day. */
export interface ShopOffer {
  kind: CosmeticKind;
  id: string;
  /** Coin price (already discounted if featured). */
  price: number;
  /** The pre-discount price (shown struck-through when featured). */
  listPrice: number;
  featured: boolean;
}

/** Number of offers shown per day. */
export const SHOP_SLOTS = 6;

/** Coin price derived from an item's XP cost. Clamped so nothing is trivially
 *  cheap or absurdly expensive. */
function coinPriceFor(xpCost: number): number {
  return Math.max(60, Math.min(900, Math.round(xpCost / 6)));
}

/** The full pool of coin-purchasable cosmetics (every paid item, defaults
 *  excluded). Built fresh each call — cheap, and keeps registries the source
 *  of truth so new cosmetics appear in the shop automatically. */
export function fullCatalog(): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const s of SKINS) {
    if (s.cost <= 0) continue;
    out.push({ kind: 'skin', id: s.id, displayName: s.displayName, sub: `${s.classId} skin`, xpCost: s.cost, swatch: s.bodyColor });
  }
  for (const e of KILL_EFFECTS) {
    if (e.cost <= 0) continue;
    out.push({ kind: 'effect', id: e.id, displayName: e.displayName, sub: 'Kill effect', xpCost: e.cost, swatch: e.particleColor });
  }
  for (const t of TRACERS) {
    if (t.cost <= 0) continue;
    out.push({ kind: 'tracer', id: t.id, displayName: t.displayName, sub: 'Bullet tracer', xpCost: t.cost, swatch: t.color });
  }
  for (const f of FINISHES) {
    if (f.cost <= 0) continue;
    out.push({ kind: 'finish', id: f.id, displayName: f.displayName, sub: 'Weapon finish', xpCost: f.cost, swatch: f.swatch });
  }
  return out;
}

/** Look up a catalog item by kind+id (used by the buy path + UI rendering). */
export function findCatalogItem(kind: CosmeticKind, id: string): CatalogItem | undefined {
  return fullCatalog().find((c) => c.kind === kind && c.id === id);
}

/** Deterministic FNV-seeded shuffle so a given day's shop is stable across
 *  reloads (matches the Account daily-challenge PRNG style). */
function seededShuffle<T>(seed: string, arr: T[]): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822519); h >>>= 0;
    const j = h % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * Generate the day's shop offers, deterministic per `dateKey`. `isOwned` lets us
 * skip cosmetics the player already has — so the shop only ever shows things
 * worth buying. The first picked slot is the discounted "featured" deal.
 */
export function generateShop(dateKey: string, isOwned: (kind: CosmeticKind, id: string) => boolean): ShopOffer[] {
  const available = seededShuffle(dateKey, fullCatalog()).filter((c) => !isOwned(c.kind, c.id));
  const picks = available.slice(0, SHOP_SLOTS);
  return picks.map((c, i) => {
    const listPrice = coinPriceFor(c.xpCost);
    const featured = i === 0;
    return {
      kind: c.kind,
      id: c.id,
      listPrice,
      price: featured ? Math.max(50, Math.round(listPrice * 0.6)) : listPrice,
      featured,
    };
  });
}
