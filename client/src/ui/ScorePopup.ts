/**
 * ScorePopup — small floating "+N" toasts for instant, visible progression.
 *
 * Krunker pops a score number on every frag; ILCARTIGO now does too — plus a
 * green "+HP" on health-pack grabs. Deliberately tasteful (one short toast that
 * drifts up + fades) so it complements, not drowns, the kill marker / announcer.
 *
 * Static API so any system (main.ts kill handler, PickupManager) can fire one
 * without holding an instance. Toasts mount into #score-popups (a HUD child);
 * if it's missing we no-op silently.
 */

const MAX_ON_SCREEN = 6;

export const ScorePopup = {
  /** Spawn a floating toast. `cls` picks the colour theme (xp | heal | buff). */
  pop(text: string, cls: 'xp' | 'heal' | 'buff' = 'xp') {
    const host = document.getElementById('score-popups');
    if (!host) return;
    const el = document.createElement('div');
    el.className = `score-pop score-pop-${cls}`;
    el.textContent = text;
    host.appendChild(el);
    // Cap concurrent toasts (oldest first) so a kill spree can't flood the DOM.
    while (host.children.length > MAX_ON_SCREEN) host.removeChild(host.firstChild!);
    // Remove after the CSS animation finishes.
    window.setTimeout(() => { if (el.parentElement) el.parentElement.removeChild(el); }, 900);
  },
};
