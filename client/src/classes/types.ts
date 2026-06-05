/**
 * Class + Ability data model.
 *
 * A class is a *configuration* (passives + which active ability) + an Ability
 * instance. Adding a new class = one ClassConfig entry. The Ability subclass
 * pattern keeps each ability's state local: it's the only thing that has to
 * know about timers, charges, and side-effects.
 *
 * AbilityContext is the *only* surface an ability sees of the engine. Keeps
 * abilities testable in isolation and makes the Phase 7 networking boundary
 * obvious: this is the seam where ability events serialize.
 */

import type * as THREE from 'three';
import type { PlayerController } from '../entities/PlayerController';
import type { PlayerActor } from '../entities/PlayerActor';
import type { World } from '../core/World';
import type { GameEventBus } from '../core/events';
import type { Viewmodel } from '../weapons/Viewmodel';
import type { CastFX } from '../core/CastFX';

export type ClassId = 'phantom' | 'rush' | 'vanguard' | 'ghost' | 'engineer' | 'hunter';
export type AbilityId = 'blink' | 'surge' | 'dash' | 'cloak' | 'barrier' | 'pulse';

export interface ClassPassive {
  /** Bonus max HP (Vanguard +15). */
  bonusMaxHp?: number;
  /** Multiplier on all ability cooldowns (Engineer 0.85 = -15%). */
  cooldownMultiplier?: number;
  /** Multiplier on reload time (Rush 0.7 = 30% faster). */
  reloadMultiplier?: number;
  /** Footstep silencing — Phantom 1.0 (silent), Ghost 0.5. Wired up in Phase 5 audio. */
  footstepVolume?: number;
  /** Show enemy footstep direction indicators (Hunter). Wired in Phase 5. */
  showsFootstepDirection?: boolean;
}

export interface ClassConfig {
  id: ClassId;
  displayName: string;
  /** Hex color used for UI accents and the silhouette in class-select. */
  color: number;
  abilityId: AbilityId;
  passive: ClassPassive;
  /** One-line in-game description shown on the class card. */
  blurb: string;
}

export const CLASS_LIBRARY: Record<ClassId, ClassConfig> = {
  phantom: {
    id: 'phantom',
    displayName: 'Phantom',
    color: 0x9c64ff,
    abilityId: 'blink',
    passive: { footstepVolume: 0.0 },
    blurb: 'Short-range blink. Silent footsteps.',
  },
  rush: {
    id: 'rush',
    displayName: 'Rush',
    color: 0xff8a3a,
    abilityId: 'surge',
    passive: { reloadMultiplier: 0.7 },
    blurb: 'Sprint burst. Faster reload.',
  },
  vanguard: {
    id: 'vanguard',
    displayName: 'Vanguard',
    color: 0x4ac8a8,
    abilityId: 'dash',
    passive: { bonusMaxHp: 15 },
    blurb: 'Two directional dashes. Extra HP.',
  },
  ghost: {
    id: 'ghost',
    displayName: 'Ghost',
    color: 0xa0a8b8,
    abilityId: 'cloak',
    passive: { footstepVolume: 0.5 },
    blurb: 'Invisibility. Breaks on shooting.',
  },
  engineer: {
    id: 'engineer',
    displayName: 'Engineer',
    color: 0xf5d442,
    abilityId: 'barrier',
    passive: { cooldownMultiplier: 0.85 },
    blurb: 'Deployable shield wall. Faster ability cooldowns.',
  },
  hunter: {
    id: 'hunter',
    displayName: 'Hunter',
    color: 0xff5a7e,
    abilityId: 'pulse',
    passive: { showsFootstepDirection: true },
    blurb: 'Reveals enemies through walls. Footstep direction passive.',
  },
};

export const CLASS_ORDER: ClassId[] = [
  'phantom', 'rush', 'vanguard', 'ghost', 'engineer', 'hunter',
];

export interface AbilityContext {
  player: PlayerController;
  /** Damageable wrapper for the player — exposes Health + cloak flag etc. */
  playerActor: PlayerActor;
  world: World;
  bus: GameEventBus;
  viewmodel: Viewmodel;
  camera: THREE.PerspectiveCamera;
  fx: CastFX;
  /** Engineer's passive — applied to base cooldown. 1.0 for non-Engineer. */
  cooldownMultiplier: number;
}

export abstract class Ability {
  abstract readonly id: AbilityId;
  abstract readonly displayName: string;
  /** Base cooldown in seconds; the AbilityRunner applies the class multiplier. */
  abstract readonly baseCooldown: number;
  /** Number of charges (Dash = 2, everything else = 1). */
  readonly maxCharges: number = 1;

  protected cooldownLeft = 0;
  protected charges: number;
  /** How long the ability has been actively in effect (Surge / Cloak / Barrier). */
  protected activeTime = 0;
  protected isActive = false;

  constructor() {
    this.charges = this.maxCharges;
  }

  get currentCharges(): number { return this.charges; }
  get isReady(): boolean { return this.charges > 0 && !this.isActive; }
  /** 0 = just fired, 1 = ready. Used for HUD ring. */
  get cooldownProgress(): number {
    if (this.charges >= this.maxCharges) return 1;
    return 1 - (this.cooldownLeft / (this.baseCooldown || 1));
  }
  get active(): boolean { return this.isActive; }

  /** Called every frame by AbilityRunner. */
  update(dt: number, ctx: AbilityContext) {
    if (this.cooldownLeft > 0 && this.charges < this.maxCharges) {
      this.cooldownLeft -= dt;
      if (this.cooldownLeft <= 0) {
        this.charges = Math.min(this.maxCharges, this.charges + 1);
        // Multi-charge abilities restart the timer for the next charge.
        if (this.charges < this.maxCharges) {
          this.cooldownLeft = this.baseCooldown * ctx.cooldownMultiplier;
        } else {
          this.cooldownLeft = 0;
        }
      }
    }
    if (this.isActive) {
      this.activeTime += dt;
      this.onActiveTick(dt, ctx);
    }
  }

  /** Player pressed the ability key. Spends a charge if accepted. */
  tryTrigger(ctx: AbilityContext): boolean {
    if (this.isActive) return false;
    if (this.charges <= 0) return false;
    this.charges--;
    if (this.cooldownLeft <= 0) {
      this.cooldownLeft = this.baseCooldown * ctx.cooldownMultiplier;
    }
    this.activeTime = 0;
    this.onTrigger(ctx);
    return true;
  }

  /** Force-end any active state (e.g. Cloak interrupted by firing). */
  cancelActive(ctx: AbilityContext) {
    if (this.isActive) {
      this.isActive = false;
      this.onActiveEnd(ctx);
    }
  }

  /** Subclasses implement these — instantaneous abilities only need onTrigger. */
  protected abstract onTrigger(ctx: AbilityContext): void;
  protected onActiveTick(_dt: number, _ctx: AbilityContext): void {}
  protected onActiveEnd(_ctx: AbilityContext): void {}
}
