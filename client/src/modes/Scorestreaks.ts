/**
 * Scorestreaks — consecutive-kill rewards (the CoD/Krunker "earn-your-power"
 * loop). Land kills without dying and the game hands you escalating buffs:
 *
 *   3  kills → OVERDRIVE   (2× damage, 8s)
 *   5  kills → RESUPPLY    (full heal + 50 overshield + instant reload)
 *   7  kills → ADRENALINE  (haste 10s + full heal)
 *   10 kills → ONSLAUGHT   (2× damage + haste, 12s) — re-granted every 5 after
 *
 * Reuses the Phase-14 power-up machinery via a small `ScorestreakHost` so this
 * stays self-contained + testable, mirroring GunGame / Announcer. Bus-driven
 * (kill events). Dying resets the streak.
 *
 * SOLO combat only: in MP, damage is server-authoritative (a client-side damage
 * buff does nothing) and haste would fight reconciliation — so `host.canReward`
 * gates the grant to single-player. The streak still tracks; it just won't pay
 * out online. Matches the bots / pickups solo-only pattern. No protocol change.
 */

import type { GameEventBus } from '../core/events';

export interface ScorestreakHost {
  /** True only in solo combat/gungame — rewards must not fire in MP/Practice. */
  canReward(): boolean;
  grantDamageBoost(ms: number): void;
  grantHaste(ms: number): void;
  healFull(): void;
  grantOvershield(amount: number): void;
  refillAmmo(): void;
  /** Fire the reward banner + sound. */
  announce(label: string, color: number): void;
}

interface StreakReward {
  at: number;
  label: string;
  color: number;
  apply(h: ScorestreakHost): void;
}

const REWARDS: StreakReward[] = [
  { at: 3,  label: 'OVERDRIVE',  color: 0xff5a3a, apply: (h) => h.grantDamageBoost(8000) },
  { at: 5,  label: 'RESUPPLY',   color: 0x4ade80, apply: (h) => { h.healFull(); h.grantOvershield(50); h.refillAmmo(); } },
  { at: 7,  label: 'ADRENALINE', color: 0xfacc15, apply: (h) => { h.grantHaste(10000); h.healFull(); } },
  { at: 10, label: 'ONSLAUGHT',  color: 0xc84aff, apply: (h) => { h.grantDamageBoost(12000); h.grantHaste(12000); } },
];
const ONSLAUGHT = REWARDS[REWARDS.length - 1];
/** Past the top milestone, re-grant Onslaught every N additional kills. */
const ENDLESS_EVERY = 5;

export class Scorestreaks {
  private host: ScorestreakHost;
  private isLocal: (id: string) => boolean;
  private unsub: (() => void) | null;
  private streak = 0;

  constructor(bus: GameEventBus, host: ScorestreakHost, isLocalPlayer: (id: string) => boolean) {
    this.host = host;
    this.isLocal = isLocalPlayer;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
  }

  /** Current consecutive-kill count. */
  get current(): number { return this.streak; }

  /** Clear the streak — call on match reset / mode switch. */
  reset() { this.streak = 0; }

  dispose() { this.unsub?.(); this.unsub = null; }

  private onKill(attackerId: string, targetId: string) {
    // Any local death (including falls) resets the streak.
    if (this.isLocal(targetId)) {
      this.streak = 0;
      return;
    }
    // A local kill of someone else advances it.
    if (this.isLocal(attackerId) && attackerId !== targetId) {
      this.streak++;
      this.checkReward();
    }
  }

  private checkReward() {
    if (!this.host.canReward()) return;
    let reward: StreakReward | null = REWARDS.find((r) => r.at === this.streak) ?? null;
    if (!reward && this.streak > ONSLAUGHT.at && (this.streak - ONSLAUGHT.at) % ENDLESS_EVERY === 0) {
      reward = ONSLAUGHT;
    }
    if (!reward) return;
    reward.apply(this.host);
    this.host.announce(reward.label, reward.color);
  }
}
