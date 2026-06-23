/**
 * CrateUI — the crate/spin overlay.
 *
 * Drives the "🎁 CRATES" overlay: shows the key balance, a free-daily-crate
 * claim, the odds, and — the centrepiece — an animated horizontal reel that
 * scrolls through random cosmetics and decelerates onto the winning drop, then
 * reveals a result card (NEW UNLOCK + Equip, or DUPLICATE → XP refund).
 *
 * All grant/refund logic lives in `account/Crates.ts`; this file is presentation
 * + the spin animation only. Account is the source of truth — every mutation
 * goes through it and fires `account.onChange`, so the rest of the UI (XP bars,
 * cosmetics tab, equipped viewmodel finish) updates for free.
 */

import type { Account, CosmeticAxis } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';
import {
  buildReel, openCrate, RARITY_META, type CrateItem, type CrateResult,
} from '../account/Crates';

const REEL_LEN = 44;
const LAND_INDEX = 38;
const CARD_STRIDE = 130;   // must match .crate-reel-item width(120) + 2×margin(5)
const CARD_WIDTH = 120;
const SPIN_MS = 4200;

const AXIS_LABEL: Record<CosmeticAxis, string> = {
  skin: 'Player Skin',
  effect: 'Kill Effect',
  tracer: 'Bullet Tracer',
  finish: 'Weapon Finish',
};

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export class CrateUI {
  private account: Account;
  private audio: AudioManager;

  private overlay: HTMLElement;
  private sub: HTMLElement;
  private keysLine: HTMLElement;
  private window: HTMLElement;
  private reel: HTMLElement;
  private result: HTMLElement;
  private openBtn: HTMLButtonElement;
  private freeBtn: HTMLButtonElement;
  private odds: HTMLElement;

  private spinning = false;

  constructor(account: Account, audio: AudioManager) {
    this.account = account;
    this.audio = audio;
    this.overlay = document.getElementById('crate-overlay')!;
    this.sub = document.getElementById('crate-sub')!;
    this.keysLine = document.getElementById('crate-keys-line')!;
    this.window = document.getElementById('crate-reel-window')!;
    this.reel = document.getElementById('crate-reel')!;
    this.result = document.getElementById('crate-result')!;
    this.openBtn = document.getElementById('crate-open') as HTMLButtonElement;
    this.freeBtn = document.getElementById('crate-free') as HTMLButtonElement;
    this.odds = document.getElementById('crate-odds')!;
    const dismiss = document.getElementById('crate-dismiss') as HTMLButtonElement;

    this.openBtn.addEventListener('click', () => this.spin());
    this.freeBtn.addEventListener('click', () => this.claimFree());
    dismiss.addEventListener('click', () => { if (!this.spinning) this.close(); });

    this.renderOdds();
    // Keep key counts / button states fresh as XP (→ keys) changes elsewhere.
    this.account.onChange(() => { if (!this.overlay.classList.contains('hidden')) this.refresh(); });
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  open() {
    this.result.classList.add('hidden');
    this.reel.replaceChildren();
    this.reel.style.transition = 'none';
    this.reel.style.transform = 'translateX(0)';
    this.refresh();
    this.overlay.classList.remove('hidden');
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  isOpen(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  // ── State render ──────────────────────────────────────────────────────────

  private refresh() {
    const keys = this.account.crateKeys;
    this.keysLine.innerHTML = `<span class="crate-key-icon">🔑</span> <b>${keys}</b> ${keys === 1 ? 'key' : 'keys'}`;
    this.openBtn.disabled = this.spinning || keys <= 0;
    this.openBtn.textContent = keys > 0 ? '▸ Open Crate (1 🔑)' : 'No keys — level up to earn';

    const free = this.account.freeCrateAvailable();
    this.freeBtn.disabled = this.spinning || !free;
    this.freeBtn.textContent = free ? '🎁 Claim free daily crate' : 'Free crate claimed ✓';

    if (!this.spinning) {
      this.sub.textContent = keys > 0
        ? 'Open a crate to unlock a random cosmetic — skins, kill effects, tracers & finishes.'
        : 'Earn keys by levelling up. Come back daily for a free crate.';
    }
  }

  private renderOdds() {
    const order = ['common', 'rare', 'epic', 'legendary'] as const;
    this.odds.replaceChildren();
    for (const r of order) {
      const m = RARITY_META[r];
      const chip = document.createElement('span');
      chip.className = 'crate-odd';
      chip.style.color = m.css;
      chip.innerHTML = `<i style="background:${m.css}"></i>${m.label}`;
      this.odds.appendChild(chip);
    }
  }

  // ── Free daily crate ──────────────────────────────────────────────────────

  private claimFree() {
    if (this.spinning) return;
    if (this.account.claimFreeCrate()) {
      this.audio.play('level_up');
      this.refresh();
    } else {
      this.audio.play('ui_click');
    }
  }

  // ── Spin ──────────────────────────────────────────────────────────────────

  private spin() {
    if (this.spinning) return;
    if (!this.account.spendCrateKey()) { this.audio.play('ui_click'); return; }

    this.spinning = true;
    this.result.classList.add('hidden');
    this.refresh();

    // Decide the drop first, then build a reel that lands on it.
    const res: CrateResult = openCrate(this.account);
    const strip = buildReel(res.item, REEL_LEN, LAND_INDEX);
    this.reel.replaceChildren();
    for (const it of strip) this.reel.appendChild(this.makeCard(it));

    // Reset to start, then animate to the landed card on the next frame.
    this.reel.style.transition = 'none';
    this.reel.style.transform = 'translateX(0)';
    void this.reel.offsetWidth;   // force reflow so the reset applies

    const winW = this.window.getBoundingClientRect().width;
    const jitter = (Math.random() - 0.5) * CARD_STRIDE * 0.5;
    const finalX = -(LAND_INDEX * CARD_STRIDE + CARD_WIDTH / 2 - winW / 2 + jitter);

    this.sub.textContent = 'Opening…';
    this.audio.play('crate_spin');

    requestAnimationFrame(() => {
      this.reel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.12, 1)`;
      this.reel.style.transform = `translateX(${finalX}px)`;
    });

    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      this.reel.removeEventListener('transitionend', finish);
      this.spinning = false;
      this.reveal(res);
      this.refresh();
    };
    this.reel.addEventListener('transitionend', finish);
    // Safety net in case transitionend doesn't fire (tab backgrounded, etc).
    timer = window.setTimeout(finish, SPIN_MS + 400);
  }

  private makeCard(it: CrateItem): HTMLElement {
    const m = RARITY_META[it.rarity];
    const card = document.createElement('div');
    card.className = `crate-reel-item rar-${it.rarity}`;
    card.style.setProperty('--rar', m.css);
    card.innerHTML = `<div class="cri-swatch" style="background:${hex(it.swatch)}"></div>`
      + `<div class="cri-name">${it.name}</div>`;
    return card;
  }

  // ── Reveal ────────────────────────────────────────────────────────────────

  private reveal(res: CrateResult) {
    const { item, duplicate, xpRefund } = res;
    const m = RARITY_META[item.rarity];
    this.audio.play(item.rarity === 'legendary' ? 'level_up' : 'crate_reveal');

    const lines: string[] = [];
    lines.push(`<div class="crate-res-rarity" style="color:${m.css}">${m.label}</div>`);
    lines.push(`<div class="crate-res-swatch" style="background:${hex(item.swatch)};box-shadow:0 0 26px ${m.css}"></div>`);
    lines.push(`<div class="crate-res-name">${item.name}</div>`);
    lines.push(`<div class="crate-res-axis">${AXIS_LABEL[item.axis]}</div>`);
    if (duplicate) {
      lines.push(`<div class="crate-res-tag dup">DUPLICATE · +${xpRefund} XP</div>`);
    } else {
      lines.push(`<div class="crate-res-tag new">★ NEW UNLOCK ★</div>`);
    }

    const actions = document.createElement('div');
    actions.className = 'crate-res-actions';
    if (!duplicate) {
      const equip = document.createElement('button');
      equip.className = 'menu-btn primary';
      equip.textContent = 'Equip';
      equip.addEventListener('click', () => {
        this.equip(item);
        equip.textContent = 'Equipped ✓';
        equip.disabled = true;
        this.audio.play('ui_click');
      });
      actions.appendChild(equip);
    }
    const again = document.createElement('button');
    again.className = 'menu-btn';
    again.textContent = this.account.crateKeys > 0 ? `Open another (${this.account.crateKeys} 🔑)` : 'No keys left';
    again.disabled = this.account.crateKeys <= 0;
    again.addEventListener('click', () => { this.audio.play('ui_click'); this.spin(); });
    actions.appendChild(again);

    this.result.innerHTML = lines.join('');
    this.result.appendChild(actions);
    this.result.className = `crate-result rar-${item.rarity}`;
    this.result.classList.remove('hidden');
  }

  private equip(item: CrateItem) {
    switch (item.axis) {
      case 'skin':   this.account.equipSkin(item.id); break;
      case 'effect': this.account.equipKillEffect(item.id); break;
      case 'tracer': this.account.equipTracer(item.id); break;
      case 'finish': this.account.equipFinish(item.id); break;
    }
  }
}
