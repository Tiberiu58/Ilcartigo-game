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
  /** Overshield (armor). Absorbs incoming damage 1:1 before HP. Gained only via
   *  the armor pickup; does not regenerate; zeroed on respawn. 0 = no armor. */
  armor = 0;
  armorMax = 100;
  /** performance.now() timestamp until which incoming damage is ignored. */
  private invulnUntil = 0;

  constructor(max: number) {
    this.max = max;
    this.current = max;
  }

  /** Add overshield, clamped to armorMax (armor pickup). */
  addArmor(amount: number) {
    this.armor = Math.min(this.armorMax, this.armor + amount);
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
    // Overshield absorbs damage 1:1 until depleted, remainder hits HP.
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount);
      this.armor -= absorbed;
      amount -= absorbed;
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

  /** Resets HP + alive state (+ clears armor). Caller should grantInvulnerability separately. */
  reset() {
    this.current = this.max;
    this.dead = false;
    this.armor = 0;
  }
}
