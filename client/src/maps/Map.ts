/**
 * Map system — pluggable scenes.
 *
 * Each map exports a `build(world)` that adds all geometry/lighting/jump-pads
 * to a fresh World, and a `meta` describing player spawn options. Game owns
 * which map is active and rebuilds the World when the player picks a new one.
 *
 * MapMeta lists FFA spawns (anywhere the player can drop in) and team spawns
 * (paired entries for TDM). Phase 5 ships FFA spawns + a single TDM pair per
 * map; per-mode zone sets can come later.
 */

import type * as THREE from 'three';
import type { World } from '../core/World';

export type MapId = 'practice' | 'sandstone' | 'industrial';

/**
 * Arena power-up kinds (Phase 13). Quake/Krunker-style pickups that spawn at
 * fixed map locations, get consumed on touch, and respawn on a timer:
 *   - health: instant heal
 *   - damage: timed outgoing-damage boost
 *   - haste:  timed move-speed boost
 * Effects + timings live in core/Pickups.ts (PICKUPS registry).
 */
export type PickupKind = 'health' | 'damage' | 'haste';

/** One power-up spawn location on a map. `pos` is feet-level (like a spawn). */
export interface PickupSpawn {
  kind: PickupKind;
  pos: THREE.Vector3;
}

export interface MapMeta {
  id: MapId;
  displayName: string;
  /** Free-for-all spawn points. Engine picks one at respawn, prefers ones
   *  furthest from active enemies (safe-spawn check). */
  ffaSpawns: THREE.Vector3[];
  /** Pair of team spawns for TDM. [team0, team1]. Optional — Practice has none. */
  teamSpawns?: [THREE.Vector3, THREE.Vector3];
  /** Color of the post-respawn screen-flash; defaults to bright cyan. */
  spawnFlashColor?: number;
  /** Arena power-up spawn points (Phase 13). Optional — Practice has none. */
  pickupSpawns?: PickupSpawn[];
}

export interface GameMap {
  meta: MapMeta;
  build(world: World): void;
}
