/**
 * Announcer — Krunker/Unreal-style killstreak + multi-kill feedback.
 *
 * Two independent escalations, both tracked for the LOCAL player only:
 *
 *   1. Multi-kill: kills landed within MULTIKILL_WINDOW of each other chain
 *      into Double → Triple → Quad → Mega → Monster Kill. The window resets
 *      every kill, so a steady stream keeps climbing; a pause drops you back
 *      to single kills. This is the punchy, moment-to-moment hit.
 *
 *   2. Killstreak: consecutive kills since your last death. Milestones at
 *      3/5/7/10/15/20+ ("Killing Spree" … "Godlike"). Dying resets it. This
 *      is the longer-arc bragging-rights track.
 *
 * The big center banner shows whichever event just fired (multi-kill takes
 * the headline when both pop on the same kill); the streak rides the subline.
 * Each tier has its own sound id (escalating), played via the AudioManager —
 * silently skipped if the .wav isn't present, like all game audio.
 *
 * Pure DOM + bus-driven, mirroring HUD/DamageNumbers. No engine coupling
 * beyond `isLocalPlayer` + the event bus + the audio manager.
 */

import type { GameEventBus } from '../core/events';
import type { AudioManager, SoundId } from '../audio/AudioManager';

/** A local kill chains into the current multi-kill if it lands within this. */
const MULTIKILL_WINDOW = 3.5; // seconds (Krunker is ~tight; this is forgiving)
/** How long a banner stays fully up before fading. */
const BANNER_HOLD_MS = 1400;

interface Tier {
  /** Headline text. */
  text: string;
  /** Accent color for the banner (hex string). */
  color: string;
  /** Sound to play (best-effort; silent if asset missing). */
  sound: SoundId;
  /** Relative font scale for escalation. */
  scale: number;
}

// Multi-kill tiers, indexed by chain count (2..). Anything past the table uses
// the last entry.
const MULTIKILL_TIERS: Record<number, Tier> = {
  2: { text: 'DOUBLE KILL',  color: '#ffd24a', sound: 'multi_double',  scale: 1.0 },
  3: { text: 'TRIPLE KILL',  color: '#ff9a3a', sound: 'multi_triple',  scale: 1.1 },
  4: { text: 'QUAD KILL',    color: '#ff6a3a', sound: 'multi_quad',    scale: 1.2 },
  5: { text: 'MEGA KILL',    color: '#ff4a6e', sound: 'multi_mega',    scale: 1.3 },
  6: { text: 'MONSTER KILL', color: '#c84aff', sound: 'multi_monster', scale: 1.4 },
};

// One-off "special" callouts. These take the headline over multi/streak when
// they fire (they're rarer + more dramatic), with the multi/streak riding the
// subline. First Blood = first kill of the match (by anyone — Krunker style).
// Revenge = you killed whoever last killed you. Comeback = a kill after dying
// COMEBACK_DEATHS+ times since your last one.
const SPECIAL_TIERS = {
  firstBlood: { text: 'FIRST BLOOD', color: '#ff3b3b', sound: 'first_blood' as SoundId, scale: 1.4 },
  revenge:    { text: 'REVENGE',     color: '#ffb020', sound: 'revenge' as SoundId,     scale: 1.3 },
  comeback:   { text: 'COMEBACK',    color: '#4ad6ff', sound: 'comeback' as SoundId,    scale: 1.3 },
} satisfies Record<string, Tier>;

/** Deaths since your last kill needed before the next kill counts as a Comeback. */
const COMEBACK_DEATHS = 3;

// Killstreak milestones (consecutive kills without dying). Only fires AT these
// exact counts.
const STREAK_TIERS: Record<number, Tier> = {
  3:  { text: 'KILLING SPREE', color: '#ffd24a', sound: 'streak_3',  scale: 1.0 },
  5:  { text: 'RAMPAGE',       color: '#ff9a3a', sound: 'streak_5',  scale: 1.1 },
  7:  { text: 'UNSTOPPABLE',   color: '#ff6a3a', sound: 'streak_7',  scale: 1.2 },
  10: { text: 'DOMINATING',    color: '#ff4a6e', sound: 'streak_10', scale: 1.3 },
  15: { text: 'GODLIKE',       color: '#c84aff', sound: 'streak_15', scale: 1.45 },
  20: { text: 'LEGENDARY',     color: '#4ad6ff', sound: 'streak_20', scale: 1.6 },
};

export class Announcer {
  private root: HTMLElement;
  private mainEl: HTMLElement;
  private subEl: HTMLElement;
  private audio: AudioManager;
  private isLocal: (id: string) => boolean;

  private streak = 0;
  private multiCount = 0;
  private lastKillAt = 0;       // performance.now() of the last local kill
  private hideTimer: number | null = null;

  // Special-callout tracking.
  private matchHadKill = false;       // any kill landed this match yet?
  private lastKilledMeBy: string | null = null;  // for Revenge
  private deathsSinceKill = 0;        // for Comeback

