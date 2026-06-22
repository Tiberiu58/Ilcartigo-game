/**
 * AchievementToast — slide-in "ACHIEVEMENT UNLOCKED" cards.
 *
 * Subscribes to Account achievement unlocks and pops a medal toast (glyph,
 * title + tier, reward) bottom-right, queued so simultaneous unlocks show one
 * after another rather than stacking on top of each other. Plays a chime.
 *
 * Pure DOM + account + audio, mirroring the no-engine-coupling UI style.
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';
import { TIER_LABELS, type AchievementUnlock } from '../account/Achievements';

/** How long each toast stays fully visible before sliding out (ms). */
const HOLD_MS = 3600;
/** Slide-in/out animation duration (must match the CSS). */
const ANIM_MS = 420;

export class AchievementToast {
  private root: HTMLElement;
  private audio: AudioManager;
  private queue: AchievementUnlock[] = [];
  private showing = false;

  constructor(account: Account, audio: AudioManager) {
    this.audio = audio;
    this.root = document.getElementById('achievement-toasts')!;
    account.onAchievement((u) => this.enqueue(u));
  }

  private enqueue(u: AchievementUnlock) {
    this.queue.push(u);
    if (!this.showing) this.pump();
  }

  private pump() {
    const u = this.queue.shift();
    if (!u) { this.showing = false; return; }
    this.showing = true;

    const tierLabel = TIER_LABELS[u.tierIndex] ?? String(u.tierIndex + 1);
    const goal = u.ach.tiers[u.tierIndex]?.goal ?? 0;

    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.style.setProperty('--ach-color', u.ach.color);
    el.innerHTML =
      `<span class="ach-glyph">${u.ach.glyph}</span>` +
      `<span class="ach-body">` +
        `<span class="ach-kicker">ACHIEVEMENT UNLOCKED</span>` +
        `<span class="ach-title">${u.ach.name} <em>${tierLabel}</em></span>` +
        `<span class="ach-sub">${goal.toLocaleString()} ${u.ach.unit} · +${u.reward} XP</span>` +
      `</span>`;
    this.root.appendChild(el);

    // Trigger slide-in on the next frame.
    requestAnimationFrame(() => el.classList.add('ach-in'));
    this.audio.play('achievement');

    window.setTimeout(() => {
      el.classList.remove('ach-in');
      el.classList.add('ach-out');
      window.setTimeout(() => {
        if (el.parentElement) el.parentElement.removeChild(el);
        // Show the next queued unlock (if any).
        this.pump();
      }, ANIM_MS);
    }, HOLD_MS);
  }
}
