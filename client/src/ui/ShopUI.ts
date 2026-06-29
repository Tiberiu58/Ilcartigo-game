/**
 * ShopUI — renders the daily coin shop overlay: a rotating grid of cosmetic
 * offers bought with coins (the match-earned soft currency). Each card shows a
 * preview swatch, name, category, price, and a Buy button; the featured deal is
 * highlighted with its discount. Owned items read "OWNED ✓"; unaffordable Buy
 * buttons are disabled.
 *
 * Pure DOM, account-driven (re-renders on account.onChange — coins earned in a
 * match update the balance + affordability live). Mirrors ProfileUI /
 * AchievementsUI / CosmeticsUI.
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';
import { findCatalogItem } from '../account/Shop';

/** '#rrggbb' from a hex number, for inline swatch colours. */
function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export class ShopUI {
  private account: Account;
  private audio: AudioManager;
  private grid: HTMLElement | null;
  private coinsEl: HTMLElement | null;
  private foot: HTMLElement | null;

  constructor(account: Account, audio: AudioManager) {
    this.account = account;
    this.audio = audio;
    this.grid = document.getElementById('shop-grid');
    this.coinsEl = document.getElementById('shop-coins');
    this.foot = document.getElementById('shop-foot');
    // Live-update the balance + affordability whenever coins/unlocks change.
    this.account.onChange(() => this.render());
  }

  render() {
    if (this.coinsEl) this.coinsEl.textContent = String(this.account.coins);
    if (!this.grid) return;
    const offers = this.account.shopOffers;
    this.grid.replaceChildren();

    if (offers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shop-empty';
      empty.textContent = 'You own everything in today’s rotation. Come back tomorrow for a fresh lineup!';
      this.grid.appendChild(empty);
      if (this.foot) this.foot.textContent = '';
      return;
    }

    for (const o of offers) {
      const item = findCatalogItem(o.kind, o.id);
      if (!item) continue;
      const card = document.createElement('div');
      card.className = 'shop-item';
      if (o.featured) card.classList.add('featured');
      if (o.owned) card.classList.add('owned');

      const swatch = `<span class="shop-swatch" style="background:${hex(item.swatch)}"></span>`;
      const tag = o.featured ? '<span class="shop-tag">FEATURED</span>' : '';
      const priceLine = o.featured
        ? `<span class="shop-list">${o.listPrice}</span> <b>🪙 ${o.price}</b>`
        : `<b>🪙 ${o.price}</b>`;

      let btn: string;
      if (o.owned) btn = '<button class="shop-buy owned" disabled>OWNED ✓</button>';
      else if (!o.affordable) btn = `<button class="shop-buy" disabled>${priceLine}</button>`;
      else btn = `<button class="shop-buy" data-buy="${o.id}">Buy · ${priceLine}</button>`;

      card.innerHTML =
        `${tag}<div class="shop-top">${swatch}<div class="shop-meta">` +
        `<div class="shop-name">${item.displayName}</div>` +
        `<div class="shop-cat">${item.sub}</div></div></div>${btn}`;
      this.grid.appendChild(card);
    }

    // Wire buy buttons.
    this.grid.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.buy!;
        const res = this.account.buyShopItem(id);
        if (res === 'ok') {
          this.audio.play('pickup_powerup');
          // account.onChange → re-render flips the card to OWNED + new balance.
        } else {
          this.audio.play('ui_click');
        }
      });
    });

    if (this.foot) {
      this.foot.textContent = 'Earn 🪙 2 per kill, 25 per win, plus bonuses from daily rewards & challenges.';
    }
  }
}
