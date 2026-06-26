/**
 * WeaponInventory — owns Primary + Secondary weapons, swap logic, scope state.
 *
 * Slot model (matches CS/Krunker convention):
 *   slot 1 = Primary (AR / SMG / Sniper / Shotgun — chosen in loadout)
 *   slot 2 = Secondary (Pistol — always equipped, no reserve cap)
 *
 * Swap behavior:
 *   - Pressing 1/2 swaps to that slot (no-op if same).
 *   - Q swaps to the last-used slot (quick-swap convention).
 *   - When the active weapon is empty AND the player presses fire, we
 *     auto-swap to the pistol so they can keep shooting. Strict-mode players
 *     will hate this so we keep it gated behind autoSwapOnEmpty.
 *
 * Scope:
 *   - Only weapons with `scopeFov` defined can scope. RMB toggles.
 *   - While scoped: viewmodel hidden, camera FOV = scopeFov, sensitivity
 *     scaled by fovRatio so wrist movement maps consistently across zoom.
 *   - Switching weapons or firing the swap auto-unscopes.
 */

import { Weapon, WEAPON_LIBRARY, type WeaponId } from './Weapon';
import type { World } from '../core/World';
import type { GameEventBus } from '../core/events';

export type Slot = 0 | 1;       // 0 = primary, 1 = secondary

export class WeaponInventory {
  readonly weapons: [Weapon, Weapon];
  private world: World;
  private bus: GameEventBus;
  private ownerId: string;
  private active: Slot = 0;
  private last: Slot = 1;
  private scoped = false;
  /** TDM team (friendly-fire). Persisted here so it survives setPrimary, which
   *  builds a fresh Weapon. Undefined = FFA. */
  private ownerTeam: number | undefined = undefined;
  /** Arena power-up multipliers — persisted so they survive setPrimary. */
  private damageMultiplier = 1.0;
  private fireRateMultiplier = 1.0;

  // For swap-pending state: the next weapon-id queue, set when 1/2 pressed but
  // we're still in the middle of an in-flight swap animation. Viewmodel owns
  // the visual; this owns the *logical* swap timing so fire is gated.
  private swapLockoutUntil = 0; // performance.now() ms; fire blocked until this
  private static SWAP_LOCKOUT_MS = 320;

  autoSwapOnEmpty = true;

  constructor(primaryId: WeaponId, world: World, bus: GameEventBus, ownerId: string) {
    if (primaryId === 'pistol') {
      throw new Error('Pistol cannot be the primary slot — it is always secondary.');
    }
    this.world = world;
    this.bus = bus;
    this.ownerId = ownerId;
    const primary = new Weapon(WEAPON_LIBRARY[primaryId], world, bus, ownerId);
    const pistol = new Weapon(WEAPON_LIBRARY['pistol'], world, bus, ownerId);
    this.weapons = [primary, pistol];
  }

  /** Replace the primary-slot weapon — used by the loadout selector. */
  setPrimary(id: WeaponId): WeaponId {
    if (id === 'pistol') return this.weapons[0].config.id as WeaponId;
    const prevMul = this.weapons[0]?.reloadMultiplier ?? 1.0;
    this.weapons[0] = new Weapon(WEAPON_LIBRARY[id], this.world, this.bus, this.ownerId);
    this.weapons[0].reloadMultiplier = prevMul;
    this.weapons[0].ownerTeam = this.ownerTeam;
    this.weapons[0].damageMultiplier = this.damageMultiplier;
    this.weapons[0].fireRateMultiplier = this.fireRateMultiplier;
    this.active = 0;
    this.scoped = false;
    return id;
  }

  /** Apply a global reload multiplier (Rush passive). */
  setReloadMultiplier(m: number) {
    for (const w of this.weapons) w.reloadMultiplier = m;
  }

  /** Instantly refill both weapons' mags (killstreak RESUPPLY reward). */
  refillAll() {
    for (const w of this.weapons) w.refill();
  }

  /** Arena OVERCHARGE power-up — scale outgoing damage on both weapons. */
  setDamageMultiplier(m: number) {
    this.damageMultiplier = m;
    for (const w of this.weapons) w.damageMultiplier = m;
  }

  /** Arena RAPID power-up — scale fire rate on both weapons. */
  setFireRateMultiplier(m: number) {
    this.fireRateMultiplier = m;
    for (const w of this.weapons) w.fireRateMultiplier = m;
  }

  /** Set the TDM friendly-fire team on every weapon (and remember it so a later
   *  setPrimary keeps it). Undefined restores FFA semantics. */
  setOwnerTeam(team: number | undefined) {
    this.ownerTeam = team;
    for (const w of this.weapons) w.ownerTeam = team;
  }

  get current(): Weapon { return this.weapons[this.active]; }
  get activeSlot(): Slot { return this.active; }
  get isScoped(): boolean { return this.scoped; }
  get isSwapping(): boolean { return performance.now() < this.swapLockoutUntil; }

  update(dt: number) {
    for (const w of this.weapons) w.update(dt);
  }

  /** Select a specific slot. Returns true if we actually moved. */
  selectSlot(slot: Slot): boolean {
    if (slot === this.active) return false;
    // Abort any in-flight burst on the weapon we're leaving so it can't resume
    // firing if we swap back to it later.
    this.current.cancelBurst();
    this.last = this.active;
    this.active = slot;
    this.scoped = false;
    this.swapLockoutUntil = performance.now() + WeaponInventory.SWAP_LOCKOUT_MS;
    return true;
  }

  /** Quick-swap to the previously-used slot. */
  swapLast(): boolean {
    return this.selectSlot(this.last);
  }

  /** Called by the fire handler — returns true if the swap fired. */
  tryAutoSwapToPistol(): boolean {
    if (!this.autoSwapOnEmpty) return false;
    if (this.active === 1) return false;
    if (this.current.ammo > 0 || this.current.isReloading) return false;
    return this.selectSlot(1);
  }

  setScoped(scoped: boolean) {
    if (this.current.config.scopeFov === undefined) {
      this.scoped = false;
      return;
    }
    this.scoped = scoped;
  }
}
