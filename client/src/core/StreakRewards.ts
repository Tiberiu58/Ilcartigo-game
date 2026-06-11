/**
 * StreakRewards — CoD/Krunker-style killstreak REWARDS (not just callouts).
 *
 * The Announcer already shouts your streak ("RAMPAGE!"). This turns streaks
 * into *gameplay*: hit a milestone without dying and you earn a concrete perk
 * — a full resupply, an overcharge (shield + damage), or a frenzy (heal +
 * damage + speed). That's the catchy "I'm on fire, don't stop" loop.
 *
 * Scope: SOLO combat + Gun Game only. In MP the server is authoritative and
 * client-side buffs would desync, so Game leaves this disabled online. Reuses
 * the pickup buff timers (single owner of the damage/speed multipliers) via the
 * host, and shows its own toast (separate from the Announcer banner so the two
 * never fight over the same DOM).
 *
 * Decoupled + bus-driven, mirroring Announcer / GunGame / PickupManager.
 */

import type { GameEventBus } from './events';

export interface StreakReward {
  /** Streak count this reward fires at. */
  streak: number;
  /** Toast headline. */
  name: string;
  /** Short perk summary for the toast subline. */
  perks: string;
  /** Accent colour (hex string). */
  color: string;
  /** SFX id (best-effort; silent if missing). */
  sound: string;
  /** Full heal + reload all weapons. */
  heal?: boolean;
  /** Overshield to grant (capped by host). */
  shield?: number;
  /** Timed damage buff. */
  damage?: { mul: number; secs: number };
  /** Timed haste buff. */
  haste?: { mul: number; secs: number };
}

/** Reward ladder. Fires AT these exact streak counts. */
export const STREAK_REWARDS: Record<number, StreakReward> = {
  3: {
    streak: 3, name: 'RESUPPLY', perks: 'Full heal + reload', color: '#58c66a',
    sound: 'reward_resupply', heal: true,
  },
  5: {
    streak: 5, name: 'OVERCHARGE', perks: '+50 shield · 1.4× damage', color: '#3aa0ff',
    sound: 'reward_overcharge', shield: 50, damage: { mul: 1.4, secs: 8 },
  },
  7: {
    streak: 7, name: 'FRENZY', perks: 'Heal · 1.5× damage · 1.3× speed', color: '#ff5a2a',
    sound: 'reward_frenzy', heal: true, damage: { mul: 1.5, secs: 10 }, haste: { mul: 1.3, secs: 10 },
  },
};

/** The minimal engine surface StreakRewards needs to apply a reward. */
export interface StreakRewardHost {
  /** Full heal + reload all weapons. */
  healFull(): void;
  /** Add overshield (host caps it). */
  grantShield(n: number): void;
  /** Apply a timed damage buff (shared with pickups). */
  grantDamage(mul: number, secs: number): void;
  /** Apply a timed haste buff (shared with pickups). */
  grantHaste(mul: number, secs: number): void;
  /** Fire a one-shot SFX by id. */
  playSound(id: string): void;
}

export class StreakRewards {
  private host: StreakRewardHost;
  private isLocal: (id: string) => boolean;
  private unsub: (() => void) | null = null;

  /** Solo combat only — Game flips this. Disabled = inert (no tracking). */
  private enabled = false;
  private streak = 0;

  /** Fired when a reward is earned (wired to the reward toast UI). */
  onReward?: (r: StreakReward) => void;

  constructor(bus: GameEventBus, host: StreakRewardHost, isLocalPlayer: (id: string) => boolean) {
    this.host = host;
    this.isLocal = isLocalPlayer;
    this.unsub = bus.on('kill', (e) => {
      if (!this.enabled) return;
      if (this.isLocal(e.targetId)) {
        // Any local death resets the streak (killed by a player OR a fall).
        this.streak = 0;
        return;
      }
      if (this.isLocal(e.attackerId)) {
        this.streak++;
        const reward = STREAK_REWARDS[this.streak];
        if (reward) this.grant(reward);
      }
    });
  }

  /** Enable/disable + reset the streak (called on mode/MP change). */
  setEnabled(on: boolean) {
    this.enabled = on;
    this.streak = 0;
  }

  /** Reset the streak without changing enabled state (e.g. Play Again). */
  reset() {
    this.streak = 0;
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  private grant(r: StreakReward) {
    if (r.heal) this.host.healFull();
    if (r.shield) this.host.grantShield(r.shield);
    if (r.damage) this.host.grantDamage(r.damage.mul, r.damage.secs);
    if (r.haste) this.host.grantHaste(r.haste.mul, r.haste.secs);
    this.host.playSound(r.sound);
    this.onReward?.(r);
  }
}
