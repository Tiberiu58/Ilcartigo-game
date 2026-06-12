/**
 * Health — small mutable HP container with damage / heal / dead state.
 *
 * No event emission here — the *caller* of takeDamage() is responsible for
 * pushing a DamageEvent onto the bus. Keeps this trivially testable and
 * means networked vs local damage flow through the same primitive.
 */

export class Health {
  max: number;
  current: number;
  dead = false;
  /** Temporary absorb pool from the Armor pickup. Incoming damage drains this
   *  before touching `current`. Cleared on reset. Solo/client-only (pickups
   *  don't run in MP, where HP is server-authoritative). */
  overshield = 0;
  /** Hard cap on overshield, so repeated armor pickups can't stack forever. */
  overshieldMax = 50;
  /** performance.now() timestamp until which incoming damage is ignored. */
  private invulnUntil = 0;

  constructor(max: number) {
    this.max = max;
    this.current = max;
  }

  /** Change max HP (Vanguard passive). Preserves current/max ratio so swapping
   *  to Vanguard mid-life doesn't overheal. */
  setMax(newMax: number) {
    const ratio = this.dead ? 0 : (this.current / this.max);
    this.max = newMax;
    this.current = Math.round(newMax * ratio);
  }

  get isInvulnerable(): boolean {
    return performance.now() < this.invulnUntil;
  }

  /** Grant N seconds of damage immunity, e.g. on spawn/respawn. */
  grantInvulnerability(seconds: number) {
    this.invulnUntil = performance.now() + seconds * 1000;
  }

  /**
   * Returns true if this damage killed the target. Damage is ignored while
   * invulnerable (spawn protection); the call still returns false so callers
   * don't mistakenly emit kill events.
   */
  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    if (this.isInvulnerable) return false;
    // Drain overshield first, then bleed the remainder into real HP.
    if (this.overshield > 0) {
      const absorbed = Math.min(this.overshield, amount);
      this.overshield -= absorbed;
      amount -= absorbed;
    }
    if (amount <= 0) return false;
    this.current = Math.max(0, this.current - amount);
    if (this.current === 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount: number) {
    if (this.dead) return;
    this.current = Math.min(this.max, this.current + amount);
  }

  /** Add to the temporary absorb pool, clamped to overshieldMax. */
  addOvershield(amount: number) {
    if (this.dead) return;
    this.overshield = Math.min(this.overshieldMax, this.overshield + amount);
  }

  /** Resets HP + alive state. Caller should grantInvulnerability separately. */
  reset() {
    this.current = this.max;
    this.dead = false;
    this.overshield = 0;
  }
}
