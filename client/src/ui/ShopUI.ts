/**
 * ShopUI — the Armory store overlay.
 *
 * A second, play-to-earn path to the same cosmetics the XP-gated Cosmetics tab
 * unlocks: spend **Credits** (earned every match) on player skins, kill effects,
 * bullet tracers and weapon finishes. Every day one item is the discounted
 * "Featured Deal" (seeded by the date, so it's stable through the day and the
 * same for everyone).
 *
 * Pure UI over Account (the source of truth) + Cosmetics (the registries). No
 * protocol, no gameplay — just another retention/reward loop, and another menu
 * screen carrying an ad slot. Buying a cosmetic also auto-equips it so the
 * purchase feels immediate.
 */

import type { Account, CosmeticKind } from '../account/Account';
import {
  SKINS, KILL_EFFECTS, TRACERS, FINISHES, creditPrice,
} from '../account/Cosmetics';
import { CLASS_LIBRARY, type ClassId } from '../classes/types';

interface ShopItem {
  kind: CosmeticKind;
  id: string;
  name: string;
  /** Display swatch colour (hex number). */
  swatch: number;
  /** Secondary swatch (skins use a head tint); falls back to swatch. */
  swatch2: number;
  /** Base credit price (derived from the item's XP cost). */
  price: number;
  /** Group label used to bucket cards into sections. */
  group: string;
  /** For skins — the class the equip belongs to. */
  classId?: ClassId;
}

