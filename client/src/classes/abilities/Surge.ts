/**
 * Surge — Rush's 2× sprint for 4 seconds.
 *
 * Mechanical: PlayerController.speedMultiplier = 2.0 → ground caps scale up
 * (run 16.8, strafe 16, back 14.3). Air-strafe is unaffected — Surge is a
 * ground sprint, not an air-cheese tool.
 *
 * Polish (Phase 5c):
 *   - Camera FOV bumped +8 for the duration → reinforces the sense of speed.
 *     We don't touch the user's baseFov setting; we add an `fovOffset` field
 *     on the camera that the Game's FOV lerp reads.
 *   - Body gets `rush-active` class while active → CSS animates orange tinted
 *     speed lines down the screen edges.
 *
 * Tradeoff: 4s is a meaningful window but the 18s cooldown means you commit.
 * You either burst-rotate to a new flank, chase a kill, or reposition out of
 * a bad fight. Rush is not a passive-on speed boost — it's a tool.
 */

import { Ability, type AbilityContext } from '../types';

const DURATION = 4.0;
const MULTIPLIER = 2.0;
const FOV_BOOST = 8;

export class Surge extends Ability {
  readonly id = 'surge' as const;
  readonly displayName = 'Surge';
  readonly baseCooldown = 18;

  protected onTrigger(ctx: AbilityContext): void {
    this.isActive = true;
    ctx.player.speedMultiplier = MULTIPLIER;
    // Camera FOV nudge — Game.ts reads abilityFovOffset and adds it to baseFov.
    ctx.player.abilityFovOffset = FOV_BOOST;
    document.body.classList.add('rush-active');
  }

  protected onActiveTick(_dt: number, ctx: AbilityContext): void {
    if (this.activeTime >= DURATION) {
      this.cancelActive(ctx);
    }
  }

  protected onActiveEnd(ctx: AbilityContext): void {
    ctx.player.speedMultiplier = 1.0;
    ctx.player.abilityFovOffset = 0;
    document.body.classList.remove('rush-active');
  }
}
