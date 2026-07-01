/**
 * Mansion — the dedicated Heist map (Owner vs Thief).
 *
 * A gothic, moon-lit two-storey manor standing in walled estate grounds. Unlike
 * the symmetric arena maps this one is deliberately *asymmetric* and role-driven:
 *
 *   - The OWNER spawns INSIDE, in the grand hall — home turf to defend.
 *   - The THIEF spawns OUTSIDE, at the estate gate — they must break in and
 *     descend to the cellar VAULT (the objective, placed by Heist mode).
 *
 * Design goals for this map (a real minigame environment, not a box house):
 *   • Rich EXTERIOR approach — walled grounds, gate + gatehouse, gravel driveway,
 *     a fountain, hedge lanes, trees, planters and low garden walls give the
 *     thief interesting, cover-lined routes toward the house.
 *   • SIX entrances so there's never one obvious funnel — front door, back door,
 *     two side doors, and two garden French-window openings on opposite corners.
 *   • A layered INTERIOR — a two-storey grand hall flanked by six ground-floor
 *     rooms (study, dining, library, kitchen, lounge, gallery) wired together by
 *     doorways so every room has at least two ways in/out (circulation, no dead
 *     ends), plus a balcony ring + two upstairs rooms reached by twin staircases
 *     that give the Owner high-ground defensive perches over the hall & front door.
 *   • A reachable CELLAR — the ground collision box is carved with a hole beneath
 *     the study so the stair-well genuinely descends into the vault room (the old
 *     map's cellar was sealed under the solid ground slab and unreachable).
 *   • Furniture-like cover in every room, warm interior point-lights against the
 *     cold exterior moonlight, and coloured team spawn pads for instant readability.
 *
 * Layout (top-down, +Z north, ~90 × 90 m grounds; the house ~40 × 30 m):
 *
 *   ┌──────────────── walled estate grounds ─────────────────┐
 *   │   library◄─┐   GRAND HALL (2-storey)   ┌─►gallery       │
 *   │   dining◄──┤   ▲back door▲              ├──►lounge       │  (garden French
 *   │   study ◄──┘   OWNER spawn              └──►kitchen      │   windows on the
 *   │   (cellar/vault below study)  ▲front door▲              │   NW & SE corners)
 *   │              ░░ driveway ░░  ⛲fountain  ░░ hedges ░░    │
 *   │                    ▓▓ GATE ▓▓  · THIEF spawn ·           │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Everything is built from the same low-poly box vocabulary as the arena maps so
 * it matches the art style and stays cheap. The vault objective + role spawns are
 * consumed by Heist mode (see modes/Heist.ts); FFA spawns are provided as a
 * fallback so the map is valid for non-Heist modes too.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PAL = {
  lawn:       0x1b2a17,   // dark moon-lit lawn
  lawnEdge:   0x16210f,   // darker lawn border
  gravel:     0x2c2824,   // gravel driveway / paths
  fence:      0x100d0a,   // wrought-iron perimeter wall
  fenceCap:   0x2a2018,   // fence coping / posts
  hedge:      0x1f3a1c,   // clipped hedge green
  bush:       0x24401f,   // rounded bush
  trunk:      0x2a1d12,   // tree trunk
  canopy:     0x16240f,   // tree canopy (deep green)
  stoneLt:    0x4a4038,   // manor outer stone (warm grey-brown, moon-lit face)
  stoneDk:    0x342c25,   // shadowed stone
  wood:       0x47372c,   // wood-panel inner walls
  woodDk:     0x35281f,   // dark wood
  floorWood:  0x3a2c20,   // interior wood floor
  floorHall:  0x2f2823,   // grand-hall stone floor
  rug:        0x5a2130,   // deep crimson hall rug
  roof:       0x1c1510,   // dark slate roof
  trim:       0x6a4a2c,   // wood trim / banisters / furniture
  trimLt:     0x876037,   // lighter trim highlight
  cellar:     0x15110e,   // cellar stone (darkest)
  marble:     0x6b6a63,   // statues / fountain stone
  candle:     0xffb24a,   // warm candle/fire glow (emissive)
  chandelier: 0xffcf7a,   // brighter hall glow
  windowWarm: 0xffb968,   // warm lit window glass (emissive)
  windowCold: 0x3f5b78,   // cold unlit window glass (emissive, dim)
  thiefPad:   0x34e0a0,   // teal thief spawn marker
  ownerPad:   0xffb24a,   // gold owner spawn marker
  water:      0x24506a,   // fountain water (emissive, dim)
};

const SPAWN_Y = 0.5;

// House footprint. Interior usable area x:[-20,20], z:[-15,15]; two storeys.
const HOUSE = { x0: -20, x1: 20, z0: -15, z1: 15, wallH: 4.2, floor2: 4.4, upperH: 3.0, T: 0.6 };
const G = 42;             // perimeter wall half-extent (grounds are ~84 m across)
const GROUND = 46;        // ground slab half-extent (past the wall so no void at edges)

// Cellar footprint (a hole is carved in the ground slab beneath it so the
// stair-well genuinely descends). Sits under the SW study.
const CELLAR = { x0: -19, x1: -9, z0: -14, z1: -6, floorY: -3.6 };
// Stair-well opening in the study floor (inside the cellar footprint).
const STAIR = { x0: -15, x1: -11, z0: -13, z1: -9 };

// ── Heist role spawns (also exposed on meta.teamSpawns for safety) ──
export const OWNER_SPAWN = new THREE.Vector3(0, SPAWN_Y, 2);     // grand hall, facing the door
export const THIEF_SPAWN = new THREE.Vector3(0, SPAWN_Y, -36);   // outside, just inside the gate

// Where the vault sits in the cellar — imported by Heist mode so the objective
// and the room stay in sync.
export const VAULT_POS = new THREE.Vector3(-17, CELLAR.floorY + 0.2, -8);

// FFA spawns (fallback for non-Heist modes): a spread of clear interior +
// exterior points.
const FFA_SPAWNS: THREE.Vector3[] = [
  OWNER_SPAWN.clone(),
  new THREE.Vector3(-13, SPAWN_Y,  10),   // library
  new THREE.Vector3( 13, SPAWN_Y,  10),   // gallery
  new THREE.Vector3(-16, SPAWN_Y,  -8),   // study (clear of the stair-well hole)
  new THREE.Vector3( 10, SPAWN_Y,  -7),   // kitchen (clear of the island/counter)
  new THREE.Vector3(  0, SPAWN_Y,  11),   // hall, north end
  THIEF_SPAWN.clone(),
  new THREE.Vector3(-24, SPAWN_Y, -20),   // garden, SW
  new THREE.Vector3( 24, SPAWN_Y, -20),   // garden, SE
];

export function buildMansion(world: World) {
  // Moon-lit gothic night — deep indigo sky, cold fog rolling over the grounds.
  world.scene.background = new THREE.Color(0x080a12);
  world.scene.fog = new THREE.Fog(0x090b14, 46, 170);

  buildLighting(world);
  buildGrounds(world);
  buildPerimeter(world);
  buildGarden(world);
  buildHouseShell(world);
  buildGroundFloor(world);
  buildCellar(world);
  buildUpperFloor(world);
  buildFurniture(world);
  buildSpawnPads(world);
}

/* ────────────────────────── lighting / atmosphere ────────────────────────── */

