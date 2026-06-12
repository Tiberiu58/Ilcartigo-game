/**
 * MasteryToast — a light, non-intrusive toast that slides in from the right
 * when a weapon crosses into a new mastery tier (Phase 15). Distinct from the
 * center-screen Announcer (killstreak drama): mastery is a quieter "you're
 * making progress" reward that shouldn't steal the moment-to-moment focus.
 *
 * Bus-driven (listens for `masteryUp`), pure DOM, no engine coupling beyond the
 * event bus + the weapon library (for display names). A queue ensures rapid
 * back-to-back tier-ups show one after another instead of clobbering each other.
 */

import type { GameEventBus } from '../core/events';
import { WEAPON_LIBRARY } from '../weapons/Weapon';

const SHOW_MS = 2600;

interface ToastData { weaponId: string; tierName: string; color: string; reward: number; }

export class MasteryToast {
  private root: HTMLElement;
  private queue: ToastData[] = [];
  private showing = false;
  private hideTimer: number | null = null;

  constructor(bus: GameEventBus) {
    this.root = document.getElementById('mastery-toast')!;
    bus.on('masteryUp', (e) => {
      this.queue.push({ weaponId: e.weaponId, tierName: e.tierName, color: e.color, reward: e.reward });
      if (!this.showing) this.next();
    });
  }

  private next() {
    const data = this.queue.shift();
    if (!data) { this.showing = false; return; }
    this.showing = true;

    const weaponName = (WEAPON_LIBRARY as Record<string, { displayName: string }>)[data.weaponId]?.displayName
      ?? data.weaponId.toUpperCase();
    this.root.style.setProperty('--mt-color', data.color);
    this.root.innerHTML = `
      <div class="mt-badge" style="background:${data.color}"></div>
      <div class="mt-body">
        <div class="mt-title">${escapeHtml(data.tierName)} Mastery</div>
        <div class="mt-sub">${escapeHtml(weaponName)} · +${data.reward} XP</div>
      </div>`;

    this.root.classList.remove('hidden');
    // Restart the slide-in animation.
    this.root.classList.remove('mt-in');
    void this.root.offsetWidth;
    this.root.classList.add('mt-in');

    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.classList.add('hidden');
      this.root.classList.remove('mt-in');
      // Chain the next queued toast (if any) after a short gap.
      window.setTimeout(() => this.next(), 220);
    }, SHOW_MS);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