  constructor(bus: GameEventBus, audio: AudioManager, isLocalPlayer: (id: string) => boolean) {
    this.root = document.getElementById('announcer')!;
    this.mainEl = document.getElementById('announcer-main')!;
    this.subEl = document.getElementById('announcer-sub')!;
    this.audio = audio;
    this.isLocal = isLocalPlayer;

    bus.on('kill', (e) => {
      // First-blood detection must read the flag BEFORE this kill flips it.
      const firstOfMatch = !this.matchHadKill;
      this.matchHadKill = true;
      if (this.isLocal(e.attackerId) && !this.isLocal(e.targetId)) {
        this.onLocalKill(e.targetId, firstOfMatch);
      }
      // Dying resets our streak + multi chain (whether we were killed by a
      // player or fell — any death of the local player counts).
      if (this.isLocal(e.targetId)) {
        this.onLocalDeath(e.attackerId);
      }
    });
  }

  /** Reset all state — call on match reset / mode switch so stale streaks
   *  don't carry across matches. */
  reset() {
    this.streak = 0;
    this.multiCount = 0;
    this.lastKillAt = 0;
    this.matchHadKill = false;
    this.lastKilledMeBy = null;
    this.deathsSinceKill = 0;
    this.hideBanner();
  }

  private onLocalKill(victimId: string, firstOfMatch: boolean) {
    const now = performance.now();
    // Multi-kill chaining.
    if (now - this.lastKillAt <= MULTIKILL_WINDOW * 1000) {
      this.multiCount++;
    } else {
      this.multiCount = 1; // fresh chain (this kill is the first link)
    }
    this.lastKillAt = now;
    this.streak++;

    // ── Specials (take headline priority over multi/streak) ──────────────────
    let special: Tier | null = null;
    if (firstOfMatch) {
      special = SPECIAL_TIERS.firstBlood;
    } else if (this.lastKilledMeBy && victimId === this.lastKilledMeBy) {
      special = SPECIAL_TIERS.revenge;
    } else if (this.deathsSinceKill >= COMEBACK_DEATHS) {
      special = SPECIAL_TIERS.comeback;
    }
    // Avenged → clear the grudge so we don't re-announce it next kill.
    if (this.lastKilledMeBy && victimId === this.lastKilledMeBy) this.lastKilledMeBy = null;
    this.deathsSinceKill = 0;

    // Multi-kill (>=2) and streak milestones, as before.
    const multiTier = this.multiCount >= 2 ? tierFor(MULTIKILL_TIERS, this.multiCount) : null;
    const streakTier = STREAK_TIERS[this.streak] ?? null;

    if (special) {
      // Special headline; the multi/streak (if any) rides the subline.
      const sub = multiTier ? multiTier.text : streakTier ? streakTier.text : streakSubline(this.streak);
      this.show(special, sub);
      this.audio.play(special.sound);
      if (multiTier) this.audio.play(multiTier.sound);
      else if (streakTier) this.audio.play(streakTier.sound);
    } else if (multiTier) {
      this.show(multiTier, streakTier ? streakTier.text : streakSubline(this.streak));
      this.audio.play(multiTier.sound);
      // If a streak milestone ALSO popped this kill, still play its sting
      // underneath (cheap, and silent if missing).
      if (streakTier) this.audio.play(streakTier.sound);
    } else if (streakTier) {
      this.show(streakTier, `${this.streak} kills`);
      this.audio.play(streakTier.sound);
    }
    // else: plain kill, no banner (the hitmarker + killfeed already cover it).
  }

  private onLocalDeath(attackerId: string) {
    this.streak = 0;
    this.multiCount = 0;
    this.lastKillAt = 0;
    this.deathsSinceKill++;
    // Remember a real attacker (not a fall / self) so the next kill on them
    // counts as Revenge.
    if (attackerId && !this.isLocal(attackerId)) this.lastKilledMeBy = attackerId;
    // Don't yank an in-flight banner on death — let it fade naturally.
  }

  private show(tier: Tier, sub: string) {
    this.mainEl.textContent = tier.text;
    this.mainEl.style.color = tier.color;
    this.mainEl.style.setProperty('--ann-scale', String(tier.scale));
    this.subEl.textContent = sub;

    this.root.classList.remove('hidden');
    // Restart the pop animation by forcing a reflow.
    this.root.classList.remove('ann-pop');
    void this.root.offsetWidth;
    this.root.classList.add('ann-pop');

    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hideBanner(), BANNER_HOLD_MS);
  }

  private hideBanner() {
    this.root.classList.add('hidden');
    this.root.classList.remove('ann-pop');
    if (this.hideTimer !== null) { window.clearTimeout(this.hideTimer); this.hideTimer = null; }
  }
}

/** Pick the tier for a count, clamping to the highest defined tier. */
function tierFor(tiers: Record<number, Tier>, count: number): Tier {
  if (tiers[count]) return tiers[count];
  const keys = Object.keys(tiers).map(Number).sort((a, b) => a - b);
  return tiers[keys[keys.length - 1]];
}

/** Subline for a multi-kill banner when no streak milestone fired. */
function streakSubline(streak: number): string {
  return streak >= 2 ? `${streak} kill streak` : '';
}