function buildLighting(world: World) {
  // Cold ambient moon fill so exteriors read without washing out the night.
  world.addDecoration(new THREE.HemisphereLight(0x5a6a8c, 0x070910, 0.5));
  const moon = new THREE.DirectionalLight(0x9ab0d8, 0.45);
  moon.position.set(-50, 80, -40);
  world.addDecoration(moon);

  // Warm chandelier high in the grand hall — the interior's heart.
  addLight(world, 0, 6.4, 0, PAL.chandelier, 1.15, 34);
  // Room hearth / candle glows (kept to a modest count for performance).
  addLight(world, -13, 2.6, 10, PAL.candle, 0.7, 16);   // library
  addLight(world,  13, 2.6, 10, PAL.candle, 0.7, 16);   // gallery
  addLight(world,  13, 2.6, 0,  PAL.candle, 0.75, 16);  // lounge fireplace
  addLight(world, -13, 2.6, -2, PAL.candle, 0.6, 14);   // dining
  // Exterior: two gate lamps + a front-porch lantern.
  addLight(world, -6.5, 3.2, -G + 2, PAL.candle, 0.7, 20);
  addLight(world,  6.5, 3.2, -G + 2, PAL.candle, 0.7, 20);
  addLight(world, 0, 3.4, HOUSE.z0 - 1.5, PAL.candle, 0.8, 18);
}

/* ──────────────────────────── grounds / ground slab ──────────────────────── */

/**
 * The estate ground slab. It is built as a FRAME of four boxes that tile the
 * whole 92×92 m plane *except* a rectangular hole beneath the cellar, so the
 * study stair-well can descend through it (the old single-box slab sealed the
 * cellar off). The study's own floor (built in buildCellar) covers everything
 * over the cellar apart from the stair opening.
 */
