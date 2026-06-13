/**
 * TimeAttack — a 90-second score blitz (a la Krunker's timed FFA rounds).
 *
 * The clock is the enemy. Everyone keeps their chosen loadout; deaths cost
 * nothing but the seconds you spend respawning. Rack up the most kills before
 * the timer hits zero and you win. Short, frantic rounds → a fresh post-match
 * screen every ~90s, which is also the most natural AdSense breakpoint we have.
 *
 * Scope: SOLO vs bots for v1. No MP / protocol changes — purely client-side,
 * self-contained, and reuses the existing kill bus + post-match flow, mirroring
 * the GunGame module's `*Host`-interface pattern so it stays decoupled and
 * testable.
 *
 * The countdown is self-managed (dt-accumulated, pause-aware) and driven by a
 * once-per-frame `tick()` call from main.ts. `setPaused(true)` freezes the clock
 * while the pause/settings overlay is up so a tabbed-out player doesn't lose the
 * round to a clock that kept draining.
 */

import type { GameEventBus } from '../core/events';

/** Round length in seconds. */
export const TIMEATTACK_DURATION = 90;

/** Final-stretch threshold (seconds) — the HUD ticker goes red + ticks audibly. */
export const TIMEATTACK_WARN_AT = 10;

/** The minimal engine surface TimeAttack needs. Keeps it decoupled + testable. */
export interface TimeAttackHost {
  isLocalPlayer(id: string): boolean;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

export class TimeAttack {
  private host: TimeAttackHost;
  private unsub: (() => void) | null = null;

  /** Per-participant kill count (local + bots). */
  private kills = new Map<string, number>();

  private remainingMs = TIMEATTACK_DURATION * 1000;
  private lastNow = 0;
  private running = false;
  private paused = false;
  /** Last whole-second value emitted — edges the final-countdown tick cue. */
  private lastWholeSec = -1;

  /** Fired every frame while running: remaining seconds (ceil) + your kills. */
  onTick?: (remainingSec: number, localKills: number, warn: boolean) => void;
  /** Fired once when the clock hits zero. Winner = most kills (ties → you). */
  onTimeUp?: (winnerId: string) => void;

  constructor(bus: GameEventBus, host: TimeAttackHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
  }

  /** Begin a fresh round. Pass the ids of all participants (local + bots). */
  start(participantIds: string[]) {
    this.kills.clear();
    for (const id of participantIds) this.kills.set(id, 0);
    this.remainingMs = TIMEATTACK_DURATION * 1000;
    this.lastNow = performance.now();
    this.lastWholeSec = TIMEATTACK_DURATION;
    this.running = true;
    this.paused = false;
    this.emitTick();
  }

  /** Stop the clock without firing onTimeUp (used on quit-to-menu). */
  stop() {
    this.running = false;
  }

  /** Freeze/unfreeze the countdown (pause overlay, settings, post-match). */
  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    // On resume, re-anchor the clock so the paused gap isn't drained at once.
    if (!p) this.lastNow = performance.now();
  }

  /** Tear down the kill subscription. */
  dispose() {
    this.unsub?.();
    this.unsub = null;
    this.running = false;
  }

  /** Per-frame advance. No-op unless running + unpaused. */
  tick() {
    if (!this.running) return;
    const now = performance.now();
    if (this.paused) {
      this.lastNow = now;
      return;
    }
    const dt = now - this.lastNow;
    this.lastNow = now;
    this.remainingMs -= dt;

    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.emitTick();
      this.end();
      return;
    }

    // Final-stretch audible tick (silent until the asset lands).
    const whole = Math.ceil(this.remainingMs / 1000);
    if (whole !== this.lastWholeSec) {
      this.lastWholeSec = whole;
      if (whole <= TIMEATTACK_WARN_AT) this.host.playSound('timer_tick');
    }
    this.emitTick();
  }

  /** Current kill count for a participant. */
  killsOf(id: string): number {
    return this.kills.get(id) ?? 0;
  }

  private end() {
    this.running = false;
    this.host.playSound('match_end');
    this.onTimeUp?.(this.winnerId());
  }

  private winnerId(): string {
    let best = '';
    let bestK = -1;
    for (const [id, k] of this.kills) {
      // Ties resolve in the local player's favour for a satisfying solo result.
      if (k > bestK || (k === bestK && this.host.isLocalPlayer(id))) {
        best = id;
        bestK = k;
      }
    }
    return best || 'player';
  }

  private localKills(): number {
    let total = 0;
    for (const [id, k] of this.kills) if (this.host.isLocalPlayer(id)) total += k;
    return total;
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.running) return;
    if (attackerId === targetId) return; // no suicide farming
    if (!this.kills.has(attackerId)) this.kills.set(attackerId, 0);
    this.kills.set(attackerId, this.kills.get(attackerId)! + 1);
    if (this.host.isLocalPlayer(attackerId)) this.emitTick();
  }

  private emitTick() {
    const sec = Math.ceil(this.remainingMs / 1000);
    this.onTick?.(sec, this.localKills(), sec <= TIMEATTACK_WARN_AT);
  }
}
