/**
 * OneShot — the classic "One in the Chamber" / instagib mode.
 *
 * Every player (and bot) dies in a single hit. The local player wields a pistol
 * whose magazine is a *bullet economy*: you start with a few rounds, every kill
 * refunds one, and there is no reloading. Make your shots count — a miss spends
 * a precious bullet. To keep it from dead-locking when you run dry, a slow
 * "scavenge" trickle refills one bullet every few seconds while you're empty.
 *
 * First participant to reach the kill goal wins → the existing post-match flow.
 *
 * Scope for v1: SOLO vs bots, fully client-side, no protocol/MP changes. Mirrors
 * GunGame's bus-driven, host-decoupled shape: the only engine surfaces it
 * touches go through the small `OneShotHost` interface, so it stays testable.
 */

import type { GameEventBus } from '../core/events';

/** Bullets the local player starts a fresh match with. */
export const ONESHOT_START_BULLETS = 3;
/** Hard cap on banked bullets (kills past this don't over-stock you). */
export const ONESHOT_MAX_BULLETS = 6;
/** Kills required to win the match. Short + frantic → a quick post-match break. */
export const ONESHOT_GOAL = 12;
/** Seconds between scavenge bullets while the magazine sits empty. */
const SCAVENGE_INTERVAL = 4.0;

/** The minimal engine surface OneShot needs. Keeps the mode decoupled. */
export interface OneShotHost {
  isLocalPlayer(id: string): boolean;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
  /** Add (or subtract) bullets to the local player's locked pistol, clamped. */
  addLocalBullets(n: number, cap: number): void;
  /** Current local bullet count (the pistol magazine). */
  localBulletCount(): number;
  /** True only while One Shot is the live mode. The kill subscription is
   *  permanent, so without this guard a kill in Combat/MP would hand out
   *  bullets + count toward the goal. */
  isActive(): boolean;
}

export class OneShot {
  private host: OneShotHost;
  private unsub: (() => void) | null = null;

  /** Per-participant kill count toward the goal. */
  private kills = new Map<string, number>();
  /** True once someone has won — stops further scoring + scavenge. */
  private won = false;

  /** performance.now() ms of the last update tick (for dt). */
  private lastTick = 0;
  /** Accumulated empty time toward the next scavenge bullet. */
  private scavengeTimer = 0;
  /** Last bullet count we pushed to the HUD (change-detect for onLocalState). */
  private lastBullets = -1;

  /** Fired when a participant reaches the goal. Wired to the post-match overlay. */
  onWin?: (winnerId: string) => void;
  /** Fired whenever the LOCAL player's kills or bullets change (HUD ticker). */
  onLocalState?: (kills: number, goal: number, bullets: number) => void;

  constructor(bus: GameEventBus, host: OneShotHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
  }

  /** Begin a fresh One Shot match. Pass all participant ids (local + bots). */
  start(participantIds: string[]) {
    this.won = false;
    this.kills.clear();
    for (const id of participantIds) this.kills.set(id, 0);
    this.lastTick = performance.now();
    this.scavengeTimer = 0;
    this.lastBullets = -1;
    this.emitLocalState(this.localId(participantIds));
  }

  /** Tear down the kill subscription. */
  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  /** Per-frame: drive the empty-magazine scavenge trickle + HUD sync. */
  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000); // clamp tab-stall jumps
    this.lastTick = now;
    if (this.won) return;

    // Scavenge: while bone-dry, slowly trickle a bullet back so you're never
    // permanently defenseless (and the match can't soft-lock).
    if (this.host.localBulletCount() <= 0) {
      this.scavengeTimer += dt;
      if (this.scavengeTimer >= SCAVENGE_INTERVAL) {
        this.scavengeTimer = 0;
        this.host.addLocalBullets(1, ONESHOT_MAX_BULLETS);
        this.host.playSound('respawn');
      }
    } else {
      this.scavengeTimer = 0;
    }

    // Push HUD updates when the count changes (fires happen outside this mode).
    const b = this.host.localBulletCount();
    if (b !== this.lastBullets) {
      this.lastBullets = b;
      this.onLocalState?.(this.killsOf(this.localKey()), ONESHOT_GOAL, b);
    }
  }

  /** Current kills for a participant. */
  killsOf(id: string): number {
    return this.kills.get(id) ?? 0;
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.host.isActive()) return;           // only score while One Shot is live
    if (this.won) return;
    if (attackerId === targetId) return;         // no suicide farming
    if (!this.kills.has(attackerId)) this.kills.set(attackerId, 0);

    const next = this.killsOf(attackerId) + 1;
    this.kills.set(attackerId, next);

    if (this.host.isLocalPlayer(attackerId)) {
      // Reward the kill with a bullet (clamped) + cue + ticker refresh.
      this.host.addLocalBullets(1, ONESHOT_MAX_BULLETS);
      this.host.playSound('kill_feedback');
      this.emitLocalState(attackerId);
    }

    if (next >= ONESHOT_GOAL) {
      this.won = true;
      this.host.playSound('match_end');
      this.onWin?.(attackerId);
    }
  }

  /** Resolve the local id once and cache the key for HUD updates. */
  private cachedLocalKey: string | null = null;
  private localKey(): string {
    return this.cachedLocalKey ?? 'player';
  }
  private localId(ids: string[]): string {
    const id = ids.find((i) => this.host.isLocalPlayer(i)) ?? 'player';
    this.cachedLocalKey = id;
    return id;
  }

  private emitLocalState(localId: string) {
    this.cachedLocalKey = localId;
    const b = this.host.localBulletCount();
    this.lastBullets = b;
    this.onLocalState?.(this.killsOf(localId), ONESHOT_GOAL, b);
  }
}