function buildGrounds(world: World) {
  const g = GROUND;
  const { x0: hx0, x1: hx1, z0: hz0, z1: hz1 } = CELLAR;
  // South band (z below the hole), full width.
  addBox(world, 0, -0.5, (-g + hz0) / 2, g * 2, 1, hz0 + g, PAL.lawn, true, false);
  // North band (z above the hole), full width.
  addBox(world, 0, -0.5, (hz1 + g) / 2, g * 2, 1, g - hz1, PAL.lawn, true, false);
  // West band, within the hole's z-span.
  addBox(world, (-g + hx0) / 2, -0.5, (hz0 + hz1) / 2, hx0 + g, 1, hz1 - hz0, PAL.lawn, true, false);
  // East band, within the hole's z-span.
  addBox(world, (hx1 + g) / 2, -0.5, (hz0 + hz1) / 2, g - hx1, 1, hz1 - hz0, PAL.lawn, true, false);

  // A darker lawn border ring (decoration) frames the estate.
  addBox(world, 0, 0.01, 0, g * 2, 0.02, g * 2, PAL.lawnEdge, false, false);

  // Gravel driveway from the gate up to the front door (decoration).
  addBox(world, 0, 0.03, -27, 6, 0.04, 20, PAL.gravel, false, false);
  addBox(world, 0, 0.03, -8, 8, 0.04, 16, PAL.gravel, false, false);   // forecourt apron
  // A gravel ring path circling the fountain.
  addBox(world, 0, 0.03, -24, 16, 0.04, 1.2, PAL.gravel, false, false);
}

/* ────────────────────────────── perimeter wall ──────────────────────────── */

function buildPerimeter(world: World) {
  const H = 3.4, T = 0.7;
  // North, East, West solid walls.
  addBox(world, 0, H / 2,  G, G * 2, H, T, PAL.fence);
  addBox(world, -G, H / 2, 0, T, H, G * 2, PAL.fence);
  addBox(world,  G, H / 2, 0, T, H, G * 2, PAL.fence);
  // South wall with a 7 m gate gap in the middle (the thief's entry).
  const seg = (G * 2 - 7) / 2;
  addBox(world, -(3.5 + seg / 2), H / 2, -G, seg, H, T, PAL.fence);
  addBox(world,  (3.5 + seg / 2), H / 2, -G, seg, H, T, PAL.fence);
  // Gate piers + a decorative arch lintel.
  addBox(world, -4, H / 2 + 0.5, -G, 1.2, H + 1, 1.2, PAL.fenceCap);
  addBox(world,  4, H / 2 + 0.5, -G, 1.2, H + 1, 1.2, PAL.fenceCap);
  addBox(world, 0, H + 0.9, -G, 9, 0.7, 0.8, PAL.fenceCap, false, false);
  // Coping strip along the top of the long walls (decoration).
  for (const [cx, cz, sx, sz] of [[0, G, G * 2, T], [-G, 0, T, G * 2], [G, 0, T, G * 2]] as const) {
    addBox(world, cx, H + 0.15, cz, sx, 0.3, sz, PAL.fenceCap, false, false);
  }
}

/* ─────────────────────────────── garden / cover ──────────────────────────── */

function buildGarden(world: World) {
  // Central fountain in the forecourt — a stone ring (cover) with lit water.
  fountain(world, 0, -24);

  // Hedge lanes flanking the driveway — staggered so they give cover without
  // fully walling the approach (the thief can weave between them).
  for (const z of [-30, -24, -18]) {
    hedge(world, -9, z, 5, 1.3);
    hedge(world,  9, z, 5, 1.3);
  }
  // Wider hedge screens further out (flank cover for the corner approaches).
  hedge(world, -20, -26, 1.4, 10);
  hedge(world,  20, -26, 1.4, 10);
  hedge(world, -26, 4, 1.4, 14);      // west side garden screen
  hedge(world,  26, 4, 1.4, 14);      // east side garden screen

  // Trees around the grounds (trunk = cover, canopy = decoration overhead).
  for (const [x, z] of [[-30, -12], [30, -12], [-32, 20], [32, 20], [-14, -30], [14, -30]] as const) {
    tree(world, x, z);
  }

  // Scattered bushes for low cover near the house faces.
  for (const [x, z] of [[-24, -8], [24, -8], [-10, -16], [10, -16], [-24, 12], [24, 12]] as const) {
    bush(world, x, z);
  }

  // Planters flanking the front door + statues by the side doors (landmarks/cover).
  planter(world, -3.5, HOUSE.z0 - 1.4);
  planter(world,  3.5, HOUSE.z0 - 1.4);
  statue(world, HOUSE.x0 - 1.6, 0);   // by west side door
  statue(world, HOUSE.x1 + 1.6, 0);   // by east side door

  // Low garden walls that create pockets of cover near the two garden windows.
  addBox(world, HOUSE.x0 - 3, 0.6, 11, 0.6, 1.2, 6, PAL.stoneDk);   // NW window approach
  addBox(world, HOUSE.x1 + 3, 0.6, -11, 0.6, 1.2, 6, PAL.stoneDk);  // SE window approach
}

