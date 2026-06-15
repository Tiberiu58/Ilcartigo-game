/**
 * TimeAttack — a 60-second score sprint vs bots (a la Krunker's "Free For All"
 * timed rounds / arcade score-attack modes).
 *
 * You have one minute to rack up the highest score you can. Every kill banks
 * points; headshots bank more; and chaining kills inside a short window builds
 * a combo MULTIPLIER (x2 → x3 → … capped) so aggressive, fast play is rewarded.
 * Dying breaks your combo. When the clock hits zero the run ends and your score
 * is compared against your stored personal best — the "beat your best" loop is
 * the retention hook, and the round-end is a natural ad breakpoint.
 *
 * Scope: SOLO vs bots. Purely client-side, self-contained, bus-driven — no MP
 * or protocol changes. Mirrors GunGame's decoupled `Host` adapter so it stays
 * testable and touches the engine only through a tiny interface + the kill bus.
 *
 * The clock is wall-clock based (performance.now) with explicit pause/resume so
 * pausing the game (pointer unlock) doesn't silently drain the timer.
 */

import type { GameEventBus, GameEvents } from '../core/events';

/** Round length. */
export const TIMEATTACK_DURATION_MS = 60_000;
/** A kill within this window of the previous one extends the combo. */
const COMBO_WINDOW_MS = 3_000;
/** Combo multiplier ceiling (x1..x5). */
const MAX_MULTIPLIER = 5;
/** Base points for a body kill, plus a bonus for a headshot kill. */
const BASE_POINTS = 100;
const HEADSHOT_BONUS = 50;

/** The mode id used as the key for the persisted personal best. */
export const TIMEATTACK_MODE_ID = 'timeattack';

/** Minimal engine surface TimeAttack needs. Keeps the mode decoupled. */
export interface TimeAttackHost {
  isLocalPlayer(id: string): boolean;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

export class TimeAttack {
  private host: TimeAttackHost;
  private unsub: (() => void) | null = null;

  private _score = 0;
  /** Current combo count (consecutive kills inside the window). 0 = none. */
  private _combo = 0;
  private lastKillAt = 0;

  private startAt = 0;
  /** Wall-clock ms when paused; 0 = not paused. */
  private pausedAt = 0;
  private running = false;
  private ended = false;

  /** Fired once when the clock runs out, with the final score. */
  onTimeUp?: (score: number) => void;
  /** Fired on every score change (a kill) so the HUD can pop the ticker. */
  onScoreChange?: (score: number, combo: number, multiplier: number) => void;

  constructor(bus: GameEventBus, host: TimeAttackHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e));
  }

  /** Begin a fresh run: zero the score + combo, start the clock. */
  start() {
    this._score = 0;
    this._combo = 0;
    this.lastKillAt = 0;
    this.startAt = performance.now();
    this.pausedAt = 0;
    this.running = true;
    this.ended = false;
    this.onScoreChange?.(0, 0, 1);
  }

  /** Tear down the kill subscription. */
  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  get score(): number { return this._score; }
  get combo(): number { return this._combo; }

  /** True while the combo is still "live" (next kill keeps building it). */
  comboAlive(): boolean {
    return this._combo > 0 && (performance.now() - this.lastKillAt) <= COMBO_WINDOW_MS;
  }

  /** Current multiplier given the live combo (1..MAX_MULTIPLIER). */
  multiplier(): number {
    if (!this.comboAlive()) return 1;
    return Math.min(MAX_MULTIPLIER, this._combo);
  }

  /** Remaining milliseconds, clamped to ≥0. Frozen while paused. */
  remainingMs(): number {
    if (!this.running && !this.ended) return TIMEATTACK_DURATION_MS;
    const ref = this.pausedAt || performance.now();
    return Math.max(0, TIMEATTACK_DURATION_MS - (ref - this.startAt));
  }

  /** Freeze the clock (e.g. on pause / pointer unlock). Idempotent. */
  pause() {
    if (!this.running || this.ended || this.pausedAt) return;
    this.pausedAt = performance.now();
  }

  /** Resume the clock, shifting the start forward by the paused duration. */
  resume() {
    if (!this.running || this.ended || !this.pausedAt) return;
    this.startAt += performance.now() - this.pausedAt;
    this.pausedAt = 0;
  }

  /**
   * Per-frame poll (no dt needed — wall-clock based). Returns remaining ms and
   * fires onTimeUp exactly once when the clock reaches zero. Safe to call every
   * frame; no-ops once the run has ended.
   */
  poll(): number {
    if (!this.running || this.ended) return this.remainingMs();
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      this.running = false;
      this.ended = true;
      this.host.playSound('match_end');
      this.onTimeUp?.(this._score);
    }
    return remaining;
  }

  private onKill(e: GameEvents['kill']) {
    if (!this.running || this.ended) return;

    // Dying breaks your combo (you lost momentum). Checked before scoring so a
    // simultaneous trade still resets correctly.
    if (this.host.isLocalPlayer(e.targetId) && !this.host.isLocalPlayer(e.attackerId)) {
      this._combo = 0;
    }

    // Only the local player banks points, and never from a suicide/fall.
    if (!this.host.isLocalPlayer(e.attackerId)) return;
    if (e.attackerId === e.targetId) return;

    const now = performance.now();
    // Extend the combo if the previous kill was recent; else restart at 1.
    if (this._combo > 0 && (now - this.lastKillAt) <= COMBO_WINDOW_MS) {
      this._combo++;
    } else {
      this._combo = 1;
    }
    this.lastKillAt = now;

    const mult = Math.min(MAX_MULTIPLIER, this._combo);
    const points = (BASE_POINTS + (e.isHeadshot ? HEADSHOT_BONUS : 0)) * mult;
    this._score += points;

    this.onScoreChange?.(this._score, this._combo, mult);
  }
}
