/**
 * RewardToast — the little "you earned a perk" notice for killstreak rewards
 * (Phase 15). Pops in, holds, fades. Kept separate from the Announcer banner so
 * a reward and a streak callout ("RAMPAGE") can show at the same time without
 * fighting over one DOM node.
 *
 * Pure DOM. Driven by StreakRewards.onReward via main.ts.
 */

import type { StreakReward } from '../core/StreakRewards';

const HOLD_MS = 2200;

export class RewardToast {
  private root: HTMLElement;
  private nameEl: HTMLElement;
  private perksEl: HTMLElement;
  private hideTimer: number | null = null;

  constructor() {
    this.root = document.getElementById('streak-reward')!;
    this.nameEl = document.getElementById('sr-name')!;
    this.perksEl = document.getElementById('sr-perks')!;
  }

  show(r: StreakReward) {
    this.nameEl.textContent = r.name;
    this.nameEl.style.color = r.color;
    this.perksEl.textContent = r.perks;
    this.root.style.setProperty('--sr-accent', r.color);

    this.root.classList.remove('hidden');
    // Restart the pop animation.
    this.root.classList.remove('sr-pop');
    void this.root.offsetWidth;
    this.root.classList.add('sr-pop');

    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), HOLD_MS);
  }

  hide() {
    this.root.classList.add('hidden');
    this.root.classList.remove('sr-pop');
    if (this.hideTimer !== null) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
  }
}
