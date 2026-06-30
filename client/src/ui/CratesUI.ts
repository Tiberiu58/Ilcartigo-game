/**
 * CratesUI — the loot-crate shop + reveal overlay.
 *
 * Renders the Coin balance, drop odds, collection progress, and an Open button;
 * opening spends Coins, rolls a crate (account/Crates), commits the result, and
 * plays a flashy rarity-tiered reveal animation in the stage. Self-contained:
 * builds all dynamic DOM in code, drives sounds through the passed AudioManager,
 * and stays live via account.onChange while open.
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';
import {
  CRATE_COST, RARITY_META, RARITY_ORDER, POOL_SIZE,
  openCrate, applyCrateResult, lockedCounts, totalLocked, kindLabel,
  type CrateResult,
} from '../account/Crates';

export class CratesUI {
  private account: Account;
  private audio: AudioManager;
  private overlay: HTMLElement;
  private coinsEl: HTMLElement;
  private stageEl: HTMLElement;
  private oddsEl: HTMLElement;
  private progressEl: HTMLElement;
  private openBtn: HTMLButtonElement;
  /** Guards the ~900 ms reveal animation from overlapping opens. */
  private opening = false;
  private revealTimer = 0;

  constructor(account: Account, audio: AudioManager) {
    this.account = account;
    this.audio = audio;
    this.overlay = document.getElementById('crates-overlay')!;
    this.coinsEl = document.getElementById('crates-coins')!;
    this.stageEl = document.getElementById('crates-stage')!;
    this.oddsEl = document.getElementById('crates-odds')!;
    this.progressEl = document.getElementById('crates-progress')!;
    this.openBtn = document.getElementById('crates-open') as HTMLButtonElement;

    this.openBtn.addEventListener('click', () => this.open());
    document.getElementById('crates-dismiss')!.addEventListener('click', () => {
      this.hide();
      this.audio.play('ui_click');
    });
    // Keep the balance/odds live if Coins change while the panel is open.
    this.account.onChange(() => { if (!this.overlay.classList.contains('hidden')) this.renderShop(); });
  }

  show() {
    this.resetStage();
    this.renderShop();
    this.overlay.classList.remove('hidden');
  }
  hide() {
    if (this.revealTimer) { clearTimeout(this.revealTimer); this.revealTimer = 0; }
    this.opening = false;
    this.overlay.classList.add('hidden');
  }

  // ── Shop chrome (balance / odds / progress / button) ──────────────────────

  private renderShop() {
    this.coinsEl.textContent = this.account.coins.toLocaleString();

    const counts = lockedCounts(this.account);
    this.oddsEl.replaceChildren();
    for (const r of RARITY_ORDER) {
      const m = RARITY_META[r];
      const row = document.createElement('div');
      row.className = 'crate-odd';
      const pct = Math.round((m.weight / 100) * 100);
      row.innerHTML =
        `<span class="crate-odd-dot" style="background:${m.color};box-shadow:0 0 8px ${m.color}"></span>` +
        `<span class="crate-odd-name" style="color:${m.color}">${m.label}</span>` +
        `<span class="crate-odd-pct">${pct}%</span>` +
        `<span class="crate-odd-left">${counts[r]} left</span>`;
      this.oddsEl.appendChild(row);
    }

    const owned = POOL_SIZE - totalLocked(this.account);
    this.progressEl.textContent = `Collection ${owned} / ${POOL_SIZE} unlocked`;

    const canAfford = this.account.coins >= CRATE_COST;
    this.openBtn.disabled = this.opening || !canAfford;
    this.openBtn.textContent = this.opening
      ? 'Opening…'
      : canAfford ? `▸ Open Crate · ${CRATE_COST} ⛁`
      : `Need ${CRATE_COST} ⛁ (${(CRATE_COST - this.account.coins).toLocaleString()} more)`;
  }

  private resetStage() {
    this.stageEl.className = 'crates-stage';
    this.stageEl.innerHTML =
      `<div class="crate-box idle">📦</div>` +
      `<div class="crate-hint">Open for a random skin · effect · tracer · finish</div>`;
  }

  // ── Open + reveal ─────────────────────────────────────────────────────────

  private open() {
    if (this.opening) return;
    if (this.account.coins < CRATE_COST) { this.audio.play('ui_click'); return; }
    if (!this.account.spendCoins(CRATE_COST)) { this.audio.play('ui_click'); return; }

    this.opening = true;
    const res = openCrate(this.account);
    applyCrateResult(this.account, res); // grants cosmetic + bonus Coins (persists)

    // Stage-1: a shaking, building crate.
    this.stageEl.className = 'crates-stage opening';
    this.stageEl.innerHTML = `<div class="crate-box shake">📦</div>`;
    this.audio.play('pickup_powerup');
    this.renderShop(); // button → "Opening…", balance already debited

    this.revealTimer = window.setTimeout(() => this.reveal(res), 780);
  }

  private reveal(res: CrateResult) {
    this.revealTimer = 0;
    this.opening = false;
    const rar = RARITY_META[res.rarity];

    if (!res.item) {
      // Whole collection complete — Coins payout.
      this.stageEl.className = 'crates-stage revealed rar-rare';
      this.stageEl.innerHTML =
        `<div class="crate-burst" style="--rar:${rar.color}"></div>` +
        `<div class="crate-reveal">` +
          `<div class="crate-rar" style="color:${rar.color}">COLLECTION COMPLETE</div>` +
          `<div class="crate-swatch" style="background:#ffd34a;box-shadow:0 0 26px #ffd34a"></div>` +
          `<div class="crate-item-name">All cosmetics unlocked!</div>` +
          `<div class="crate-coins">+${res.coins} ⛁ Coins</div>` +
        `</div>`;
      this.audio.play('pickup_health');
      this.renderShop();
      return;
    }

    const it = res.item;
    const hex = '#' + it.color.toString(16).padStart(6, '0');
    this.stageEl.className = `crates-stage revealed rar-${res.rarity}`;
    this.stageEl.innerHTML =
      `<div class="crate-burst" style="--rar:${rar.color}"></div>` +
      `<div class="crate-reveal">` +
        `<div class="crate-rar" style="color:${rar.color};text-shadow:0 0 12px ${rar.color}">${rar.label}</div>` +
        `<div class="crate-swatch" style="background:${hex};box-shadow:0 0 26px ${hex}"></div>` +
        `<div class="crate-new">NEW</div>` +
        `<div class="crate-item-name">${it.name}</div>` +
        `<div class="crate-item-kind">${kindLabel(it.kind)}</div>` +
        `<div class="crate-coins">+${res.coins} ⛁ bonus</div>` +
      `</div>`;

    // Bigger sting for epic+, lighter for common/rare.
    this.audio.play(res.rarity === 'legendary' || res.rarity === 'epic' ? 'match_end' : 'level_up');
    this.renderShop();
  }
}
