/**
 * Rewards — makes progression *visible* moment-to-moment.
 *
 * Two pieces of feedback, both driven off Account mutations:
 *   1. Floating "+N XP" popups (in-HUD, stacked) whenever XP increases — the
 *      instant dopamine that ties every kill / bonus / claim back to the
 *      progression loop.
 *   2. A center-top LEVEL UP banner + sound whenever the derived level climbs.
 *      Shown above everything (even the post-match / game-over overlays) since
 *      end-of-match bonuses are a common level-up moment.
 *
 * Pure DOM, account-driven, no protocol involvement — a retention layer that
 * costs nothing at runtime and pulls players back (return visits = ad views).
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';

const XP_POPUP_TTL = 1400;   // ms before a popup is removed
const XP_POPUP_MAX = 5;      // cap concurrent popups so a big claim can't flood

export class Rewards {
  private account: Account;
  private audio: AudioManager;
  private popupHost: HTMLElement;
  private levelBanner: HTMLElement;
  private levelText: HTMLElement;

  private lastXp: number;
  private lastLevel: number;
  private bannerTimer: number | null = null;

  constructor(account: Account, audio: AudioManager) {
    this.account = account;
    this.audio = audio;
    this.popupHost = document.getElementById('xp-popups')!;
    this.levelBanner = document.getElementById('levelup-banner')!;
    this.levelText = document.getElementById('levelup-text')!;

    this.lastXp = account.xp;
    this.lastLevel = account.level;

    account.onChange(() => this.onAccountChange());
  }

  private onAccountChange() {
    const xp = this.account.xp;
    const level = this.account.level;

    const dXp = xp - this.lastXp;
    if (dXp > 0) this.spawnXpPopup(dXp);
    if (level > this.lastLevel) this.showLevelUp(level);

    this.lastXp = xp;
    this.lastLevel = level;
  }

  /** Float a "+N XP" chip up from the stack, auto-removing after its TTL. */
  private spawnXpPopup(amount: number) {
    // Cap concurrent popups — drop the oldest if we're at the limit.
    while (this.popupHost.children.length >= XP_POPUP_MAX) {
      this.popupHost.removeChild(this.popupHost.firstChild!);
    }
    const el = document.createElement('div');
    el.className = 'xp-popup';
    el.textContent = `+${amount} XP`;
    this.popupHost.appendChild(el);
    window.setTimeout(() => { if (el.parentElement) el.parentElement.removeChild(el); }, XP_POPUP_TTL);
  }

  /** Flash the center-top LEVEL UP banner + play the sting. */
  private showLevelUp(level: number) {
    this.levelText.textContent = `LEVEL ${level}`;
    this.levelBanner.classList.remove('hidden', 'show');
    // Force reflow so the entrance animation restarts on a back-to-back level-up.
    void this.levelBanner.offsetWidth;
    this.levelBanner.classList.add('show');
    this.audio.play('level_up');
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.levelBanner.classList.remove('show');
      this.levelBanner.classList.add('hidden');
    }, 2600);
  }
}
