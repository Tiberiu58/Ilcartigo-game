/**
 * Blink — Phantom's teleport.
 *
 * Casts a horizontal ray along the player's aim. Teleports to the hit point
 * minus a safety skin, or MAX_RANGE if no hit. Drops velocity to zero so
 * you don't slingshot out of the blink.
 *
 * Polish (Phase 5c):
 *   - Purple flash at the depart point AND the arrival point so observers can
 *     read both ends of the teleport.
 *   - 0.3s post-teleport invuln so you can't get one-shot mid-blink while
 *     your view is re-orienting. The cost is real: Phantom's value is the
 *     reposition itself, not damage immunity, so 300ms is tight but useful.
 *
 * Velocity is zeroed for two reasons: (1) it feels like a glitch otherwise,
 * and (2) keeping pre-blink momentum would let you stack with bhop chains
 * for absurd traversal speeds.
 */

import * as THREE from 'three';
import { Ability, type AbilityContext } from '../types';

const MAX_RANGE = 14;
const SKIN = 0.6;
const FEET_DROP = 1.65;
const PHANTOM_COLOR = 0x9c64ff;
const POST_BLINK_INVULN = 0.3;     // seconds

// Player AABB extents used for the destination overlap check. Must match
// PlayerController's PLAYER_HALF_EXTENT — see PlayerController.ts. Hardcoded
// locally to avoid a circular import; if PlayerController ever changes the
// standing capsule, update here too.
const PLAYER_HALF = new THREE.Vector3(0.35, 0.9, 0.35);

// Foot-ground probe: a tiny AABB *just below* the proposed feet position.
// If it overlaps a solid, there's ground (or a roof / a platform) beneath
// the feet → safe to land. If not, the feet are over a void or outside
// the playable area → reject.
const FOOT_PROBE_HALF = new THREE.Vector3(0.30, 0.05, 0.30);
const FOOT_PROBE_DROP = 0.1;       // how far below feet to sample

export class Blink extends Ability {
  readonly id = 'blink' as const;
  readonly displayName = 'Blink';
  readonly baseCooldown = 12;

  private _eye = new THREE.Vector3();
  private _aim = new THREE.Vector3();
  private _target = new THREE.Vector3();
  private _flashAt = new THREE.Vector3();

  protected onTrigger(ctx: AbilityContext): void {
    ctx.player.eyePos(this._eye);
    ctx.player.aimDir(this._aim);

    // Compute the flat (horizontal) blink direction.
    const flat = this._aim.clone();
    flat.y = 0;
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();

    // Cast along the *horizontal* direction at chest height so vertical aim
    // doesn't shorten the blink (looking up no longer ends the blink at the
    // ceiling). This is the right behavior for a movement teleport.
    const castFrom = _SCRATCH.set(this._eye.x, this._eye.y, this._eye.z);
    const hit = ctx.world.raycast(castFrom, flat, MAX_RANGE, 'player');

    // Initial proposed distance: clip at any hit, else go full range.
    let distance = hit ? Math.max(0, hit.distance - SKIN) : MAX_RANGE;

    // Walk the proposed target backward along the aim ray until we find a
    // spot where (a) the player AABB doesn't overlap a solid AND (b) there's
    // ground beneath the feet. This stops Blink from teleporting through the
    // south archway gap into the void, and from popping the player into a
    // wall they were standing right next to.
    let validDistance = -1;
    const STEP = 0.5;
    while (distance >= 0) {
      const candX = this._eye.x + flat.x * distance;
      const candZ = this._eye.z + flat.z * distance;
      const candFeetY = this._eye.y - FEET_DROP;
      if (this.isLandingValid(ctx, candX, candFeetY, candZ)) {
        validDistance = distance;
        break;
      }
      distance -= STEP;
    }

    if (validDistance < 0) {
      // No valid landing along the ray — refund the cast. The base class
      // already spent a charge in tryTrigger(); we put it back and clear
      // the cooldown so the HUD doesn't lie about the cost.
      this.charges = Math.min(this.maxCharges, this.charges + 1);
      this.cooldownLeft = 0;
      return;
    }

    // Flash at the departure point (eye-level for visibility).
    this._flashAt.copy(this._eye);
    ctx.fx.flash(this._flashAt, PHANTOM_COLOR, 0.3, 1.1, 0.32);

    this._target.set(
      this._eye.x + flat.x * validDistance,
      this._eye.y - FEET_DROP,             // feet at same elevation as start
      this._eye.z + flat.z * validDistance,
    );

    // Flash at the arrival point too — at chest height so the player sees
    // their own arrival in their FOV.
    this._flashAt.set(this._target.x, this._target.y + 1.2, this._target.z);
    ctx.fx.flash(this._flashAt, PHANTOM_COLOR, 0.3, 1.1, 0.32);

    ctx.player.teleportTo(this._target);

    // Brief post-blink invuln so re-orienting players don't get instakilled.
    // Same API as spawn protection — granular on PlayerActor.health.
    ctx.playerActor.health.grantInvulnerability(POST_BLINK_INVULN);

    ctx.bus.emit('screenShake', { intensity: 0.03, duration: 0.15 });
  }

  /**
   * Two checks: (1) player capsule at `(x, feetY, z)` must not overlap any
   * solid — otherwise we'd embed in a wall. (2) A tiny probe just below the
   * feet must overlap *something* — otherwise the spot is mid-air or outside
   * the map's ground plane.
   */
  private isLandingValid(ctx: AbilityContext, x: number, feetY: number, z: number): boolean {
    _PROBE_POS.set(x, feetY, z);
    if (ctx.world.firstOverlap(_PROBE_POS, PLAYER_HALF)) return false;
    _PROBE_POS.set(x, feetY - FOOT_PROBE_DROP, z);
    if (!ctx.world.firstOverlap(_PROBE_POS, FOOT_PROBE_HALF)) return false;
    return true;
  }
}

const _PROBE_POS = new THREE.Vector3();

const _SCRATCH = new THREE.Vector3();
