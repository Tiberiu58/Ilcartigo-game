/**
 * Industrial — rusty oxidized warehouse, 100m × 80m.
 *
 * Designed as a *complement* to Sandstone:
 *   - CQB-favored: tight interior corridors, container cover, lots of corners.
 *   - Two catwalk levels (y=4, y=8) cross the map N→S, reached via stairs.
 *   - One long sightline (east yard) — sniper's only good lane.
 *   - No jump pads — vertical travel is *deliberate* via stair routes.
 *
 * Layout (top-down, ~100 east-west, ~80 north-south):
 *
 *                       +X (east)  →
 *       +Z (north)
 *   ┌──────────────────────────────────────────────────────┐
 *   │ ╔══════ WAREHOUSE INTERIOR ══════╗   ┌─── L2 catwalk ──── EAST YARD
 *   │ ║ containers     containers      ║   │ (y=8)
 *   │ ║  ╓───╖   ╓─stairs─╖             ║   ├─── L1 catwalk ───── (y=4)
 *   │ ║  ║ A ║   ╚═════════╝            ║   │ ┌──┐
 *   │ ║  ╙───╜                          ║   │ │loft│ ← elevated
 *   │ ║  ╓─stairs─╖   ╓───╖             ║   └─┴──┘   └────────────────┐
 *   │ ║  ╚═════════╝   ║ B ║             ║   open yard (sniper lane)   │
 *   │ ║                ╙───╜             ║                              │
 *   │ ╚══════════════════════════════════╝                              │
 *   │   tight corridors • crate cover                                   │
 *   └──────────────────────────────────────────────────────────────────┘
 *       -Z (south)
 *                       -X (west)
 *
 * Spawn zones:
 *   - 4 FFA spawns at corners (one ground, one on L1 catwalk, two yard-ish)
 *   - TDM pair: north spawn (warehouse interior) vs south spawn (yard)
 *
 * Palette:
 *   - Floor: weathered concrete (cool gray-brown)
 *   - Walls: rusty corrugated steel (orange-brown)
 *   - Beams / supports: dark oxidized iron
 *   - Catwalks / stairs: weathered teal (Half-Life-ish accent)
 *   - Hazard accents: dull yellow stripes
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  concrete:     0x5a5550,    // floor — weathered, slightly warm gray
  concreteDk:   0x3d3a36,
  rust:         0xa05028,    // primary wall — corrugated steel rusted orange
  rustDark:     0x6f3a1d,    // shadowed side
  iron:         0x2a2622,    // dark oxidized beams
  teal:         0x4a8980,    // catwalk supports + signage
  tealDk:       0x2f5a55,
  hazard:       0xc0a838,    // dull yellow hazard stripe
  loft:         0x6a5046,    // wooden loft accent
};

const SPAWN_Y = 0.5;

// FFA spawns spread across corners + verticality so the safe-spawn picker has
// real choices. Two ground spawns at far corners + one on the L1 catwalk +
// one in the east yard near the loft.
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3(-42, SPAWN_Y,  32),    // NW warehouse interior corner
  new THREE.Vector3(-42, SPAWN_Y, -32),    // SW warehouse interior corner
  new THREE.Vector3( 28, 4.5,      0),    // mid L1 catwalk
  new THREE.Vector3( 42, SPAWN_Y, -28),    // SE yard corner
];

// TDM pair — N team in warehouse, S team in yard.
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(-30, SPAWN_Y,  35),
  new THREE.Vector3( 30, SPAWN_Y, -35),
];

export function buildIndustrial(world: World) {
  // Sky — dusty overcast brown. Fog at half map distance so the perimeter
  // fades into industrial smog.
  world.scene.background = new THREE.Color(0x6e5848);
  world.scene.fog = new THREE.Fog(0x6e5848, 40, 140);

  // Lighting — warm fluorescent overhead, cool fill so the shadow side of
  // walls stays readable. Slightly dimmer than Sandstone overall (we're
  // inside-ish).
  const hemi = new THREE.HemisphereLight(0xddc8a0, 0x4a3a30, 0.55);
  world.addDecoration(hemi);
  const sun = new THREE.DirectionalLight(0xffd8a8, 0.75);
  sun.position.set(20, 60, -10);
  world.addDecoration(sun);

  buildGround(world);
  buildPerimeter(world);
  buildWarehouseInterior(world);
  buildCenterCatwalks(world);
  buildEastYard(world);
  buildLoft(world);
}

// ── Ground & perimeter ──────────────────────────────────────────────────────

function buildGround(world: World) {
  // 100 × 80 concrete floor.
  addBox(world, 0, -0.5, 0, 100, 1, 80, PALETTE.concrete);

  // Hazard stripes at the south yard entrance — visual landmark.
  for (let i = -2; i <= 2; i++) {
    addBox(world, 38 + i * 1.2, -0.49, -38, 0.6, 0.02, 4, PALETTE.hazard, false);
  }
  // Faded floor markings in the warehouse interior — visual rhythm only.
  for (let x = -45; x <= -10; x += 8) {
    addBox(world, x, -0.49, 20, 5, 0.02, 0.2, PALETTE.concreteDk, false);
    addBox(world, x, -0.49, -20, 5, 0.02, 0.2, PALETTE.concreteDk, false);
  }
}

function buildPerimeter(world: World) {
  // 10m-high boundary walls, 1m thick. Rusty corrugated steel.
  const PX = 50;
  const PZ = 40;
  addBox(world,   0,  5, -PZ, PX * 2, 10, 1, PALETTE.rust);
  addBox(world,   0,  5,  PZ, PX * 2, 10, 1, PALETTE.rust);
  addBox(world, -PX,  5,   0, 1, 10, PZ * 2, PALETTE.rust);
  addBox(world,  PX,  5,   0, 1, 10, PZ * 2, PALETTE.rust);

  // Top capping beams — dark iron accent along each wall.
  addBox(world,   0, 10.3, -PZ, PX * 2, 0.5, 1.2, PALETTE.iron, false);
  addBox(world,   0, 10.3,  PZ, PX * 2, 0.5, 1.2, PALETTE.iron, false);
  addBox(world, -PX, 10.3,   0, 1.2, 0.5, PZ * 2, PALETTE.iron, false);
  addBox(world,  PX, 10.3,   0, 1.2, 0.5, PZ * 2, PALETTE.iron, false);
}

// ── West warehouse interior ─────────────────────────────────────────────────

function buildWarehouseInterior(world: World) {
  // The warehouse is bounded by an interior wall at x ≈ +5 (separating it from
  // the yard) with two openings: one near z=+12 (top), one near z=-12 (bottom).
  // Outer walls are already the perimeter.

  // Dividing wall — broken into segments to leave the two doorways.
  // Wall from (5, _, -40) up to (5, _, -14) — south chunk
  addBox(world,  5, 4.0, -27, 1, 8, 26, PALETTE.rust);
  // Wall from (5, _, -10) up to (5, _, 8) — middle chunk
  addBox(world,  5, 4.0,  -1, 1, 8, 18, PALETTE.rust);
  // Wall from (5, _, 16) up to (5, _, 40) — north chunk
  addBox(world,  5, 4.0,  28, 1, 8, 24, PALETTE.rust);
  // Top beam over each doorway so they read as arches.
  addBox(world,  5, 7.5, -12, 1, 1, 4, PALETTE.iron, false);
  addBox(world,  5, 7.5,  12, 1, 1, 4, PALETTE.iron, false);

  // Interior corridors — container blocks form the bones of the CQB area.
  // A container is 6m long × 2.5m wide × 2.5m tall — climbable in two steps.
  shipContainer(world, -35,  18, 6, 2.5, 2.5, PALETTE.rust);
  shipContainer(world, -25,  18, 6, 2.5, 2.5, PALETTE.rustDark);
  shipContainer(world, -38,   5, 2.5, 2.5, 6, PALETTE.rustDark);
  shipContainer(world, -28,   5, 2.5, 2.5, 6, PALETTE.rust);
  shipContainer(world, -35, -18, 6, 2.5, 2.5, PALETTE.rust);
  shipContainer(world, -22, -18, 6, 2.5, 2.5, PALETTE.rustDark);

  // Stack one container atop another in the corner — high vantage with stairs.
  shipContainer(world, -42, -8, 4, 2.5, 4, PALETTE.rustDark);
  shipContainer(world, -42, -8, 4, 2.5, 4, PALETTE.rust, 2.5);  // stacked at y=2.5

  // Crates — knee-high cover scattered through corridors.
  crate(world, -15,  10);
  crate(world, -12,  -3);
  crate(world, -20,  -8);
  crate(world, -35,  -2);

  // Interior stairs to L1 catwalk — TWO routes.
  // Stair route 1: NW corner (rises east, lands on catwalk at x=-5, y=4)
  buildStairs(world,
    new THREE.Vector3(-12, 0,  22),    // base position (south-west)
    new THREE.Vector3(-6,  0,  22),    // top position (east of base)
    4,                                  // total rise
    PALETTE.teal,
  );
  // Stair route 2: SW corner (mirror).
  buildStairs(world,
    new THREE.Vector3(-12, 0, -22),
    new THREE.Vector3(-6,  0, -22),
    4,
    PALETTE.teal,
  );
}

function shipContainer(world: World, cx: number, cz: number, sx: number, sy: number, sz: number, color: number, baseY = 0) {
  // sy = TOTAL height (we shift by half so feet sit at baseY).
  addBox(world, cx, baseY + sy / 2, cz, sx, sy, sz, color);
  // Door panels on each long side — visual only.
  const long = sx > sz;
  const side = long ? sz / 2 + 0.01 : sx / 2 + 0.01;
  const w = long ? sx * 0.6 : 0.6;
  const d = long ? 0.05 : sz * 0.6;
  addBox(world, cx, baseY + sy / 2, cz + (long ? side : 0), w, sy * 0.8, d, PALETTE.iron, false);
  if (long) {
    addBox(world, cx, baseY + sy / 2, cz - side, w, sy * 0.8, d, PALETTE.iron, false);
  } else {
    addBox(world, cx + side, baseY + sy / 2, cz, d, sy * 0.8, w, PALETTE.iron, false);
    addBox(world, cx - side, baseY + sy / 2, cz, d, sy * 0.8, w, PALETTE.iron, false);
  }
}

function crate(world: World, cx: number, cz: number) {
  addBox(world, cx, 0.7, cz, 1.4, 1.4, 1.4, PALETTE.loft);
}

// ── Center catwalks ─────────────────────────────────────────────────────────

function buildCenterCatwalks(world: World) {
  // Two catwalk decks crossing the map north-south at x = 10 and x = 20.
  // L1 at y=4 (run): main catwalk
  // L2 at y=8 (run): upper catwalk

  // L1 catwalk — runs from z=-35 to z=+35 at x=10 (wide enough for two players)
  catwalkDeck(world, 10, 4, 0, 2.5, 70);
  // L1 catwalk extension at x=20 (east branch into the yard)
  catwalkDeck(world, 20, 4, 0, 2.5, 70);
  // Cross-link between them at z=0
  catwalkDeck(world, 15, 4, 0, 10, 2.5);

  // L2 catwalk — runs only at x=15 (centered), shorter span (z=-25 to z=25)
  catwalkDeck(world, 15, 8, 0, 2.5, 50);

  // Stairs from L1 to L2 — single route at z=0, runs east
  buildStairs(world,
    new THREE.Vector3(13, 4, 0),
    new THREE.Vector3(17, 4, 0),
    4,
    PALETTE.tealDk,
  );

  // Vertical support pillars for the catwalks (iron) — visual + occasional cover.
  for (const z of [-30, -15, 0, 15, 30]) {
    addBox(world, 10, 2, z, 0.4, 4, 0.4, PALETTE.iron);
    addBox(world, 20, 2, z, 0.4, 4, 0.4, PALETTE.iron);
  }
  for (const z of [-20, 0, 20]) {
    addBox(world, 15, 6, z, 0.3, 4, 0.3, PALETTE.iron);
  }

  // Hazard stripes on the catwalk edges (visual cue from below).
  catwalkRail(world, 10, 4.55, 0, 0.05, 0.05, 70);
  catwalkRail(world, 20, 4.55, 0, 0.05, 0.05, 70);
  catwalkRail(world, 15, 8.55, 0, 0.05, 0.05, 50);
}

function catwalkDeck(world: World, cx: number, cy: number, cz: number, sx: number, sz: number) {
  // Decking — 0.4m thick. Top color = teal.
  addBox(world, cx, cy, cz, sx, 0.4, sz, PALETTE.teal);
  // Underside reinforcement (dark, visible from below).
  addBox(world, cx, cy - 0.25, cz, sx - 0.4, 0.1, sz - 0.4, PALETTE.iron, false);
  // Two hazard stripes along the deck edges.
  addBox(world, cx - sx / 2 + 0.15, cy + 0.21, cz, 0.05, 0.02, sz - 0.2, PALETTE.hazard, false);
  addBox(world, cx + sx / 2 - 0.15, cy + 0.21, cz, 0.05, 0.02, sz - 0.2, PALETTE.hazard, false);
}

function catwalkRail(world: World, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
  // Decorative only — collision-less so players can drop off the catwalks.
  addBox(world, cx, cy, cz, sx, sy, sz, PALETTE.hazard, false);
}

// ── East yard ───────────────────────────────────────────────────────────────

function buildEastYard(world: World) {
  // The east yard is the *one* long-sightline area on this map (sniper's lane).
  // Spans roughly x=22..48, z=-38..38. Walls open inward from north and south
  // to break long shots; the actual lane is z=-25..25.

  // Northern crate stack — partial cover at long range.
  shipContainer(world, 38,  30, 6, 2.5, 2.5, PALETTE.rust);
  // Southern crate stack — same.
  shipContainer(world, 38, -30, 6, 2.5, 2.5, PALETTE.rustDark);
  // Mid-yard crate cluster (forces sidestep aiming).
  crate(world, 32,  5);
  crate(world, 34,  5);
  crate(world, 32, -5);
  crate(world, 34, -5);

  // East-end ramp leading up to the L1 catwalk (eastern entry point so the
  // yard isn't a dead end vertically).
  buildStairs(world,
    new THREE.Vector3(46, 0, 18),
    new THREE.Vector3(46, 0, 12),
    4,
    PALETTE.tealDk,
  );

  // Tall iron column near the center — visual landmark + diagonal cover.
  addBox(world, 35, 5, 15, 1, 10, 1, PALETTE.iron);
  addBox(world, 35, 5, -15, 1, 10, 1, PALETTE.iron);
}

// ── Loft (south of warehouse, west of yard) ─────────────────────────────────

function buildLoft(world: World) {
  // A small wooden loft at y=3 between the warehouse and yard, accessible by
  // its own short stair. Gives a flanking position over the yard's long lane.
  const lx = 8, lz = -30;

  // Loft platform — 6 × 0.3 × 6.
  addBox(world, lx, 3.0, lz, 6, 0.4, 6, PALETTE.loft);
  // Loft railings (collision walls) on three sides — south, west, east open
  // toward the rest of the map for shooting.
  addBox(world, lx, 3.6, lz + 3, 6, 1.0, 0.2, PALETTE.iron);   // north rail
  // (south, west, east left open)

  // Support pillars under the loft.
  addBox(world, lx - 2.5, 1.5, lz - 2.5, 0.3, 3, 0.3, PALETTE.iron);
  addBox(world, lx + 2.5, 1.5, lz - 2.5, 0.3, 3, 0.3, PALETTE.iron);
  addBox(world, lx - 2.5, 1.5, lz + 2.5, 0.3, 3, 0.3, PALETTE.iron);
  addBox(world, lx + 2.5, 1.5, lz + 2.5, 0.3, 3, 0.3, PALETTE.iron);

  // Short stair from ground (z = -35) up to the loft (z = -33, y=3).
  buildStairs(world,
    new THREE.Vector3(lx, 0, -35),
    new THREE.Vector3(lx, 0, -33),
    3,
    PALETTE.loft,
  );
}

// ── Stair builder ───────────────────────────────────────────────────────────

/**
 * Build a flight of stairs between two points, rising by `totalRise` over the
 * horizontal run. Treads are 0.35m tall (< STEP_HEIGHT=0.55 so the
 * controller's auto-step covers them smoothly). The stair occupies the full
 * vertical column from `from.y` to the platform, so it also reads as solid
 * from below (no through-look between treads).
 *
 * `from.y` is the elevation the stair's first tread sits ON — for a ground
 * stair pass 0; for the L1→L2 catwalk stair pass 4 (the L1 deck height) so
 * the visual matches the y=4 collision offset in MapCollision.ts. Without
 * this, the stair would render at ground level under the catwalk while
 * collision pretends it's on top.
 *
 * `to.y` is ignored — `totalRise` controls the height; `from.y` controls
 * where the base sits.
 */
