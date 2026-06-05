/**
 * PlayerActor — adapts PlayerController to the Damageable interface so bots
 * and weapons can target the player through the same pipeline they use for
 * each other.
 *
 * The controller stays focused on movement; this is a thin shell around it.
 */

import * as THREE from 'three';
import type { Damageable, HitAABB } from './Damageable';
import { Health } from './Health';
import type { PlayerController } from './PlayerController';

const BODY_HALF_X = 0.35;
const BODY_HALF_Z = 0.35;
// Body AABB top tracks the standing eye height + a small cushion so head
// AABB sits *above* body AABB. Head dims match the bot for consistency.
const HEAD_OFFSET = 1.55;
const HEAD_SIZE = 0.28;

export class PlayerActor implements Damageable {
  readonly id = 'player';
  readonly team = 0;
  readonly health = new Health(100);
  /** Ghost class invisibility — bots skip LoS engage while true. */
  isCloaked = false;
  private controller: PlayerController;

  // Reused scratch boxes.
  private _bodyMin = new THREE.Vector3();
  private _bodyMax = new THREE.Vector3();
  private _headMin = new THREE.Vector3();
  private _headMax = new THREE.Vector3();

  constructor(controller: PlayerController) {
    this.controller = controller;
  }

  bodyAABB(): HitAABB {
    const p = this.controller.pos;
    // Use *standing* height for hit detection even when crouched — we can refine
    // later by exposing the controller's current half-extent.
    this._bodyMin.set(p.x - BODY_HALF_X, p.y, p.z - BODY_HALF_Z);
    this._bodyMax.set(p.x + BODY_HALF_X, p.y + HEAD_OFFSET, p.z + BODY_HALF_Z);
    return { min: this._bodyMin, max: this._bodyMax };
  }

  headAABB(): HitAABB {
    const p = this.controller.pos;
    const h2 = HEAD_SIZE / 2;
    this._headMin.set(p.x - h2, p.y + HEAD_OFFSET, p.z - h2);
    this._headMax.set(p.x + h2, p.y + HEAD_OFFSET + HEAD_SIZE, p.z + h2);
    return { min: this._headMin, max: this._headMax };
  }
}