function fountain(world: World, x: number, z: number) {
  // Outer stone ring (four low walls = walkable cover square approximating a ring).
  const r = 3, h = 0.8, t = 0.5;
  addBox(world, x, h / 2, z + r, r * 2, h, t, PAL.marble);
  addBox(world, x, h / 2, z - r, r * 2, h, t, PAL.marble);
  addBox(world, x + r, h / 2, z, t, h, r * 2, PAL.marble);
  addBox(world, x - r, h / 2, z, t, h, r * 2, PAL.marble);
  // Water + central plinth (decoration).
  addBox(world, x, 0.3, z, r * 2 - 0.6, 0.1, r * 2 - 0.6, PAL.water, false, true, 0.35);
  addBox(world, x, 1.0, z, 0.8, 2.0, 0.8, PAL.marble);
  // (No dedicated light — the emissive water reads fine and keeps the exterior
  // light count low for performance.)
}

function hedge(world: World, x: number, z: number, sx: number, sz: number) {
  addBox(world, x, 0.85, z, sx, 1.7, sz, PAL.hedge);
  addBox(world, x, 1.72, z, sx + 0.15, 0.12, sz + 0.15, PAL.bush, false, false);  // clipped top
}

function bush(world: World, x: number, z: number) {
  addBox(world, x, 0.55, z, 1.6, 1.1, 1.6, PAL.bush);
}

function tree(world: World, x: number, z: number) {
  addBox(world, x, 2.0, z, 0.9, 4.0, 0.9, PAL.trunk);              // trunk (cover)
  addBox(world, x, 5.2, z, 4.6, 3.0, 4.6, PAL.canopy, false, false);  // canopy
  addBox(world, x, 6.8, z, 3.0, 2.0, 3.0, PAL.canopy, false, false);
}

function planter(world: World, x: number, z: number) {
  addBox(world, x, 0.4, z, 1.4, 0.8, 1.4, PAL.stoneDk);
  addBox(world, x, 1.1, z, 1.0, 0.7, 1.0, PAL.bush, false, false);
}

function statue(world: World, x: number, z: number) {
  addBox(world, x, 0.5, z, 1.2, 1.0, 1.2, PAL.marble);   // plinth (cover)
  addBox(world, x, 1.8, z, 0.6, 1.6, 0.6, PAL.marble, false, false);  // figure
}

/* ─────────────────────────────── house shell ────────────────────────────── */

/** Outer mansion walls (with door + window gaps) and the roof. */
function buildHouseShell(world: World) {
  const { x0, x1, z0, z1, wallH, T } = HOUSE;
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  // Interior stone floor slab (raised a hair so it reads distinct from lawn).
  // NOTE: the study-over-cellar floor is built in buildCellar (with a stair hole),
  // so here we only floor the non-cellar interior via two side bands + hall.
  addBox(world, cx, 0.05, 8.5, w, 0.1, d - 7, PAL.floorHall, false, false);   // north 2/3
  addBox(world, 6.5, 0.05, -10, w - 13, 0.1, 10, PAL.floorHall, false, false); // SE/hall south
  addBox(world, -3.5, 0.05, -10, 7, 0.1, 10, PAL.floorHall, false, false);     // hall south strip

  // Outer walls, each with the relevant openings left as gaps.
  // North wall: back-door gap (x:[-2.5,2.5]).
  wallWithGap(world, 'x', z1, x0, x1, -2.5, 2.5, wallH, T, PAL.stoneLt);
  // South wall: front-door gap (x:[-2.5,2.5]).
  wallWithGap(world, 'x', z0, x0, x1, -2.5, 2.5, wallH, T, PAL.stoneLt);
  // West wall: side-door gap (z:[-2,2]) + NW garden-window gap (z:[9,13]).
  wallWithGaps(world, 'z', x0, z0, z1, [[-2, 2], [9, 13]], wallH, T, PAL.stoneLt);
  // East wall: side-door gap (z:[-2,2]) + SE garden-window gap (z:[-13,-9]).
  wallWithGaps(world, 'z', x1, z0, z1, [[-13, -9], [-2, 2]], wallH, T, PAL.stoneLt);

  // Door lintels over each ground-floor opening (decoration, reads as a frame).
  addBox(world, cx, wallH - 0.35, z0, 5.2, 0.7, T, PAL.stoneDk, false, false);
  addBox(world, cx, wallH - 0.35, z1, 5.2, 0.7, T, PAL.stoneDk, false, false);

  // Decorative lit windows along the faces (warm from inside; no collision).
  for (const z of [z0 + 5, z1 - 5]) {
    litWindow(world, x0 + 0.15, z, 'z');
    litWindow(world, x1 - 0.15, z, 'z');
  }
  litWindow(world, -8, z0 + 0.05, 'x');
  litWindow(world,  8, z0 + 0.05, 'x');

  // Two-storey stone corner pilasters (decoration) to break the long walls.
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
    addBox(world, px, (wallH + HOUSE.upperH) / 2, pz, 1.1, wallH + HOUSE.upperH + 1, 1.1, PAL.stoneDk, false, false);
  }

  // Roof over the whole house (solid — play stays inside + in the yard).
  const roofY = HOUSE.floor2 + HOUSE.upperH + 0.4;
  addBox(world, cx, roofY, cz, w + 1.2, 0.8, d + 1.2, PAL.roof);
  // A low decorative parapet + ridge for silhouette.
  addBox(world, cx, roofY + 0.6, cz, w + 1.2, 0.4, d + 1.2, PAL.stoneDk, false, false);
  addBox(world, cx, roofY + 1.1, cz, 3, 1.0, d, PAL.roof, false, false);
}

