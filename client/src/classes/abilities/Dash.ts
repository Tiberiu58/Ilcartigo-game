/**
 * Dash — Vanguard's two-charge directional burst.
 *
 * Adds a one-frame horizontal velocity impulse along the player's *flat* aim.
 * The new high-friction controller (FRICTION=12) bleeds the impulse over
 * ~0.4s, so we need a beefier IMPULSE than the original Quake-tuned value to
 * still feel like a *dash* and not a half-second nudge. 30 m/s feels right:
 * decay puts the player ~4m further along the dash direction.
 *
 * Polish (Phase 5c):
 *   - Teal trail mesh spawned from dash-start to dash-end (estimated by
 *     projecting current eye + impulse * decay_time forward).
 *   - +6 FOV punch that bleeds off over 0.3s (handled via abilityFovOffset).
 *
 * Two charges → set maxCharges = 2. The runner's cooldown logic regenerates
 * one charge per `baseCooldown × cooldownMultiplier` seconds (Engineer's -15%
 * cooldown reduction applies if their class were ever swapped to use Dash).
 */

import * as THREE from 'three';
import { Ability, type AbilityContext } from '../types';

// IMPULSE × decay_horizon ≈ 4m dash distance under FRICTION = 12.
const IMPULSE = 30;
const VANGUARD_COLOR = 0x4ac8a8;
const FOV_PUNCH = 6;
const FOV_PUNCH_TIME = 0.3;

export class Dash extends Ability {
  readonly id = 'dash' as const;
  readonly displayName = 'Dash';
  readonly baseCooldown = 8;
  readonly maxCharges = 2;

  private _aim = new THREE.Vector3();
  private _start = new THREE.Vector3();
  private _end = new THREE.Vector3();
  /** Time remaining on the FOV punch (>0 = active). */
  private fovPunchLeft = 0;

  protected onTrigger(ctx: AbilityContext): void {
    ctx.player.aimDir(this._aim);
    this._aim.y = 0;
    if (this._aim.lengthSq() < 1e-4) this._aim.set(0, 0, -1);
    this._aim.normalize();
    ctx.player.addHorizontalImpulse(this._aim, IMPULSE);

    // Trail from current eye to the projected end position. We don't know the
    // exact stopping point without simulating, but `IMPULSE × 0.15s` is a
    // close enough approximation for the visual.
    ctx.player.eyePos(this._start);
    this._start.y = ctx.player.pos.y + 1.0;     // chest-height so trail reads
    this._end.copy(this._start).addScaledVector(this._aim, IMPULSE * 0.15);
    ctx.fx.trail(this._start, this._end, VANGUARD_COLOR, 0.22, 0.4);

    // FOV punch — quick swell, decays in onActiveTick via the ability runner.
    // Mark active so the runner ticks us even though Dash is "instantaneous".
    this.isActive = true;
    this.fovPunchLeft = FOV_PUNCH_TIME;
    ctx.player.abilityFovOffset = FOV_PUNCH;

    ctx.bus.emit('screenShake', { intensity: 0.025, duration: 0.12 });
  }

  protected onActiveTick(dt: number, ctx: AbilityContext): void {
    if (this.fovPunchLeft > 0) {
      this.fovPunchLeft -= dt;
      const t = Math.max(0, this.fovPunchLeft / FOV_PUNCH_TIME);
      ctx.player.abilityFovOffset = FOV_PUNCH * t;
      if (this.fovPunchLeft <= 0) {
        ctx.player.abilityFovOffset = 0;
        this.isActive = false;       // close out the "active" tick — Dash is otherwise instantaneous
      }
    }
  }

  protected onActiveEnd(ctx: AbilityContext): void {
    ctx.player.abilityFovOffset = 0;
    this.fovPunchLeft = 0;
  }
}
