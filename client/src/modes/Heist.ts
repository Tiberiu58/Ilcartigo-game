/**
 * Heist — asymmetric Owner vs Thief mode (v1 skeleton).
 *
 * A deliberate departure from the arena loop: one side defends a mansion, the
 * other breaks in. This first cut establishes the foundation the fuller design
 * (stealable loot, traps, multiple thieves) will build on:
 *
 *   - THIEF: spawn outside at the gate, sneak into the mansion, reach the VAULT
 *     (a glowing objective in the cellar). Touch it → heist succeeds. Get shot
 *     by the Owner before then → caught (fail).
 *   - OWNER: spawn inside the grand hall, patrol, and gun down the intruder
 *     before they reach the vault. (Owner is the player when that side is
 *     chosen; otherwise an Owner-role bot defends.)
 *
 * Solo + self-contained: reuses the existing player/bot combat. The opposite
 * role is filled by the normal bot roster (re-homed to the mansion). No
 * protocol / server change. Game.tick calls update(dt); main.ts drives
 * start()/stop() + the side-select.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import { OWNER_SPAWN, THIEF_SPAWN } from '../maps/MansionMap';

export type HeistSide = 'thief' | 'owner';

/** Where the vault sits — in the cellar (matches MansionMap's cellar room). */
const VAULT_POS = new THREE.Vector3(-11, -2.9, -9);
const VAULT_REACH = 2.4;       // metres: how close the thief must get

export interface HeistHooks {
  /** Update the HUD ticker (role + objective text). */
  onState?: (role: HeistSide, objective: string) => void;
  /** Fire when the round ends. `won` is from the LOCAL player's perspective. */
  onEnd?: (won: boolean, reason: string) => void;
}

export class Heist {
  active = false;
  side: HeistSide = 'thief';
  hooks: HeistHooks = {};

  private game: Game;
  private vaultMesh: THREE.Mesh | null = null;
  private vaultGlow: THREE.PointLight | null = null;
  private glowPhase = 0;
  private ended = false;
  private _tmp = new THREE.Vector3();

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a heist round on the chosen side. The map is already the mansion
   *  (set by main.ts before this), and the player spawn was forced via
   *  Game.heistSpawn. */
  start(side: HeistSide) {
    this.side = side;
    this.active = true;
    this.ended = false;
    this.buildVault();
    this.pushState();
  }

  stop() {
    this.active = false;
    this.removeVault();
  }

  /** Per-frame update from Game.tick (only while a heist is active). */
  update(dt: number) {
    if (!this.active || this.ended) return;

    // Pulse the vault glow so it reads as the objective beacon.
    if (this.vaultGlow) {
      this.glowPhase += dt * 2.2;
      this.vaultGlow.intensity = 1.1 + Math.sin(this.glowPhase) * 0.5;
    }

    // THIEF (local player) — win by reaching the vault.
    if (this.side === 'thief') {
      this.game.player.eyePos(this._tmp);
      this._tmp.y = VAULT_POS.y;   // compare on the cellar plane
      if (this._tmp.distanceTo(VAULT_POS) <= VAULT_REACH) {
        this.finish(true, 'You reached the vault — heist successful!');
      }
    }
    // OWNER (local player) — win by eliminating the intruder. The thief-role bot
    // dying is detected via the kill bus (wired in main.ts → onIntruderDown()).
  }

  /** Called (from main.ts kill handler) when the thief-role bot is eliminated
   *  while the player is the Owner. */
  onIntruderDown() {
    if (this.active && !this.ended && this.side === 'owner') {
      this.finish(true, 'Intruder neutralised — the manor is secure!');
    }
  }

  /** Called when the local player (whichever side) is killed. */
  onPlayerDown() {
    if (!this.active || this.ended) return;
    if (this.side === 'thief') this.finish(false, 'Caught by the owner — heist failed.');
    else this.finish(false, 'The thief slipped past you — they got the loot.');
  }

  private finish(won: boolean, reason: string) {
    this.ended = true;
    this.game.audio.play(won ? 'match_end' : 'death');
    this.hooks.onEnd?.(won, reason);
  }

  private pushState() {
    const obj = this.side === 'thief'
      ? 'break in · reach the vault'
      : 'defend the vault · stop the thief';
    this.hooks.onState?.(this.side, obj);
  }

  /** Spawn the glowing vault objective into the world (cellar). */
  private buildVault() {
    this.removeVault();
    const geom = new THREE.BoxGeometry(1.6, 2.0, 1.0);
    const mat = new THREE.MeshLambertMaterial({
      color: 0xd4af37,            // gold vault door
      emissive: 0x4a3a10,
      emissiveIntensity: 0.6,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(VAULT_POS).setY(VAULT_POS.y + 1.0);
    this.game.world.addDecoration(mesh);
    this.vaultMesh = mesh;

    const glow = new THREE.PointLight(0xffd24a, 1.1, 16, 2);
    glow.position.copy(VAULT_POS).setY(VAULT_POS.y + 1.4);
    this.game.world.addDecoration(glow);
    this.vaultGlow = glow;
  }

  private removeVault() {
    if (this.vaultMesh) { this.game.world.removeDecoration(this.vaultMesh); this.vaultMesh = null; }
    if (this.vaultGlow) { this.game.world.removeDecoration(this.vaultGlow); this.vaultGlow = null; }
  }

  /** Spawn point for the chosen side. */
  static spawnFor(side: HeistSide): THREE.Vector3 {
    return (side === 'owner' ? OWNER_SPAWN : THIEF_SPAWN).clone();
  }
}
