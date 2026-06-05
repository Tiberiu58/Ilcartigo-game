/**
 * AbilityRunner — owns the player's *current* class + ability instance.
 *
 * When the player changes class, we rebuild the ability instance (fresh
 * cooldowns, fresh charges) — easier to reason about than mutating state.
 *
 * Some abilities need external refs (Cloak → PlayerActor flag, Pulse → bots);
 * those are wired here after construction so the ability itself doesn't need
 * to know about engine-level objects.
 */

import { Ability, type AbilityContext, type ClassId, CLASS_LIBRARY } from './types';
import { Blink } from './abilities/Blink';
import { Surge } from './abilities/Surge';
import { Dash } from './abilities/Dash';
import { Cloak } from './abilities/Cloak';
import { Barrier } from './abilities/Barrier';
import { Pulse } from './abilities/Pulse';
import type { PlayerActor } from '../entities/PlayerActor';
import type { Bot } from '../entities/Bot';

export class AbilityRunner {
  private currentClass: ClassId;
  private currentAbility: Ability;
  private ctx: AbilityContext;
  private playerActor: PlayerActor;
  private botsRef: Bot[];

  constructor(initialClass: ClassId, ctx: AbilityContext, playerActor: PlayerActor, bots: Bot[]) {
    this.currentClass = initialClass;
    this.ctx = ctx;
    this.playerActor = playerActor;
    this.botsRef = bots;
    this.currentAbility = this.buildAbility(initialClass);
    this.applyPassive();
  }

  get classId(): ClassId { return this.currentClass; }
  get ability(): Ability { return this.currentAbility; }
  get config() { return CLASS_LIBRARY[this.currentClass]; }

  /** Change class — used on respawn or from the main menu. Rebuilds ability. */
  setClass(id: ClassId) {
    if (id === this.currentClass) return;
    // Tear down active state on the old ability before swapping it out.
    this.currentAbility.cancelActive(this.ctx);
    this.currentClass = id;
    this.currentAbility = this.buildAbility(id);
    this.applyPassive();
  }

  /** Forwarded by Game on the E keypress. */
  tryTrigger(): boolean {
    return this.currentAbility.tryTrigger(this.ctx);
  }

  /** Called by Game on every successful player shot, for Cloak. */
  notifyPlayerFired() {
    if (this.currentAbility instanceof Cloak) {
      this.currentAbility.cancelActive(this.ctx);
    }
  }

  update(dt: number) {
    this.currentAbility.update(dt, this.ctx);
  }

  /** Cooldown multiplier from class passive — fed back into AbilityContext. */
  private applyPassive() {
    const passive = this.config.passive;
    this.ctx.cooldownMultiplier = passive.cooldownMultiplier ?? 1.0;
    // Other passives (bonusMaxHp, reloadMultiplier) are applied by the caller
    // (Game) when the runner is built or reset — see Game.applyClassPassives().
  }

  private buildAbility(id: ClassId): Ability {
    const cfg = CLASS_LIBRARY[id];
    switch (cfg.abilityId) {
      case 'blink': return new Blink();
      case 'surge': return new Surge();
      case 'dash':  return new Dash();
      case 'cloak': {
        const a = new Cloak();
        a.playerActor = this.playerActor;
        return a;
      }
      case 'barrier': return new Barrier();
      case 'pulse': {
        const a = new Pulse();
        a.bots = this.botsRef;
        return a;
      }
    }
  }
}
