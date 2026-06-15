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

export type MapId = 'practice' | 'sandstone' | 'industrial' | 'frostbite';

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
}

export interface GameMap {
  meta: MapMeta;
  build(world: World): void;
}