/* ──────────────────────────────── ground floor ──────────────────────────── */

/**
 * Ground-floor partition walls. Two vertical spines split the house into
 * West wing | Grand Hall | East wing; cross-walls split each wing into three
 * rooms. Every room gets a doorway into the hall AND a doorway to its neighbour,
 * so there are no dead ends and multiple routes to any point.
 */
function buildGroundFloor(world: World) {
  const h = HOUSE.wallH, T = 0.4;
  const { z0, z1 } = HOUSE;

  // West spine (x=-7) — three doorways into the hall (study / dining / library).
  wallWithGaps(world, 'z', -7, z0, z1, [[-11, -8], [-1.5, 1.5], [8, 11]], h, T, PAL.wood);
  // East spine (x=7) — mirrored (kitchen / lounge / gallery).
  wallWithGaps(world, 'z', 7, z0, z1, [[-11, -8], [-1.5, 1.5], [8, 11]], h, T, PAL.wood);

  // West-wing cross-walls (z=-5 study↔dining, z=5 dining↔library), each a doorway.
  wallWithGap(world, 'x', -5, -20, -7, -14, -11, h, T, PAL.wood);
  wallWithGap(world, 'x',  5, -20, -7, -14, -11, h, T, PAL.wood);
  // East-wing cross-walls (z=-5 kitchen↔lounge, z=5 lounge↔gallery).
  wallWithGap(world, 'x', -5, 7, 20, 11, 14, h, T, PAL.wood);
  wallWithGap(world, 'x',  5, 7, 20, 11, 14, h, T, PAL.wood);

  // The grand hall is open floor-to-roof (the centrepiece) — no ground walls.
  // Two square stone pillars give the hall cover + break long shots.
  for (const [px, pz] of [[-4, -6], [4, -6], [-4, 6], [4, 6]] as const) {
    addBox(world, px, h / 2, pz, 1.0, h, 1.0, PAL.stoneDk);
  }
}

/* ───────────────────────────────── cellar ───────────────────────────────── */

/**
 * The cellar vault room beneath the SW study. The ground slab already has a hole
 * carved under the CELLAR footprint (see buildGrounds), so here we:
 *   1. floor the study at y≈0 EVERYWHERE except the STAIR opening (this doubles as
 *      the cellar ceiling),
 *   2. build the enclosed cellar room below,
 *   3. drop a stair-well of thin treads from the opening to the cellar floor.
 * The glowing vault objective itself is spawned by Heist mode at VAULT_POS.
 */
