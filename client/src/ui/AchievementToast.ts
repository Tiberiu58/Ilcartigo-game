/**
 * AchievementToast — a prominent "MEDAL UNLOCKED" banner.
 *
 * Achievements are rare, earned moments, so (unlike the lightweight ScorePopup)
 * they get a queued, one-at-a-time slide-in card with the medal icon, name, and
 * the bonus XP — the flashy reward beat that makes the grind feel worth it.
 *
 * Static API + internal queue so multiple medals earned in one frame show in
 * sequence rather than stacking. Mounts into #achievement-toasts; no-ops if the
 * host is missing.
 */

import type { AchievementDef } from '../account/Achievements';

interface QueueItem {
  def: AchievementDef;
  onShow?: () => void;
}

const SHOW_MS = 3600;
const queue: QueueItem[] = [];
let showing = false;

function drain() {
  if (showing) return;
  const item = queue.shift();
  if (!item) return;
  const host = document.getElementById('achievement-toasts');
  if (!host) { queue.length = 0; return; }
  showing = true;
  item.onShow?.();

  const el = document.createElement('div');
  el.className = `ach-toast ach-toast-${item.def.tier}`;
  el.innerHTML = `
    <div class="ach-toast-icon">${item.def.icon}</div>
    <div class="ach-toast-body">
      <div class="ach-toast-kicker">MEDAL UNLOCKED</div>
      <div class="ach-toast-name">${escapeHtml(item.def.name)}</div>
      <div class="ach-toast-desc">${escapeHtml(item.def.desc)} · +${item.def.reward} XP</div>
    </div>`;
  host.appendChild(el);
  // Trigger the enter transition on the next frame.
  requestAnimationFrame(() => el.classList.add('ach-toast-in'));

  window.setTimeout(() => {
    el.classList.remove('ach-toast-in');
    el.classList.add('ach-toast-out');
    window.setTimeout(() => {
      if (el.parentElement) el.parentElement.removeChild(el);
      showing = false;
      drain();
    }, 350);
  }, SHOW_MS);
}

export const AchievementToast = {
  /** Queue a medal banner. `onShow` fires when it actually appears (for SFX). */
  show(def: AchievementDef, onShow?: () => void) {
    queue.push({ def, onShow });
    drain();
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
