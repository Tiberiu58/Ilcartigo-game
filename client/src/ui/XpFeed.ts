/**
 * XpFeed — in-the-moment progression feedback.
 *
 * The XP economy already exists (kills, wins, daily-challenge claims all feed
 * `Account.xp`), but it was silent — players never *felt* it. This surfaces it
 * the Krunker way: a small "+N XP" popup on every gain while you're in a match,
 * and a full-screen "LEVEL UP" celebration when your level ticks over.
 *
 * Purely reactive + decoupled: it listens to `account.onChange`, diffs XP +
 * level against the last seen values, and renders DOM. No engine coupling beyond
 * the account, the audio manager, and an `isInGame()` predicate (so we don't
 * spam popups while you're clicking around menus — the level-up banner still
 * fires anywhere, since that moment is always worth celebrating).
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';

export class XpFeed {
  private account: Account;
  private audio: AudioManager;
  private isInGame: () => boolean;
  private feedEl: HTMLElement;
  private bannerEl: HTMLElement;
  private lastXp: number;
  private lastLevel: number;
  private bannerTimer = 0;

  constructor(account: Account, audio: AudioManager, isInGame: () => boolean) {
    this.account = account;
    this.audio = audio;
    this.isInGame = isInGame;
    this.feedEl = document.getElementById('xp-feed')!;
    this.bannerEl = document.getElementById('levelup-banner')!;
    this.lastXp = account.xp;
    this.lastLevel = account.level;
    account.onChange(() => this.onChange());
  }

  private onChange() {
    const xp = this.account.xp;
    const level = this.account.level;
    const delta = xp - this.lastXp;
    // Positive deltas only (spending XP on unlocks shouldn't pop a popup).
    if (delta > 0 && this.isInGame()) this.popup(`+${delta} XP`);
    if (level > this.lastLevel) this.levelUp(level);
    this.lastXp = xp;
    this.lastLevel = level;
  }

  private popup(text: string) {
    const el = document.createElement('div');
    el.className = 'xp-pop';
    el.textContent = text;
    this.feedEl.appendChild(el);
    // Self-remove after the CSS rise/fade completes; cap stack size defensively.
    window.setTimeout(() => el.remove(), 1100);
    while (this.feedEl.childElementCount > 6) this.feedEl.firstElementChild?.remove();
  }

  private levelUp(level: number) {
    this.bannerEl.innerHTML = `<span class="lu-tag">LEVEL UP</span><span class="lu-num">${level}</span>`;
    this.bannerEl.classList.remove('hidden', 'show');
    void this.bannerEl.offsetWidth; // reflow so the animation restarts
    this.bannerEl.classList.add('show');
    this.audio.play('level_up');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.bannerEl.classList.add('hidden');
    }, 2600);
  }
}