function buildCellar(world: World) {
  // (1) Study floor = a frame of solid slabs around the stair opening.
  const sy = -0.05, th = 0.3;                          // top ≈ 0.1, flush enough
  const sx0 = -20, sx1 = -7, sz0 = -15, sz1 = -5;      // study bounds
  // South strip (z below the opening).
  addBox(world, (sx0 + sx1) / 2, sy, (sz0 + STAIR.z0) / 2, sx1 - sx0, th, STAIR.z0 - sz0, PAL.floorWood, true, false);
  // North strip (z above the opening).
  addBox(world, (sx0 + sx1) / 2, sy, (STAIR.z1 + sz1) / 2, sx1 - sx0, th, sz1 - STAIR.z1, PAL.floorWood, true, false);
  // West strip (x left of the opening, within the opening's z-span).
  addBox(world, (sx0 + STAIR.x0) / 2, sy, (STAIR.z0 + STAIR.z1) / 2, STAIR.x0 - sx0, th, STAIR.z1 - STAIR.z0, PAL.floorWood, true, false);
  // East strip (x right of the opening).
  addBox(world, (STAIR.x1 + sx1) / 2, sy, (STAIR.z0 + STAIR.z1) / 2, sx1 - STAIR.x1, th, STAIR.z1 - STAIR.z0, PAL.floorWood, true, false);

  // (2) Cellar room shell — floor + four walls, an enclosed stone vault.
  const { x0, x1, z0, z1, floorY } = CELLAR;
  const cw = x1 - x0, cd = z1 - z0, ch = 3.0;
  addBox(world, (x0 + x1) / 2, floorY, (z0 + z1) / 2, cw, 0.4, cd, PAL.cellar, true, false);
  addBox(world, x0, floorY + ch / 2, (z0 + z1) / 2, 0.4, ch, cd, PAL.cellar);   // west
  addBox(world, x1, floorY + ch / 2, (z0 + z1) / 2, 0.4, ch, cd, PAL.cellar);   // east
  addBox(world, (x0 + x1) / 2, floorY + ch / 2, z0, cw, ch, 0.4, PAL.cellar);   // south
  addBox(world, (x0 + x1) / 2, floorY + ch / 2, z1, cw, ch, 0.4, PAL.cellar);   // north
  // A couple of cellar crates/barrels for cover (clear of the vault corner + stairs).
  addBox(world, -11, floorY + 0.6, -8, 1.2, 1.2, 1.2, PAL.woodDk);
  addBox(world, -17, floorY + 0.6, -12, 1.2, 1.2, 1.2, PAL.woodDk);
  addBox(world, -11.5, floorY + 0.7, -12, 1.0, 1.4, 1.0, PAL.woodDk);

  // (3) Stair-well: thin treads descending +z through the opening to the floor.
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const z = STAIR.z0 + 0.2 + i * ((STAIR.z1 - STAIR.z0 - 0.4) / (steps - 1));
    const y = -0.15 - i * ((Math.abs(floorY) - 0.15) / (steps - 1));
    addBox(world, -13, y, z, STAIR.x1 - STAIR.x0 - 0.2, 0.35, 0.7, PAL.trim);
  }

  // Faint candle glow so the vault reads but the cellar stays moody.
  addLight(world, -15, floorY + 1.8, -9, PAL.candle, 0.6, 13);
}

/* ──────────────────────────────── upper floor ───────────────────────────── */

/**
 * A partial second floor: balcony walkways over the West & East wings (the grand
 * hall stays open to the roof), a railing ring facing the void, two twin
 * staircases up from the hall, and two enclosed upstairs rooms — high-ground
 * perches for the Owner overlooking the hall and front door.
 */
function buildUpperFloor(world: World) {
  const y = HOUSE.floor2, T = 0.4, uh = HOUSE.upperH;
  const { z0, z1 } = HOUSE;

  // Balcony floor slabs over each wing (grand hall x:[-7,7] left open).
  addBox(world, -13.5, y, 0, 13, 0.4, z1 - z0, PAL.floorWood);   // west upper floor
  addBox(world,  13.5, y, 0, 13, 0.4, z1 - z0, PAL.floorWood);   // east upper floor
  // Landing walkways across the north & south ends linking the two balconies
  // (so the Owner can circle the whole balcony ring).
  addBox(world, 0, y, z1 - 1.5, 14, 0.4, 3, PAL.floorWood);      // north landing
  addBox(world, 0, y, z0 + 1.5, 14, 0.4, 3, PAL.floorWood);      // south landing (over the door)

  // Low railings along the hall-facing edges (x=±7), with a gap at z≈11 where
  // each staircase lands so you can step off onto the balcony.
  railing(world, -7, z0 + 3, z1 - 3, y, [9.5, 12.5]);
  railing(world,  7, z0 + 3, z1 - 3, y, [9.5, 12.5]);
  // Rails guarding the north/south landing edges over the void (no gap needed).
  addBox(world, 0, y + 0.6, z1 - 3, 14, 1.1, 0.25, PAL.trim);
  addBox(world, 0, y + 0.6, z0 + 3, 14, 1.1, 0.25, PAL.trim);

  // Twin staircases from the hall floor up to the balconies (land at x=±7, z≈11).
  staircase(world, -1.5, -7, 11, y);   // west
  staircase(world,  1.5,  7, 11, y);   // east

  // Two upstairs perch-rooms (master bedroom NW, study/office NE): an L of tall
  // partitions that give the Owner enclosed high-ground cover while leaving the
  // balcony ring open to circulate (the south side of each stays open as the way in).
  // NW perch.
  addBox(world, -11, y + uh / 2, 11, T, uh, 8, PAL.wood);      // inner wall x=-11 (z:7..15)
  addBox(world, -15.5, y + uh / 2, 15, 9, uh, T, PAL.wood);    // back wall against N face
  // NE perch (mirrored).
  addBox(world, 11, y + uh / 2, 11, T, uh, 8, PAL.wood);
  addBox(world, 15.5, y + uh / 2, 15, 9, uh, T, PAL.wood);

  // Half-height parapet along the outer edge of the south balcony so the Owner
  // can crouch-peek the front door from above (a signature defensive perch).
  addBox(world, 0, y + 0.7, z0 + 0.3, 14, 1.4, 0.3, PAL.stoneDk);
}

