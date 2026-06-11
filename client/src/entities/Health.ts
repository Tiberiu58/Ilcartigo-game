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
  /**
   * Overshield (armour) absorbed BEFORE health. Drains first in takeDamage.
   * Default 0 — only the player ever picks up armour, so bots are unaffected.
   * Cleared on reset(). Granted by the Armour pickup (Phase 14).
   */
  shield = 0;
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
    // Overshield soaks damage first; any overflow carries into HP.
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (amount <= 0) return false;
    }
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

  /** Resets HP + alive state. Caller should grantInvulnerability separately. */
  reset() {
    this.current = this.max;
    this.dead = false;
    this.shield = 0;
  }
}
