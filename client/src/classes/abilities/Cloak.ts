/**
 * Cloak — Ghost's 5-second invisibility.
 *
 * Mechanical:
 *   - PlayerActor.isCloaked = true → bots' LoS check returns false, so they
 *     stop engaging. Existing player-shoots-breaks-cloak hook calls
 *     AbilityRunner.notifyPlayerFired() which calls cancelActive on us.
 *   - Cooldown starts on cast (25s). Duration 5s. Net: 20s cooldown
 *     post-expiry. Long enough to be tactical.
 *
 * Polish (Phase 5c):
 *   - body.ghost-active CSS class drops a cyan inset border + slight
 *     desaturation so the player feels cloaked from inside their own POV.
 *   - Viewmodel opacity tween to 0.25 during active, restored on end. This is
 *     what makes "your hands look ghosty" so you don't forget you're cloaked.
 *
 * The 25s cooldown is the longest in the kit; Ghost's value is the
 * disengage/reposition window, not killing-while-invisible (which can't
 * happen anyway — fire breaks cloak).
 */

import { Ability, type AbilityContext } from '../types';
import type { PlayerActor } from '../../entities/PlayerActor';

const DURATION = 5.0;
const CLOAK_OPACITY = 0.25;

export class Cloak extends Ability {
  readonly id = 'cloak' as const;
  readonly displayName = 'Cloak';
  readonly baseCooldown = 25;

  /** Set by the runner so onTrigger can flip the player's cloak flag. */
  playerActor: PlayerActor | null = null;

  protected onTrigger(ctx: AbilityContext): void {
    this.isActive = true;
    if (this.playerActor) this.playerActor.isCloaked = true;
    ctx.viewmodel.setOpacity(CLOAK_OPACITY);
    document.body.classList.add('ghost-active');
  }

  protected onActiveTick(_dt: number, ctx: AbilityContext): void {
    if (this.activeTime >= DURATION) {
      this.cancelActive(ctx);
    }
  }

  protected onActiveEnd(ctx: AbilityContext): void {
    if (this.playerActor) this.playerActor.isCloaked = false;
    ctx.viewmodel.setOpacity(1.0);
    document.body.classList.remove('ghost-active');
  }
}
