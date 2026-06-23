/**
 * ProgressionFX — the visible, juicy side of progression.
 *
 * Three jobs, all client-only and account-driven:
 *
 *   1. Rank badges. A small badge on the HUD (in-game) and on the main menu
 *      shows the player's level + rank tier (name, glyph, colour). They re-sync
 *      whenever the account mutates (XP gain, unlock, reset).
 *
 *   2. Level-up celebration. When XP crosses a 1000-XP level boundary, a
 *      full-screen banner pops ("LEVEL UP · Lv N · RANK") with a sound sting.
 *      Spending XP on an unlock can drop the level — we only celebrate on a
 *      net increase, and silently re-sync the badge on a decrease.
 *
 *   3. Floating "+XP" reward popups. Every local kill floats a "+10 XP" chip
 *      near the crosshair that drifts up + fades — instant dopamine-tight
 *      feedback (the Krunker staple). Also exposed as a public method so the
 *      post-match / challenge flows can float their own rewards.
 *
 * Pure DOM + bus + account. Mirrors Announcer/HUD's no-engine-coupling style.
 */

import type { Account } from '../account/Account';
import type { AudioManager } from '../audio/AudioManager';
import type { GameEventBus } from '../core/events';
import { rankForLevel, rankProgress } from '../account/Ranks';

/** How long a level-up banner stays up before fading (ms). */
const LEVELUP_HOLD_MS = 2200;

export class ProgressionFX {
  private account: Account;
  private audio: AudioManager;

  private hudBadge: HTMLElement;
  private menuBadge: HTMLElement;
  private banner: HTMLElement;
  private bannerLevel: HTMLElement;
  private bannerRank: HTMLElement;
  private bannerCrate: HTMLElement;
  private popups: HTMLElement;

  /** Last level we rendered — used to detect crossings without celebrating on
   *  XP spends (level can go down when buying an unlock). */
  private lastLevel: number;
  private bannerHideTimer: number | null = null;

  constructor(
    account: Account,
    audio: AudioManager,
    bus: GameEventBus,
    isLocalPlayer: (id: string) => boolean,
  ) {
    this.account = account;
    this.audio = audio;

    this.hudBadge = document.getElementById('rank-badge')!;
    this.menuBadge = document.getElementById('menu-rank')!;
    this.banner = document.getElementById('levelup-banner')!;
    this.bannerLevel = document.getElementById('lu-level')!;
    this.bannerRank = document.getElementById('lu-rank')!;
    this.bannerCrate = document.getElementById('lu-crate')!;
    this.popups = document.getElementById('reward-popups')!;

    this.lastLevel = account.level;
    this.syncBadges();

    // React to every account mutation: re-sync badges, and celebrate a real
    // level-up (net increase only).
    account.onChange(() => {
      const level = this.account.level;
      if (level > this.lastLevel) {
        // Could jump multiple levels from a big challenge reward — celebrate
        // the final landing level (one banner, not N). Each level crossed
        // banks one crate key (Account.creditLevelKeys), so surface that too.
        this.celebrateLevelUp(level, level - this.lastLevel);
      }
      this.lastLevel = level;
      this.syncBadges();
    });

    // Local kills → floating "+XP" chip. Skip suicides/falls (no attacker, or
    // attacker == victim) so we never reward a self-elimination.
    bus.on('kill', (e) => {
      if (isLocalPlayer(e.attackerId) && !isLocalPlayer(e.targetId)) {
        this.rewardPopup(`+10 XP${e.isHeadshot ? ' · HS' : ''}`, e.isHeadshot ? '#ff6a8a' : '#ffd24a');
      }
    });

    // Weapon mastery unlock → a distinct reward chip in the skin's colour.
    bus.on('masteryUnlock', (e) => {
      const hex = '#' + (e.color & 0xffffff).toString(16).padStart(6, '0');
      this.rewardPopup(`${e.weaponId.toUpperCase()} SKIN: ${e.skinName}`, hex);
    });
  }

  /** Refresh the HUD + menu rank badges from the current level. */
  private syncBadges() {
    const level = this.account.level;
    const rank = rankForLevel(level);
    const prog = rankProgress(level);
    const html =
      `<span class="rb-glyph" style="color:${rank.color}">${rank.glyph}</span>` +
      `<span class="rb-text"><span class="rb-lvl">Lv ${level}</span>` +
      `<span class="rb-rank" style="color:${rank.color}">${rank.name}</span></span>` +
      `<span class="rb-prog"><span class="rb-prog-fill" style="width:${(prog * 100).toFixed(0)}%;background:${rank.color}"></span></span>`;
    this.hudBadge.innerHTML = html;
    this.menuBadge.innerHTML = html;
  }

  /** Pop the full-screen level-up banner + play the sting. `keysGained` is the
   *  number of crate keys banked by crossing this level boundary (≥1). */
  private celebrateLevelUp(level: number, keysGained = 1) {
    const rank = rankForLevel(level);
    this.bannerLevel.textContent = `LEVEL ${level}`;
    this.bannerRank.textContent = rank.name;
    this.bannerRank.style.color = rank.color;
    this.banner.style.setProperty('--lu-color', rank.color);

    // Surface the crate key(s) earned — the level-up is exactly when keys bank.
    if (keysGained > 0) {
      this.bannerCrate.textContent = `+${keysGained} 🔑 CRATE KEY${keysGained > 1 ? 'S' : ''}`;
      this.bannerCrate.classList.remove('hidden');
      this.rewardPopup(`+${keysGained} 🔑 CRATE`, '#c98bff');
    } else {
      this.bannerCrate.classList.add('hidden');
    }

    this.banner.classList.remove('hidden', 'lu-pop');
    // Force reflow so the pop animation restarts on consecutive level-ups.
    void this.banner.offsetWidth;
    this.banner.classList.add('lu-pop');

    this.audio.play('level_up');

    if (this.bannerHideTimer !== null) window.clearTimeout(this.bannerHideTimer);
    this.bannerHideTimer = window.setTimeout(() => {
      this.banner.classList.add('hidden');
      this.banner.classList.remove('lu-pop');
    }, LEVELUP_HOLD_MS);
  }

  /**
   * Float a reward chip near the crosshair that drifts up + fades. Public so
   * the post-match win bonus / daily-challenge claim can reuse it. A tiny
   * horizontal jitter stops stacked kills from perfectly overlapping.
   */
  rewardPopup(text: string, color = '#ffd24a') {
    const el = document.createElement('div');
    el.className = 'reward-chip';
    el.textContent = text;
    el.style.color = color;
    el.style.setProperty('--rp-jitter', `${(Math.random() * 2 - 1) * 26}px`);
    this.popups.appendChild(el);
    // Remove after the CSS animation completes (1.1s).
    window.setTimeout(() => { if (el.parentElement) el.parentElement.removeChild(el); }, 1150);
  }
}
