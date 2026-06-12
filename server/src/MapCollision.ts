/**
 * MapCollision — THREE-free collision AABBs for each map.
 *
 * The map *visual* lives in SandstoneMap.ts / IndustrialMap.ts (THREE meshes).
 * The collision *data* lives here as plain numeric arrays so the server can
 * import it without pulling THREE into a Node process.
 *
 * Format: each map exports an array of [minX, minY, minZ, maxX, maxY, maxZ]
 * tuples. Position is world space. Players are feet-anchored so player AABB
 * extends y..y+1.8 from their feet.
 *
 * IMPORTANT: the visual maps must keep their solid box layout in sync with
 * these arrays. For the MVP we ship Sandstone-only collision; Industrial
 * gets added in Phase 7b if/when MP supports multiple maps.
 */

export type SolidAABB = readonly [number, number, number, number, number, number];

/**
 * Helper: build an AABB from a center + size triple. Mirrors how the visual
 * maps call addBox/addSolidBox so the numbers line up.
 */
function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): SolidAABB {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  return [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz];
}

/**
 * Bake stair treads from `from`→`to` with total rise. Mirrors buildStairs()
 * in IndustrialMap.ts: each tread is a solid box from ground to its tread
 * height (so stairs read as solid from the side). Treads are 0.35m tall,
 * matching the controller's auto step-up threshold.
 */
function stairs(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  totalRise: number,
): SolidAABB[] {
  const TREAD_RISE = 0.35;
  const steps = Math.ceil(totalRise / TREAD_RISE);
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const runLen = Math.hypot(dx, dz);
  if (runLen < 0.01) return [];
  const dirX = dx / runLen;
  const dirZ = dz / runLen;
  const treadDepth = runLen / steps;
  const perpX = -dirZ;
  const perpZ = dirX;
  const sideWidth = 2.2;
  const out: SolidAABB[] = [];
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * TREAD_RISE;
    const cx = fromX + dirX * (treadDepth * (i + 0.5));
    const cz = fromZ + dirZ * (treadDepth * (i + 0.5));
    const sx = Math.abs(dirX) * treadDepth + Math.abs(perpX) * sideWidth;
    const sz = Math.abs(dirZ) * treadDepth + Math.abs(perpZ) * sideWidth;
    out.push(box(cx, y / 2, cz, sx, y, sz));
  }
  return out;
}

/**
 * Sandstone collision boxes. Mirrors SandstoneMap.ts's `addBox(... , true)` calls
 * 1:1 — if SandstoneMap.ts changes, this needs updating.
 *
 * NB the ground plane is included as a single big floor box. Decorative tiles
 * (collide=false in SandstoneMap) are NOT here, by definition.
 */
