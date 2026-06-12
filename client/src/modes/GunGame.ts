/**
 * GunGame — the classic "Gun Game" mode (a la CS / Krunker).
 *
 * Every kill advances the killer one rung up a fixed weapon ladder. The first
 * to score a kill while holding the FINAL weapon wins the match. Easy guns at
 * the bottom, hard ones at the top — the pistol is last as the traditional
 * "humiliation" finisher.
 *
 * Scope for v1: SOLO vs bots. The local player's gun visibly swaps each kill;
 * bots keep their fixed weapon but their tier is tracked so they can win the
 * race too (and so the scoreboard/announce reads correctly). No MP / protocol
 * changes — this mode is purely client-side, fully self-contained, and reuses
 * the existing kill bus + post-match flow.
 *
 * Self-contained + bus-driven, mirroring Announcer / DamageDirection: the only
 * engine surfaces it touches are the event bus, `Game.isLocalPlayer`,
 * `Game.setPlayerPrimaryWeapon`, and the audio manager — all via the small
 * `GunGameHost` interface so it stays testable + decoupled.
 */

import type { GameEventBus } from '../core/events';
import type { WeaponId } from '../weapons/Weapon';

/** The weapon ladder, bottom (first) → top (last). Reaching past the last
 *  weapon wins. Pistol is intentionally the final rung. */
export const GUNGAME_LADDER: WeaponId[] = ['smg', 'ar', 'shotgun', 'sniper', 'pistol'];

/** Display labels for each rung (HUD ticker). */
const WEAPON_LABEL: Record<WeaponId, string> = {
  smg: 'SMG',
  ar: 'ASSAULT RIFLE',
  marksman: 'MARKSMAN',
  shotgun: 'SHOTGUN',
  sniper: 'SNIPER',
  pistol: 'PISTOL',
};

/** The minimal surface GunGame needs from the engine. Keeps it decoupled. */
export interface GunGameHost {
  isLocalPlayer(id: string): boolean;
  /** Swap the local player's primary weapon + viewmodel. */
  setPlayerPrimaryWeapon(id: WeaponId): void;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

export class GunGame {
  private host: GunGameHost;
  private unsub: (() => void) | null = null;

  /** Per-participant tier index into GUNGAME_LADDER. */
  private tiers = new Map<string, number>();
  /** True once someone has won — stops further advancement. */
  private won = false;

  /** Fired when a participant reaches past the final rung. Wired by main.ts to
   *  the post-match overlay. */
  onWin?: (winnerId: string) => void;
  /** Fired whenever the LOCAL player's tier changes (HUD ticker update). */
  onLocalTierChange?: (tier: number, total: number, weaponLabel: string) => void;

  constructor(bus: GameEventBus, host: GunGameHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
  }

  /** Begin a fresh Gun Game: everyone back to rung 0, local player gets the
   *  first weapon. Pass the ids of all participants (local + bots). */
  start(participantIds: string[]) {
    this.won = false;
    this.tiers.clear();
    for (const id of participantIds) this.tiers.set(id, 0);
    // Make sure the local player starts on the first ladder weapon.
    this.host.setPlayerPrimaryWeapon(GUNGAME_LADDER[0]);
    this.emitLocalTier(this.localId(participantIds));
  }

  /** Tear down the kill subscription. */
  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  /** Current tier (0-based) for a participant. */
  tierOf(id: string): number {
    return this.tiers.get(id) ?? 0;
  }

  private onKill(attackerId: string, targetId: string) {
    if (this.won) return;
    // A participant only advances on a kill of SOMEONE ELSE (no suicide farming).
    if (attackerId === targetId) return;
    if (!this.tiers.has(attackerId)) this.tiers.set(attackerId, 0);

    const cur = this.tiers.get(attackerId)!;
    const next = cur + 1;

    // Win check: a kill made while on the LAST rung wins (next would step past
    // the ladder end).
    if (cur >= GUNGAME_LADDER.length - 1) {
      this.won = true;
      this.host.playSound('match_end');
      this.onWin?.(attackerId);
      return;
    }

    // Advance this participant one rung.
    this.tiers.set(attackerId, next);

    if (this.host.isLocalPlayer(attackerId)) {
      // Swap the player's gun to the new rung + cue + ticker update.
      this.host.setPlayerPrimaryWeapon(GUNGAME_LADDER[next]);
      this.host.playSound('kill_feedback');
      this.onLocalTierChange?.(next, GUNGAME_LADDER.length, WEAPON_LABEL[GUNGAME_LADDER[next]]);
    }
  }

  /** Pick the local id out of a participant list (or 'player' fallback). */
  private localId(ids: string[]): string {
    return ids.find((id) => this.host.isLocalPlayer(id)) ?? 'player';
  }

  private emitLocalTier(localId: string) {
    const t = this.tierOf(localId);
    this.onLocalTierChange?.(t, GUNGAME_LADDER.length, WEAPON_LABEL[GUNGAME_LADDER[t]]);
  }
}
