/**
 * Damageable — anything a hitscan ray can register against.
 *
 * Weapons walk a list of registered targets, ray-test their hit AABBs, pick
 * the nearest. Headshot detection is a separate AABB on top.
 */

import type * as THREE from 'three';
import type { Health } from './Health';

export interface HitAABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface Damageable {
  readonly id: string;
  readonly health: Health;
  readonly team: number;            // 0 = player, 1 = bots; matters in TDM later
  /** Body hitbox in world space. Updated each frame by the entity. */
  bodyAABB(): HitAABB;
  /** Head hitbox in world space, or null if no headshot multiplier. */
  headAABB(): HitAABB | null;
}