/* ─────────────────────────────── furniture / cover ──────────────────────── */

function buildFurniture(world: World) {
  // Grand hall — crimson rug + a long central table (low cover) and candelabra.
  addBox(world, 0, 0.09, 2, 6.5, 0.04, 12, PAL.rug, false, false);
  addBox(world, 0, 0.5, 5, 2.6, 1.0, 3.2, PAL.trim);        // long hall table
  addBox(world, 0, 1.1, 5, 0.4, 0.4, 0.4, PAL.candle, false, true, 0.5);

  // Study (SW) — a desk beside the cellar stairs (owner landmark / cover).
  addBox(world, -18, 0.55, -7, 2.2, 1.1, 1.1, PAL.trim);
  addBox(world, -18, 1.3, -7, 1.0, 0.5, 0.6, PAL.woodDk, false, false);

  // Dining (W-mid) — long table + a hearth for warmth.
  addBox(world, -13, 0.5, 0, 2.0, 1.0, 5.0, PAL.trim);
  hearth(world, HOUSE.x0 + 0.7, -2);

  // Library (NW) — tall bookshelves (tall cover). Freestanding, set off the west
  // wall so the NW garden-window entrance stays clear.
  addBox(world, HOUSE.x0 + 2.4, 1.5, 8, 0.8, 3.0, 4.0, PAL.woodDk);
  addBox(world, -13, 1.4, 13.4, 6, 2.8, 0.8, PAL.woodDk);

  // Kitchen (SE) — a central island + a counter kept clear of the SE window.
  addBox(world, 13, 0.55, -10, 4.0, 1.1, 2.0, PAL.trim);
  addBox(world, HOUSE.x1 - 0.8, 0.6, -6, 0.9, 1.2, 3, PAL.woodDk);

  // Lounge (E-mid) — sofas around a hearth.
  addBox(world, 13, 0.4, 2.5, 3.2, 0.8, 1.2, PAL.trim);
  addBox(world, 13, 0.4, -2.5, 3.2, 0.8, 1.2, PAL.trim);
  hearth(world, HOUSE.x1 - 0.7, 0);

  // Gallery (NE) — display cases / statues (mixed cover).
  addBox(world, 13, 0.9, 13.2, 5, 1.8, 0.9, PAL.woodDk);
  statueSmall(world, 11, 10);
  statueSmall(world, 15, 10);

  // Upstairs master bed (NW) + office desk (NE).
  addBox(world, -14, HOUSE.floor2 + 0.6, 11, 3.2, 0.9, 2.2, PAL.trim);
  addBox(world,  14, HOUSE.floor2 + 0.7, 11, 2.2, 1.0, 1.1, PAL.trim);
}

function hearth(world: World, x: number, z: number) {
  addBox(world, x, 0.9, z, 0.5, 1.8, 2.4, PAL.stoneDk);            // mantel
  addBox(world, x, 0.5, z, 0.3, 0.9, 1.4, PAL.candle, false, true, 0.7);  // fire glow
}

function statueSmall(world: World, x: number, z: number) {
  addBox(world, x, 0.4, z, 0.9, 0.8, 0.9, PAL.marble);
  addBox(world, x, 1.3, z, 0.5, 1.2, 0.5, PAL.marble, false, false);
}

/* ─────────────────────────────── spawn zone pads ─────────────────────────── */

