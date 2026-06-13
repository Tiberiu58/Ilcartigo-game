/**
 * Headhunter — a precision mode where ONLY headshot kills score.
 *
 * Body kills still drop your target (and still count toward your lifetime/Tab
 * stats), but they do NOT advance your Headhunter score. First to land
 * `HEADHUNTER_GOAL` headshot eliminations wins → post-match overlay. A pure
 * aim-skill axis to complement Gun Game's weapon ladder and Time Attack's clock.
 *
 * Scope: SOLO vs bots for v1. No MP / protocol changes — purely client-side,
 * self-contained, bus-driven, mirroring the GunGame module's `*Host`-interface
 * pattern so it stays decoupled and testable. Reuses the existing kill bus +
 * post-match flow.
 */

import type { GameEventBus } from '../core/events';

/** Headshot eliminations needed to win. */
export const HEADHUNTER_GOAL = 10;

/** The minimal engine surface Headhunter needs. Keeps it decoupled + testable. */
export interface HeadhunterHost {
  isLocalPlayer(id: string): boolean;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

export class Headhunter {
  private host: HeadhunterHost;
  private unsub: (() => void) | null = null;

  /** Per-participant headshot-kill count (local + bots). */
  private score = new Map<string, number>();
  /** True once someone has won — stops further scoring. */
  private won = false;

  /** Fired when a participant reaches the goal. Wired to the post-match overlay. */
  onWin?: (winnerId: string) => void;
  /** Fired whenever the LOCAL player's score changes (HUD ticker update). */
  onLocalScore?: (score: number, goal: number) => void;

  constructor(bus: GameEventBus, host: HeadhunterHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId, e.isHeadshot));
  }

  /** Begin a fresh round: everyone to 0. Pass all participant ids (local + bots). */
  start(participantIds: string[]) {
    this.won = false;
    this.score.clear();
    for (const id of participantIds) this.score.set(id, 0);
    this.emitLocal(this.localId(participantIds));
  }

  /** Tear down the kill subscription. */
  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  /** Current headshot-kill score for a participant. */
  scoreOf(id: string): number {
    return this.score.get(id) ?? 0;
  }

  private onKill(attackerId: string, targetId: string, isHeadshot: boolean) {
    if (this.won) return;
    if (!isHeadshot) return; // only headshots score
    if (attackerId === targetId) return; // no suicide farming
    if (!this.score.has(attackerId)) this.score.set(attackerId, 0);

    const next = this.score.get(attackerId)! + 1;
    this.score.set(attackerId, next);

    if (this.host.isLocalPlayer(attackerId)) {
      this.host.playSound('hit_headshot');
      this.onLocalScore?.(next, HEADHUNTER_GOAL);
    }

    if (next >= HEADHUNTER_GOAL) {
      this.won = true;
      this.host.playSound('match_end');
      this.onWin?.(attackerId);
    }
  }

  /** Pick the local id out of a participant list (or 'player' fallback). */
  private localId(ids: string[]): string {
    return ids.find((id) => this.host.isLocalPlayer(id)) ?? 'player';
  }

  private emitLocal(localId: string) {
    this.onLocalScore?.(this.scoreOf(localId), HEADHUNTER_GOAL);
  }
}