function hex(n: number): string { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** Deterministic FNV-1a hash → used to pick a stable daily featured item. */
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function dateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Build the full purchasable catalogue (free defaults excluded). */
function buildCatalog(): ShopItem[] {
  const out: ShopItem[] = [];
  for (const s of SKINS) {
    if (s.cost <= 0) continue;
    out.push({
      kind: 'skin', id: s.id, name: s.displayName,
      swatch: s.bodyColor, swatch2: s.headColor, price: creditPrice(s.cost),
      group: CLASS_LIBRARY[s.classId].displayName, classId: s.classId,
    });
  }
  for (const e of KILL_EFFECTS) {
    if (e.cost <= 0) continue;
    out.push({
      kind: 'effect', id: e.id, name: e.displayName,
      swatch: e.particleColor, swatch2: e.particleColor, price: creditPrice(e.cost),
      group: 'Kill Effects',
    });
  }
  for (const t of TRACERS) {
    if (t.cost <= 0) continue;
    out.push({
      kind: 'tracer', id: t.id, name: t.displayName,
      swatch: t.color, swatch2: t.color, price: creditPrice(t.cost),
      group: 'Bullet Tracers',
    });
  }
  for (const f of FINISHES) {
    if (f.cost <= 0) continue;
    out.push({
      kind: 'finish', id: f.id, name: f.displayName,
      swatch: f.swatch, swatch2: f.swatch, price: creditPrice(f.cost),
      group: 'Weapon Finishes',
    });
  }
  return out;
}

/** Section ordering for the grid (skins by class first, then the global axes). */
const SECTION_ORDER = [
  'Phantom', 'Rush', 'Vanguard', 'Ghost', 'Engineer', 'Hunter',
  'Kill Effects', 'Bullet Tracers', 'Weapon Finishes',
];

/** Flat credit price of one Mystery Crate spin — cheaper than most premium items,
 *  so the gamble can pay off big (or hand you a cheap one). */
const CRATE_PRICE = 120;

export class ShopUI {
  private account: Account;
  private playSound: (id: string) => void;
  private overlay: HTMLElement;
  private creditsEl: HTMLElement;
  private crateEl: HTMLElement;
  private featuredEl: HTMLElement;
  private bodyEl: HTMLElement;
  private revealEl: HTMLElement;
  private catalog = buildCatalog();
  private open = false;

  constructor(account: Account, playSound: (id: string) => void) {
    this.account = account;
    this.playSound = playSound;
    this.overlay = document.getElementById('shop-overlay')!;
    this.creditsEl = document.getElementById('shop-credits')!;
    this.crateEl = document.getElementById('shop-crate')!;
    this.featuredEl = document.getElementById('shop-featured')!;
    this.bodyEl = document.getElementById('shop-body')!;
    this.revealEl = document.getElementById('crate-reveal')!;

    document.getElementById('shop-close')?.addEventListener('click', () => {
      this.playSound('ui_click');
      this.hide();
    });
    document.getElementById('crate-claim')?.addEventListener('click', () => {
      this.playSound('ui_click');
      this.revealEl.classList.add('hidden');
    });
    this.crateEl.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('#shop-crate-buy')) this.openCrate();
    });
    // Re-render live when credits/unlocks change (e.g. a purchase) but only while
    // the shop is on screen — otherwise it's wasted work behind the menu.
    this.account.onChange(() => { if (this.open) this.render(); });
  }

  /** The day's discounted featured item (35% off), stable across reloads. */
  private featuredItem(): { item: ShopItem; price: number } | null {
    if (this.catalog.length === 0) return null;
    const item = this.catalog[seedFrom('shop' + dateKey()) % this.catalog.length];
    const price = Math.max(10, Math.round((item.price * 0.65) / 5) * 5);
    return { item, price };
  }

  show() { this.open = true; this.render(); this.overlay.classList.remove('hidden'); }
  hide() { this.open = false; this.overlay.classList.add('hidden'); }

  private owned(item: ShopItem): boolean {
    switch (item.kind) {
      case 'skin':   return this.account.isSkinUnlocked(item.id);
      case 'effect': return this.account.isEffectUnlocked(item.id);
      case 'tracer': return this.account.isTracerUnlocked(item.id);
      case 'finish': return this.account.isFinishUnlocked(item.id);
    }
  }

  /** Auto-equip a freshly-bought cosmetic so the buy feels immediate. */
  private equip(item: ShopItem) {
    switch (item.kind) {
      case 'skin':   this.account.equipSkin(item.id); break;
      case 'effect': this.account.equipKillEffect(item.id); break;
      case 'tracer': this.account.equipTracer(item.id); break;
      case 'finish': this.account.equipFinish(item.id); break;
    }
  }

  /** All catalogue items the player doesn't yet own (the crate's prize pool). */
  private unownedPool(): ShopItem[] {
    return this.catalog.filter((c) => !this.owned(c));
  }

  /** Open a Mystery Crate: spend the flat price, grant a random unowned cosmetic,
   *  and play the reveal. No-op (with a cue) if broke or everything's unlocked. */
  private openCrate() {
    const pool = this.unownedPool();
    if (pool.length === 0) { this.playSound('ui_click'); return; }
    if (this.account.credits < CRATE_PRICE) { this.playSound('empty_click'); return; }
    if (!this.account.spendCredits(CRATE_PRICE)) { this.playSound('empty_click'); return; }
    const prize = pool[Math.floor(Math.random() * pool.length)];
    this.account.grantCosmetic(prize.kind, prize.id);   // triggers onChange → re-render
    this.showReveal(prize);
  }

  private showReveal(item: ShopItem) {
    const swatch = this.revealEl.querySelector<HTMLElement>('.cr-swatch')!;
    swatch.style.setProperty('--body-c', hex(item.swatch));
    swatch.style.setProperty('--head-c', hex(item.swatch2));
    this.revealEl.querySelector('#cr-name')!.textContent = item.name;
    this.revealEl.querySelector('#cr-kind')!.textContent = item.group;
    // value flavour — how much the prize would have cost at full shop price.
    this.revealEl.querySelector('#cr-value')!.textContent = `worth ◈ ${item.price}`;
    this.revealEl.classList.remove('hidden');
    // restart the pop animation
    const card = this.revealEl.querySelector<HTMLElement>('.crate-card')!;
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    this.playSound('level_up');
  }

  private renderCrate() {
    const remaining = this.unownedPool().length;
    const afford = this.account.credits >= CRATE_PRICE;
    if (remaining === 0) {
      this.crateEl.innerHTML = `<div class="shop-crate-inner done">
        <span class="crate-ico">🎁</span>
        <div class="crate-text"><b>MYSTERY CRATE</b><span>Everything unlocked — you own it all ✓</span></div>
      </div>`;
      return;
    }
    this.crateEl.innerHTML = `<div class="shop-crate-inner">
      <span class="crate-ico">🎁</span>
      <div class="crate-text">
        <b>MYSTERY CRATE</b>
        <span>A random cosmetic you don't own yet · ${remaining} left in the pool</span>
      </div>
      <button id="shop-crate-buy" class="crate-buy ${afford ? '' : 'cant'}">◈ ${CRATE_PRICE} · OPEN</button>
    </div>`;
  }

  private buy(item: ShopItem, price: number) {
    if (this.owned(item)) { this.playSound('ui_click'); return; }
    if (this.account.credits < price) { this.playSound('empty_click'); return; }
    if (this.account.buyWithCredits(item.kind, item.id, price)) {
      this.equip(item);             // triggers account.onChange → re-render
      this.playSound('pickup_powerup');
    } else {
      this.playSound('ui_click');
    }
  }

  private cardHtml(item: ShopItem, price: number, featured: boolean): string {
    const owned = this.owned(item);
    const afford = this.account.credits >= price;
    const cls = ['cos-card', 'shop-card', owned ? 'owned' : '', !owned && !afford ? 'cant' : '', featured ? 'feat' : '']
      .filter(Boolean).join(' ');
    const status = owned ? 'OWNED ✓' : `◈ ${price}`;
    return `<div class="${cls}" data-shop-kind="${item.kind}" data-shop-id="${item.id}" data-shop-price="${price}"
        style="--body-c: ${hex(item.swatch)}; --head-c: ${hex(item.swatch2)}">
      <div class="cos-swatch"><div class="head"></div><div class="body"></div></div>
      <div class="cos-name">${esc(item.name)}</div>
      <div class="shop-price ${owned ? 'owned' : afford ? '' : 'cant'}">${status}</div>
    </div>`;
  }

  private render() {
    this.creditsEl.textContent = String(this.account.credits);

    // Mystery Crate banner.
    this.renderCrate();

    // Featured deal.
    const feat = this.featuredItem();
    if (feat) {
      const f = feat.item;
      const owned = this.owned(f);
      this.featuredEl.innerHTML = `
        <div class="shop-feat-head">★ DAILY DEAL <span class="shop-feat-tag">${owned ? 'OWNED' : '35% OFF'}</span></div>
        <div class="shop-feat-body">
          ${this.cardHtml(f, feat.price, true)}
          <div class="shop-feat-info">
            <div class="shop-feat-name">${esc(f.name)}</div>
            <div class="shop-feat-sub">${esc(f.group)}</div>
            ${owned ? '' : `<div class="shop-feat-old">was ◈ ${f.price}</div>`}
          </div>
        </div>`;
    } else {
      this.featuredEl.innerHTML = '';
    }

    // Sections.
    const sections = new Map<string, ShopItem[]>();
    for (const item of this.catalog) {
      if (!sections.has(item.group)) sections.set(item.group, []);
      sections.get(item.group)!.push(item);
    }
    const html: string[] = [];
    for (const group of SECTION_ORDER) {
      const items = sections.get(group);
      if (!items || items.length === 0) continue;
      html.push(`<div class="shop-section-head">${esc(group)}</div>`);
      html.push('<div class="shop-grid">');
      for (const item of items) html.push(this.cardHtml(item, item.price, false));
      html.push('</div>');
    }
    this.bodyEl.innerHTML = html.join('');

    // Wire clicks (featured + body share the same data attributes).
    this.overlay.querySelectorAll<HTMLElement>('[data-shop-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const kind = el.dataset.shopKind as CosmeticKind;
        const id = el.dataset.shopId!;
        const price = Number(el.dataset.shopPrice);
        const item = this.catalog.find((c) => c.kind === kind && c.id === id);
        if (item) this.buy(item, price);
      });
    });
  }
}