function buildStairs(world: World, from: THREE.Vector3, to: THREE.Vector3, totalRise: number, color: number) {
  const TREAD_RISE = 0.35;
  const steps = Math.ceil(totalRise / TREAD_RISE);
  const actualRise = TREAD_RISE * steps;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const runLen = Math.hypot(dx, dz);
  if (runLen < 0.01) return;
  const dirX = dx / runLen;
  const dirZ = dz / runLen;
  const treadDepth = runLen / steps;
  // Stair side width (perpendicular to direction of climb).
  const sideWidth = 2.2;
  const baseY = from.y;

  // Side rails — solid waist-high walls so player can't fall off. Lifted by
  // baseY so the rails sit alongside the treads regardless of platform height.
  const perpX = -dirZ;
  const perpZ = dirX;
  const railH = 1.0;
  const railY = baseY + actualRise / 2 + railH / 2;
  const railLen = runLen + 0.5;
  addBox(
    world,
    from.x + dx / 2 + perpX * sideWidth / 2, railY, from.z + dz / 2 + perpZ * sideWidth / 2,
    Math.abs(dirX) * railLen + Math.abs(perpX) * 0.2,
    railH,
    Math.abs(dirZ) * railLen + Math.abs(perpZ) * 0.2,
    PALETTE.iron, false,
  );
  addBox(
    world,
    from.x + dx / 2 - perpX * sideWidth / 2, railY, from.z + dz / 2 - perpZ * sideWidth / 2,
    Math.abs(dirX) * railLen + Math.abs(perpX) * 0.2,
    railH,
    Math.abs(dirZ) * railLen + Math.abs(perpZ) * 0.2,
    PALETTE.iron, false,
  );

  // Treads — each is a solid box from baseY up to its tread height. This
  // makes the stair read as a solid mass from the side, no see-through gaps.
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * TREAD_RISE;
    const cx = from.x + dirX * (treadDepth * (i + 0.5));
    const cz = from.z + dirZ * (treadDepth * (i + 0.5));
    const sx = Math.abs(dirX) * treadDepth + Math.abs(perpX) * sideWidth;
    const sz = Math.abs(dirZ) * treadDepth + Math.abs(perpZ) * sideWidth;
    addBox(world, cx, baseY + y / 2, cz, sx, y, sz, i % 2 === 0 ? color : PALETTE.tealDk);
  }
}

// ── Box helpers (same pattern as Sandstone) ─────────────────────────────────

function addBox(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: number,
  collide = true,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  if (collide) {
    world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
  } else {
    world.addDecoration(mesh);
  }
}

export const INDUSTRIAL_MAP: GameMap = {
  meta: {
    id: 'industrial',
    displayName: 'Industrial',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xa05028,
    // Spread across the yard + an armor pad up on the L1 catwalk (high ground).
    // Order/index MUST match the server's PICKUPS_BY_MAP.industrial.
    pickups: [
      { type: 'health', pos: [-20, 0,  20] },
      { type: 'health', pos: [ 20, 0,  20] },
      { type: 'health', pos: [  0, 0, -20] },
      { type: 'armor',  pos: [ 0, 0, 0] },
      { type: 'speed',  pos: [ 25, 0, 15] },
    ],
  },
  build: buildIndustrial,
};