export const SANDSTONE_COLLISION: readonly SolidAABB[] = [
  // Ground
  box(0, -0.5, 0, 90, 1, 90),

  // Perimeter walls (south + north + east + west)
  // South wall has the doorway gap centered on x=0 — match SandstoneMap's split.
  box(-27, 4, -45, 46, 8, 1),     // south wall left of gap (was -PERIM)
  box( 27, 4, -45, 46, 8, 1),     // south wall right of gap
  // Lintel above south gap was non-collision-decorative in SandstoneMap; we
  // include nothing here since it doesn't block movement (visual only).
  box(  0, 4,  45, 90, 8, 1),     // north wall (full)
  box(-45, 4,   0, 1, 8, 90),     // west wall
  box( 45, 4,   0, 1, 8, 90),     // east wall

  // Corner buildings — main mass + roof slab from `building()`.
  // NE building (24, 24)
  box( 24, 2.0,  24, 14, 4, 12),
  box( 24, 4.25, 24, 14.6, 0.5, 12.6),
  // NW building (-24, 24)
  box(-24, 2.0,  24, 14, 4, 12),
  box(-24, 4.25, 24, 14.6, 0.5, 12.6),
  // SE building (24, -24)
  box( 24, 2.0, -24, 14, 4, 12),
  box( 24, 4.25,-24, 14.6, 0.5, 12.6),
  // SW building (-24, -24)
  box(-24, 2.0, -24, 14, 4, 12),
  box(-24, 4.25,-24, 14.6, 0.5, 12.6),

  // Mid-flank short blocks (shortBlock(): main + roof)
  box( 16, 1.25,  10, 6, 2.5, 6),
  box( 16, 2.7,   10, 6.4, 0.4, 6.4),
  box(-16, 1.25,  10, 6, 2.5, 6),
  box(-16, 2.7,   10, 6.4, 0.4, 6.4),
  box( 16, 1.25, -10, 6, 2.5, 6),
  box( 16, 2.7,  -10, 6.4, 0.4, 6.4),
  box(-16, 1.25, -10, 6, 2.5, 6),
  box(-16, 2.7,  -10, 6.4, 0.4, 6.4),

  // Central monument tower (2 tiers + top platform)
  box(0, 2.5, 0, 4, 5, 4),
  box(0, 5.5, 0, 3, 1, 3),
  box(0, 6.5, 0, 2.2, 1, 2.2),
  box(0, 7.2, 0, 1.6, 0.4, 1.6),

  // Catwalk segments (catwalkSegment() — collide=true) at y=4
  box(   2, 4,   8,  3, 0.4, 12),
  box(  16, 4,  14, 12, 0.4,  3),
  box(  -2, 4,   8,  3, 0.4, 12),
  box( -16, 4,  14, 12, 0.4,  3),

  // Sandbag stacks (stack() — each = 2 boxes)
  box( 6, 0.25, 0,  1.8, 0.5, 0.8),
  box( 6, 0.75, 0,  1.6, 0.5, 0.7),
  box(-6, 0.25, 0,  1.8, 0.5, 0.8),
  box(-6, 0.75, 0,  1.6, 0.5, 0.7),
  box( 0, 0.25, 6,  1.8, 0.5, 0.8),
  box( 0, 0.75, 6,  1.6, 0.5, 0.7),
  box( 0, 0.25,-6,  1.8, 0.5, 0.8),
  box( 0, 0.75,-6,  1.6, 0.5, 0.7),

  // Wooden crate stacks (crate())
  box( 10, 0.7,  18, 1.4, 1.4, 1.4),
  box( 12, 2.1,  18, 1.4, 1.4, 1.4),
  box(-10, 0.7,  18, 1.4, 1.4, 1.4),
  box(-10, 0.7,  20, 1.4, 1.4, 1.4),
  box( 10, 0.7, -18, 1.4, 1.4, 1.4),
  box(-10, 0.7, -18, 1.4, 1.4, 1.4),
  box(-12, 2.1, -18, 1.4, 1.4, 1.4),

  // Tall central reference pillar (from buildTestMap... wait, no — Sandstone
  // doesn't have one. Skipping.)
];

/**
 * Industrial collision boxes. Mirrors IndustrialMap.ts's collide=true calls.
 * Stairs are baked via stairs() helper.
 */
