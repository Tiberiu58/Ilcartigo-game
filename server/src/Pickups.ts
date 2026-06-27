/**
 * Pickups — shared placement + tuning data for map pickups.
 *
 * DUPLICATED from /client/src/maps/Pickups.ts — keep the two in sync (same as
 * MapCollision / Protocol). The server owns pickup state authoritatively in MP;
 * the client mirrors it (and runs the identical logic locally in solo).
 *
 * v1 ships health packs only. The `type` field leaves room for ammo /
 * overshield / speed pads later without a data-shape change.
 */

export type PickupType = 'health';

export interface PickupDef {
  id: number;
  type: PickupType;
  pos: readonly [number, number, number];
}

/** HP restored by a health pack (clamped to the player's max). */
export const HEALTH_PICKUP_AMOUNT = 40;
/** Time a pickup stays gone after being grabbed, in ms. */
export const PICKUP_RESPAWN_MS = 12_000;
/** Horizontal pickup radius. */
export const PICKUP_RADIUS = 1.3;
/** Vertical tolerance between the player's feet and the pad. */
export const PICKUP_VERTICAL_TOLERANCE = 2.5;

export const PICKUPS_BY_MAP: Record<string, readonly PickupDef[]> = {
  sandstone: [
    { id: 1, type: 'health', pos: [  0, 0.6,  18] },
    { id: 2, type: 'health', pos: [  0, 0.6, -18] },
    { id: 3, type: 'health', pos: [ 18, 0.6,   0] },
    { id: 4, type: 'health', pos: [-18, 0.6,   0] },
  ],
  industrial: [
    { id: 1, type: 'health', pos: [ 40, 0.6,   0] },
    { id: 2, type: 'health', pos: [-30, 0.6,   0] },
    { id: 3, type: 'health', pos: [  0, 0.6,  28] },
    { id: 4, type: 'health', pos: [  0, 0.6, -28] },
  ],
  // Cobalt — solo-only map; kept in sync with client/maps/Pickups.ts even
  // though the MP server never loads it.
  cobalt: [
    { id: 1, type: 'health', pos: [ 14, 0.6,   0] },
    { id: 2, type: 'health', pos: [-14, 0.6,   0] },
    { id: 3, type: 'health', pos: [  0, 0.6,  16] },
    { id: 4, type: 'health', pos: [  0, 0.6, -16] },
  ],
  // Overpass — solo-only map; kept in sync with client/maps/Pickups.ts.
  overpass: [
    { id: 1, type: 'health', pos: [  0, 0.6,  24] },
    { id: 2, type: 'health', pos: [  0, 0.6, -24] },
    { id: 3, type: 'health', pos: [ 30, 0.6,   0] },
    { id: 4, type: 'health', pos: [-30, 0.6,   0] },
  ],
  // Frostline — solo-only map (server stays on Sandstone/Industrial); kept for parity.
  frostline: [
    { id: 1, type: 'health', pos: [ 14, 0.6,   0] },
    { id: 2, type: 'health', pos: [-14, 0.6,   0] },
    { id: 3, type: 'health', pos: [  0, 0.6,  16] },
    { id: 4, type: 'health', pos: [  0, 0.6, -16] },
  ],
  // Foundry — solo-only map; kept for parity.
  foundry: [
    { id: 1, type: 'health', pos: [ 14, 0.6,   0] },
    { id: 2, type: 'health', pos: [-14, 0.6,   0] },
    { id: 3, type: 'health', pos: [  0, 0.6,  16] },
    { id: 4, type: 'health', pos: [  0, 0.6, -16] },
  ],
};
