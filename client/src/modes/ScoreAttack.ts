/**
 * ScoreAttack — a 90-second timed frag-rush against the bots.
 *
 * The hook is a personal high-score chase: rack up as many kills as you can
 * before the clock hits zero, then try to beat your saved best. Fixed-length
 * matches also give a predictable, frequent post-match breakpoint (ads).
 *
 * The mode itself is *just the clock* — score resolution + the personal-best
 * record live in main.ts, which already owns the post-match scoreboard. Mirrors
 * GunGame / OneShot's bus-decoupled shape via a tiny `ScoreAttackHost`.
 *
 * Scope: SOLO vs bots, client-side only, no protocol/MP changes.
 */

/** Match length in seconds. */
export const SCOREATTACK_SECONDS = 90;
/** Seconds remaining at/under which the HUD clock turns "urgent". */
export const SCOREATTACK_URGENT = 10;

export interface ScoreAttackHost {
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
  /** True only while Score Attack is the live mode. */
  isActive(): boolean;
}

export class ScoreAttack {
  private host: ScoreAttackHost;

  /** Seconds left in the current run. */
  private remaining = 0;
  /** True once the clock has expired (stops further ticks). */
  private ended = true;
  /** performance.now() ms of the last update (for dt). */
  private lastTick = 0;
  /** Whole-second value last pushed to the HUD (change-detect). */
  private lastWhole = -1;
  /** Whether we've already played the sub-10s urgency cue. */
  private urgentCued = false;

  /** Fired each whole-second change with the seconds remaining (HUD clock). */
  onTick?: (secondsLeft: number, urgent: boolean) => void;
  /** Fired once when the clock hits zero. main.ts resolves the score. */
  onTimeUp?: () => void;

  constructor(host: ScoreAttackHost) {
    this.host = host;
  }

  /** Begin a fresh 90-second run. */
  start() {
    this.remaining = SCOREATTACK_SECONDS;
    this.ended = false;
    this.lastTick = performance.now();
    this.lastWhole = -1;
    this.urgentCued = false;
    this.pushTick();
  }

  /** Seconds remaining (rounded up), for any external read. */
  get secondsLeft(): number { return Math.max(0, Math.ceil(this.remaining)); }

  /** Per-frame: advance the clock + fire HUD/expiry callbacks. */
  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000); // clamp tab-stall jumps
    this.lastTick = now;
    if (this.ended || !this.host.isActive()) return;

    this.remaining -= dt;

    // Urgency cue once when crossing under the threshold.
    if (!this.urgentCued && this.remaining <= SCOREATTACK_URGENT && this.remaining > 0) {
      this.urgentCued = true;
      this.host.playSound('spawn_protect');
    }

    if (this.remaining <= 0) {
      this.remaining = 0;
      this.ended = true;
      this.pushTick();
      this.host.playSound('match_end');
      this.onTimeUp?.();
      return;
    }
    this.pushTick();
  }

  private pushTick() {
    const whole = Math.max(0, Math.ceil(this.remaining));
    if (whole !== this.lastWhole) {
      this.lastWhole = whole;
      this.onTick?.(whole, whole <= SCOREATTACK_URGENT);
    }
  }

  /** Format seconds as M:SS for the HUD clock. */
  static format(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