export const INDUSTRIAL_COLLISION: readonly SolidAABB[] = [
  // Ground
  box(0, -0.5, 0, 100, 1, 80),

  // Perimeter walls (south + north + east + west)
  box(  0,  5, -40, 100, 10, 1),
  box(  0,  5,  40, 100, 10, 1),
  box(-50,  5,   0, 1, 10, 80),
  box( 50,  5,   0, 1, 10, 80),

  // Warehouse interior dividing wall (3 segments around 2 doorways)
  box(5, 4.0, -27, 1, 8, 26),
  box(5, 4.0,  -1, 1, 8, 18),
  box(5, 4.0,  28, 1, 8, 24),

  // Shipping containers (interior CQB zone) — shipContainer() main mass
  // Long: 6×2.5×2.5; Short: 2.5×2.5×6. Door panels are decoration-only.
  box(-35,  1.25,  18, 6, 2.5, 2.5),
  box(-25,  1.25,  18, 6, 2.5, 2.5),
  box(-38,  1.25,   5, 2.5, 2.5, 6),
  box(-28,  1.25,   5, 2.5, 2.5, 6),
  box(-35,  1.25, -18, 6, 2.5, 2.5),
  box(-22,  1.25, -18, 6, 2.5, 2.5),
  // Stacked corner container — baseY=0 + baseY=2.5
  box(-42,  1.25,  -8, 4, 2.5, 4),
  box(-42,  3.75,  -8, 4, 2.5, 4),

  // Crates
  box(-15, 0.7,  10, 1.4, 1.4, 1.4),
  box(-12, 0.7,  -3, 1.4, 1.4, 1.4),
  box(-20, 0.7,  -8, 1.4, 1.4, 1.4),
  box(-35, 0.7,  -2, 1.4, 1.4, 1.4),

  // Interior stairs (NW + SW). Each runs (-12, _, ±22) → (-6, _, ±22), rise 4.
  ...stairs(-12, 22, -6, 22, 4),
  ...stairs(-12, -22, -6, -22, 4),

  // Center catwalks (catwalkDeck — deck only, decorations skipped)
  box(10, 4, 0, 2.5, 0.4, 70),     // L1 at x=10
  box(20, 4, 0, 2.5, 0.4, 70),     // L1 at x=20
  box(15, 4, 0, 10, 0.4, 2.5),     // cross-link at z=0
  box(15, 8, 0, 2.5, 0.4, 50),     // L2

  // Stair L1 → L2 at center (13,4) → (17,4), rise 4. Note: starts elevated.
  // For collision we offset y manually since stairs() assumes ground start.
  // The catwalk-to-catwalk stair physically starts at y=4 and rises to y=8.
  // We treat it as a single stack of boxes at the catwalk y-level.
  ...stairs(13, 0, 17, 0, 4).map<SolidAABB>((b) => [b[0], b[1] + 4, b[2], b[3], b[4] + 4, b[5]]),

  // Catwalk support pillars (visual+occasional cover)
  ...[-30, -15, 0, 15, 30].flatMap<SolidAABB>((z) => [
    box(10, 2, z, 0.4, 4, 0.4),
    box(20, 2, z, 0.4, 4, 0.4),
  ]),
  ...[-20, 0, 20].map<SolidAABB>((z) => box(15, 6, z, 0.3, 4, 0.3)),

  // East yard: container stacks + crates + iron columns
  box(38,  1.25,  30, 6, 2.5, 2.5),
  box(38,  1.25, -30, 6, 2.5, 2.5),
  box(32, 0.7,  5, 1.4, 1.4, 1.4),
  box(34, 0.7,  5, 1.4, 1.4, 1.4),
  box(32, 0.7, -5, 1.4, 1.4, 1.4),
  box(34, 0.7, -5, 1.4, 1.4, 1.4),
  box(35, 5,  15, 1, 10, 1),
  box(35, 5, -15, 1, 10, 1),

  // East-yard stair to L1 catwalk (46, _, 18) → (46, _, 12), rise 4
  ...stairs(46, 18, 46, 12, 4),

  // Loft (south, x=8, z=-30): platform + rail + 4 support pillars
  box(8, 3.0, -30, 6, 0.4, 6),
  box(8, 3.6, -27, 6, 1.0, 0.2),         // north rail (collision)
  box(8 - 2.5, 1.5, -30 - 2.5, 0.3, 3, 0.3),
  box(8 + 2.5, 1.5, -30 - 2.5, 0.3, 3, 0.3),
  box(8 - 2.5, 1.5, -30 + 2.5, 0.3, 3, 0.3),
  box(8 + 2.5, 1.5, -30 + 2.5, 0.3, 3, 0.3),
  // Loft stair (8, _, -35) → (8, _, -33), rise 3
  ...stairs(8, -35, 8, -33, 3),
];

/**
 * Foundry collision boxes. Mirrors FoundryMap.ts's `addBox(..., true)` calls
 * 1:1 (18 solids: ground + 4 perimeter walls + central bunker + 4 buttresses +
 * 8 crates). Jump pads + all collide=false decoration are excluded by design.
 */
export const FOUNDRY_COLLISION: readonly SolidAABB[] = [
  // Steel deck (top at y=0)
  box(0, -0.5, 0, 80, 1, 80),

  // Perimeter walls (P=36, H=4 → 8m tall, 1m thick)
  box(0,  4, -36, 72, 8, 1),
  box(0,  4,  36, 72, 8, 1),
  box(-36, 4,  0, 1, 8, 72),
  box( 36, 4,  0, 1, 8, 72),

  // Central bunker (roof at y=6) — the high ground
  box(0, 3, 0, 20, 6, 20),

  // Mid-edge buttress cover walls (2.5m tall) — at ±24, clear of bot spawn (0,-22)
  box(0,  1.25,  24, 10, 2.5, 1.5),
  box(0,  1.25, -24, 10, 2.5, 1.5),
  box( 24, 1.25,  0, 1.5, 2.5, 10),
  box(-24, 1.25,  0, 1.5, 2.5, 10),

  // Crates — four near the corner spawns + four on the inner diagonals
  box( 26, 0.7,  26, 1.4, 1.4, 1.4),
  box(-26, 0.7,  26, 1.4, 1.4, 1.4),
  box( 26, 0.7, -26, 1.4, 1.4, 1.4),
  box(-26, 0.7, -26, 1.4, 1.4, 1.4),
  box( 14, 0.7,  14, 1.4, 1.4, 1.4),
  box(-14, 0.7,  14, 1.4, 1.4, 1.4),
  box( 14, 0.7, -14, 1.4, 1.4, 1.4),
  box(-14, 0.7, -14, 1.4, 1.4, 1.4),
];

/** Lookup by map id — server's MAP env var picks one of these. */
export const COLLISION_BY_MAP: Record<string, readonly SolidAABB[]> = {
  sandstone: SANDSTONE_COLLISION,
  industrial: INDUSTRIAL_COLLISION,
  foundry: FOUNDRY_COLLISION,
};