function buildSpawnPads(world: World) {
  // Thief pad — teal ring at the gate (decoration).
  spawnPad(world, THIEF_SPAWN.x, THIEF_SPAWN.z, PAL.thiefPad);
  // Owner pad — gold ring in the grand hall.
  spawnPad(world, OWNER_SPAWN.x, OWNER_SPAWN.z, PAL.ownerPad);
}

function spawnPad(world: World, x: number, z: number, color: number) {
  addBox(world, x, 0.08, z, 4.0, 0.06, 4.0, color, false, true, 0.5);
  // A thin brighter inner ring for readability.
  addBox(world, x, 0.1, z, 2.2, 0.05, 2.2, color, false, true, 0.75);
}

/* ───────────────────────────────── helpers ──────────────────────────────── */

/** A wall running along X (fixed z) or Z (fixed x) with a single centred gap. */
function wallWithGap(
  world: World,
  along: 'x' | 'z',
  fixed: number,
  a: number, b: number,
  gapA: number, gapB: number,
  h: number, T: number, color: number,
  baseY = 0,
) {
  wallWithGaps(world, along, fixed, a, b, [[gapA, gapB]], h, T, color, baseY);
}

/**
 * A wall along X (fixed z) or Z (fixed x) spanning [a,b], leaving the given gap
 * ranges open. `baseY` lifts the wall (used for upper-floor walls sitting on the
 * balcony slab). Solid segments are emitted between consecutive gaps.
 */
function wallWithGaps(
  world: World,
  along: 'x' | 'z',
  fixed: number,
  a: number, b: number,
  gaps: Array<[number, number]>,
  h: number, T: number, color: number,
  baseY = 0,
) {
  const sorted = [...gaps].sort((g1, g2) => g1[0] - g2[0]);
  let cursor = a;
  const cy = baseY + h / 2;
  const emit = (from: number, to: number) => {
    if (to - from <= 0.001) return;
    const mid = (from + to) / 2, len = to - from;
    if (along === 'x') addBox(world, mid, cy, fixed, len, h, T, color);
    else addBox(world, fixed, cy, mid, T, h, len, color);
  };
  for (const [gA, gB] of sorted) {
    emit(cursor, gA);
    cursor = gB;
  }
  emit(cursor, b);
}

/** Balcony railing along Z (fixed x) between za..zb at floor level `y`, with an
 *  optional [gapA,gapB] opening (e.g. where a staircase lands). */
function railing(world: World, fixed: number, za: number, zb: number, y: number, gap?: [number, number]) {
  const ry = y + 0.6, rt = 0.25, rh = 1.1;
  const seg = (a: number, b: number) => {
    if (b - a <= 0.01) return;
    addBox(world, fixed, ry, (a + b) / 2, rt, rh, b - a, PAL.trim);
  };
  if (!gap) { seg(za, zb); return; }
  seg(za, gap[0]);
  seg(gap[1], zb);
}

/**
 * A straight staircase of thin treads from (fromX) at hall level rising to
 * (toX) at height `y`, at fixed z. Treads are auto-climbable (rise < step limit).
 */
function staircase(world: World, fromX: number, toX: number, z: number, y: number) {
  const steps = 12;
  const dir = Math.sign(toX - fromX);
  const dx = Math.abs(toX - fromX) / steps;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + dir * dx * i;
    const ty = (y / steps) * i;
    addBox(world, x, ty - 0.175, z, dx + 0.15, 0.35, 2.2, PAL.trim);
  }
}

/** A warm lit window inset (decoration) on a wall facing X or Z. */
function litWindow(world: World, x: number, z: number, face: 'x' | 'z') {
  const warm = PAL.windowWarm;
  if (face === 'z') addBox(world, x, 2.1, z, 0.06, 1.7, 1.9, warm, false, true, 0.55);
  else addBox(world, x, 2.1, z, 1.9, 1.7, 0.06, warm, false, true, 0.55);
}

function addLight(world: World, x: number, y: number, z: number, color: number, intensity: number, dist: number) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z);
  world.addDecoration(l);
}

function addBox(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: number,
  collide = true,
  emissive = false,
  emissiveIntensity = 0.7,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive ? emissiveIntensity : 0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  if (collide) {
    world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
  } else {
    world.addDecoration(mesh);
  }
}

export const MANSION_MAP: GameMap = {
  meta: {
    id: 'mansion',
    displayName: 'Mansion',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: [OWNER_SPAWN.clone(), THIEF_SPAWN.clone()],
    spawnFlashColor: 0xa06bff,
  },
  build: buildMansion,
};
