/**
 * Pickups — shared placement + tuning data for map pickups.
 *
 * Like MapCollision, this file is DUPLICATED at /server/src/Pickups.ts and the
 * two must stay in sync. The server owns pickup state authoritatively in MP
 * (overlap → heal → cooldown → respawn, broadcast over the wire); the client
 * runs the identical logic locally in single-player and just renders + reflects
 * server state in MP.
 *
 * v1 ships health packs only. The `type` field is here so ammo / overshield /
 * speed-boost pads can be added later without a data-shape change.
 */

export type PickupType = 'health';

export interface PickupDef {
  /** Unique within a map. Stable across the session (used as the wire key). */
  id: number;
  type: PickupType;
  /** Ground position [x, y, z]. y is the pad base; the float bob is visual only. */
  pos: readonly [number, number, number];
}

/** HP restored by a health pack (clamped to the player's max). */
export const HEALTH_PICKUP_AMOUNT = 40;
/** Time a pickup stays gone after being grabbed, in ms. */
export const PICKUP_RESPAWN_MS = 12_000;
/** Horizontal pickup radius — a player within this of the pad (and roughly at
 *  its height) grabs it. */
export const PICKUP_RADIUS = 1.3;
/** Vertical tolerance — the player's feet must be within this of the pad's y. */
export const PICKUP_VERTICAL_TOLERANCE = 2.5;

/**
 * Per-map pickup layouts. Ids are unique per map. Positions sit on open ground
 * clear of the static collision boxes (kept in sync with MapCollision).
 */
export const PICKUPS_BY_MAP: Record<string, readonly PickupDef[]> = {
  sandstone: [
    { id: 1, type: 'health', pos: [  0, 0.6,  18] },   // N mid-lane
    { id: 2, type: 'health', pos: [  0, 0.6, -18] },   // S mid-lane
    { id: 3, type: 'health', pos: [ 18, 0.6,   0] },   // E mid-lane
    { id: 4, type: 'health', pos: [-18, 0.6,   0] },   // W mid-lane
  ],
  industrial: [
    { id: 1, type: 'health', pos: [ 40, 0.6,   0] },   // east yard centre
    { id: 2, type: 'health', pos: [-30, 0.6,   0] },   // west interior
    { id: 3, type: 'health', pos: [  0, 0.6,  28] },   // north floor
    { id: 4, type: 'health', pos: [  0, 0.6, -28] },   // south floor
  ],
  // Cobalt is a solo-only map (the MP server never loads it), but we keep its
  // pads here so the solo PickupManager finds them; mirrored in server/Pickups
  // for parity even though the server won't use them.
  cobalt: [
    { id: 1, type: 'health', pos: [ 14, 0.6,   0] },   // E mid
    { id: 2, type: 'health', pos: [-14, 0.6,   0] },   // W mid
    { id: 3, type: 'health', pos: [  0, 0.6,  16] },   // N mid (toward deck)
    { id: 4, type: 'health', pos: [  0, 0.6, -16] },   // S mid (toward deck)
  ],
  // Overpass — solo-only map; pads mirrored in server/Pickups for parity.
  overpass: [
    { id: 1, type: 'health', pos: [  0, 0.6,  24] },   // north lane
    { id: 2, type: 'health', pos: [  0, 0.6, -24] },   // south lane
    { id: 3, type: 'health', pos: [ 30, 0.6,   0] },   // east flank
    { id: 4, type: 'health', pos: [-30, 0.6,   0] },   // west flank
  ],
  // Frostline — solo-only map; pads mirrored in server/Pickups for parity.
  frostline: [
    { id: 1, type: 'health', pos: [ 14, 0.6,   0] },   // E mid
    { id: 2, type: 'health', pos: [-14, 0.6,   0] },   // W mid
    { id: 3, type: 'health', pos: [  0, 0.6,  16] },   // N mid (toward deck)
    { id: 4, type: 'health', pos: [  0, 0.6, -16] },   // S mid (toward deck)
  ],
};
