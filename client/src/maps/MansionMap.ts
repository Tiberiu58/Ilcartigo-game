/**
 * Mansion — the Heist map (Owner vs Thief).
 *
 * A gothic two-storey manor sitting in a fenced grounds. Unlike the symmetric
 * arena maps, this one is deliberately *asymmetric* and role-driven:
 *   - The OWNER spawns INSIDE, in the central foyer — their home turf to defend.
 *   - The THIEF spawns OUTSIDE, at the front gate — they must break in.
 *
 * Layout (top-down, +Z north, ~70 × 70 m grounds; the house ~34 × 26 m):
 *
 *      ┌──────────────── fenced grounds ────────────────┐
 *      │            (THIEF spawns at S gate)             │
 *      │   ┌────────────── MANSION ──────────────┐       │
 *      │   │  studyN   gallery hall   bedroomN    │       │
 *      │   │ ───────┐  ┌────────────┐  ┌───────── │       │
 *      │   │  foyer  ││  GRAND HALL  ││  library   │       │
 *      │   │ (OWNER) ││  (2-storey)  ││            │       │
 *      │   │ ───────┘  └────────────┘  └───────── │       │
 *      │   │  studyS   kitchen hall   bedroomS    │       │
 *      │   └──────────┬─ front door ─┬───────────┘       │
 *      │              (THIEF gate)                       │
 *      └────────────────────────────────────────────────┘
 *
 * Construction: hand-placed walls leaving DOORWAY GAPS (the controller's 0.55 m
 * auto-step is irrelevant here — all gaps are full-height openings), small
 * rooms off long halls for stealth, a cellar reached by a stair well, and a
 * solid perimeter fence with one front gate. The vault objective is placed by
 * Heist mode, not here. Built from the same low-poly box vocabulary as the
 * other maps so it matches the art style.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PAL = {
  ground:    0x1c2418,    // dark mossy lawn
  path:      0x2a2622,    // gravel path
  fence:     0x14110e,    // wrought-iron-dark perimeter
  exterior:  0x3a322c,    // manor outer stone (warm grey-brown)
  exteriorD: 0x2c2620,    // shadowed stone
  interior:  0x47372c,    // wood-panel inner walls
  floorWood: 0x3a2c20,    // interior wood floor
  floorStone:0x322b26,    // foyer/hall stone floor
  roof:      0x241a14,    // dark slate roof
  trim:      0x6a4a2c,    // wood trim / banisters
  cellar:    0x191512,    // cellar stone (darkest)
  candle:    0xffb24a,    // warm candle glow (emissive)
  window:    0x4a6a8c,    // cold blue-grey window glass (emissive, dim)
};

const SPAWN_Y = 0.5;

// House footprint (interior usable area roughly x:[-16,16], z:[-12,12]).
const HOUSE = { x0: -17, x1: 17, z0: -13, z1: 13, wallH: 4, floor2: 4.2 };
const GROUNDS = 35;       // perimeter fence half-extent

// Heist role spawns (consumed by Heist mode, also exposed via meta for safety).
export const OWNER_SPAWN = new THREE.Vector3(0, SPAWN_Y, 0);        // central grand hall
export const THIEF_SPAWN = new THREE.Vector3(0, SPAWN_Y, -30);     // outside, at the S gate

// FFA spawns (so the map is also valid for non-Heist modes / fallback): a few
// safe interior + exterior points.
const FFA_SPAWNS: THREE.Vector3[] = [
  OWNER_SPAWN.clone(),
  new THREE.Vector3(-12, SPAWN_Y,  8),
  new THREE.Vector3( 12, SPAWN_Y,  8),
  new THREE.Vector3(-12, SPAWN_Y, -8),
  new THREE.Vector3( 12, SPAWN_Y, -8),
  THIEF_SPAWN.clone(),
];

export function buildMansion(world: World) {
  // Moonlit gothic night — deep indigo sky, cold fog over the grounds.
  world.scene.background = new THREE.Color(0x0a0c14);
  world.scene.fog = new THREE.Fog(0x0a0c14, 40, 150);

  // Lighting — dim cold moon key + a warm interior fill so rooms read.
  const hemi = new THREE.HemisphereLight(0x6a7a9c, 0x080a10, 0.55);
  world.addDecoration(hemi);
  const moon = new THREE.DirectionalLight(0x9ab0d8, 0.5);
  moon.position.set(-40, 70, -30);
  world.addDecoration(moon);
  // Warm hall glow from inside the grand hall.
  const hallGlow = new THREE.PointLight(0xffb24a, 0.9, 40, 2);
  hallGlow.position.set(0, 3, 0);
  world.addDecoration(hallGlow);

  buildGrounds(world);
  buildFence(world);
  buildHouseShell(world);
  buildInteriorWalls(world);
  buildUpperFloor(world);
  buildCellar(world);
  buildProps(world);
}

function buildGrounds(world: World) {
  addBox(world, 0, -0.5, 0, GROUNDS * 2 + 6, 1, GROUNDS * 2 + 6, PAL.ground);
  // Gravel approach path from the S gate to the front door.
  addBox(world, 0, -0.46, -20, 4, 0.04, 24, PAL.path, false);
}

function buildFence(world: World) {
  const H = 3, T = 0.6;
  // N, E, W solid fence. South fence has a gate gap (the thief's entry point).
  addBox(world, 0, H / 2,  GROUNDS, GROUNDS * 2, H, T, PAL.fence);   // north
  addBox(world, -GROUNDS, H / 2, 0, T, H, GROUNDS * 2, PAL.fence);   // west
  addBox(world,  GROUNDS, H / 2, 0, T, H, GROUNDS * 2, PAL.fence);   // east
  // South fence: two segments leaving a 6 m gate in the middle.
  addBox(world, -(GROUNDS / 2 + 1.5), H / 2, -GROUNDS, GROUNDS - 3, H, T, PAL.fence);
  addBox(world,  (GROUNDS / 2 + 1.5), H / 2, -GROUNDS, GROUNDS - 3, H, T, PAL.fence);
  // Gate posts.
  addBox(world, -3, H / 2 + 0.3, -GROUNDS, 0.8, H + 0.6, 0.8, PAL.exteriorD);
  addBox(world,  3, H / 2 + 0.3, -GROUNDS, 0.8, H + 0.6, 0.8, PAL.exteriorD);
}

/** Outer mansion walls + roof, with a front-door gap on the south face. */
function buildHouseShell(world: World) {
  const { x0, x1, z0, z1, wallH } = HOUSE;
  const w = x1 - x0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const T = 0.6;

  // Stone interior floor slab (raised a touch so it reads distinct from lawn).
  addBox(world, cx, 0.02, cz, w, 0.08, d, PAL.floorStone, false);

  // North / East / West outer walls (full).
  addBox(world, cx, wallH / 2, z1, w, wallH, T, PAL.exterior);       // north
  addBox(world, x0, wallH / 2, cz, T, wallH, d, PAL.exterior);       // west
  addBox(world, x1, wallH / 2, cz, T, wallH, d, PAL.exterior);       // east
  // South wall with a 4 m front-door gap in the centre.
  const seg = (w - 4) / 2;
  addBox(world, x0 + seg / 2, wallH / 2, z0, seg, wallH, T, PAL.exterior);
  addBox(world, x1 - seg / 2, wallH / 2, z0, seg, wallH, T, PAL.exterior);
  // Door frame lintel above the gap.
  addBox(world, cx, wallH - 0.4, z0, 4.2, 0.8, T, PAL.exteriorD);

  // Roof slab over the whole house (top of floor 2). Solid so you can't shoot in
  // from above; the play happens inside + in the yard.
  addBox(world, cx, HOUSE.floor2 * 2 + 0.3, cz, w + 1, 0.6, d + 1, PAL.roof);

  // Windows — dim cold glass insets along the walls (decoration only).
  for (const z of [z0 + 6, z1 - 6]) {
    addBox(world, x0 + 0.1, 2, z, 0.05, 1.6, 1.8, PAL.window, false, true);
    addBox(world, x1 - 0.1, 2, z, 0.05, 1.6, 1.8, PAL.window, false, true);
  }
}

/** Ground-floor partition walls forming a foyer (owner spawn area), a central
 *  grand hall, flanking rooms, and connecting halls — each with doorway gaps. */
function buildInteriorWalls(world: World) {
  const h = HOUSE.wallH;
  const T = 0.4;
  // A small helper: a wall along X with an optional centred door gap.
  const wallX = (z: number, xa: number, xb: number, door = 0) => {
    if (door <= 0) { addBox(world, (xa + xb) / 2, h / 2, z, xb - xa, h, T, PAL.interior); return; }
    const half = (xb - xa - door) / 2;
    addBox(world, xa + half / 2, h / 2, z, half, h, T, PAL.interior);
    addBox(world, xb - half / 2, h / 2, z, half, h, T, PAL.interior);
  };
  const wallZ = (x: number, za: number, zb: number, door = 0) => {
    if (door <= 0) { addBox(world, x, h / 2, (za + zb) / 2, T, h, zb - za, PAL.interior); return; }
    const half = (zb - za - door) / 2;
    addBox(world, x, h / 2, za + half / 2, T, h, half, PAL.interior);
    addBox(world, x, h / 2, zb - half / 2, T, h, half, PAL.interior);
  };

  // Two vertical spines split the house into West rooms | Grand Hall | East rooms.
  wallZ(-6, -12, 12, 2.5);   // west spine (door into grand hall)
  wallZ( 6, -12, 12, 2.5);   // east spine

  // West side: split into N study / foyer (owner) / S study.
  wallX( 5, -16, -6, 2);     // study-N ↔ foyer door
  wallX(-5, -16, -6, 2);     // foyer ↔ study-S door
  // East side: split into N bedroom / library / S bedroom.
  wallX( 5,  6, 16, 2);
  wallX(-5,  6, 16, 2);

  // Grand hall is open floor-to-floor-2 (the centerpiece). No extra walls.
}

/** A partial second floor: a balcony ring around the open grand hall, reached by
 *  a staircase, with two upstairs rooms. Tall cover / vertical play for Owner. */
function buildUpperFloor(world: World) {
  const y = HOUSE.floor2;       // second-floor level
  const T = 0.4;
  // Balcony walkways over the West and East room blocks (the grand hall stays
  // open to the roof). Each is a floor slab at y, leaving the central 12-wide
  // grand hall void.
  addBox(world, -11, y, 0, 12, 0.4, 24, PAL.floorWood);   // west upper floor
  addBox(world,  11, y, 0, 12, 0.4, 24, PAL.floorWood);   // east upper floor
  // Balcony railings facing the grand-hall void.
  addBox(world, -5.6, y + 0.6, 0, 0.3, 1.2, 24, PAL.trim);
  addBox(world,  5.6, y + 0.6, 0, 0.3, 1.2, 24, PAL.trim);

  // Staircase from the foyer up to the west balcony (stepped boxes the
  // controller auto-climbs).
  for (let i = 0; i < 8; i++) {
    const sy = 0.3 + i * (y / 8);
    addBox(world, -13 + i * 0.5, sy / 2, 10, 1.6, sy, 1.4, PAL.trim);
  }

  // Two upstairs walls to make a master room (NE) — gives the Owner a perch.
  addBox(world, 11, y + 1.4, 6, 12, 2.8, T, PAL.interior);
  addBox(world, 6.2, y + 1.4, 9, T, 2.8, 6, PAL.interior);
}

/** A small cellar below the house — reached by a stair well in the SW study.
 *  Dark, cramped: a classic stealth hiding spot for the thief / vault room. */
function buildCellar(world: World) {
  const cy = -3.2;            // cellar floor depth
  // Cellar floor + low ceiling box (an enclosed room under the SW corner).
  addBox(world, -11, cy, -9, 10, 0.4, 8, PAL.cellar, false);
  // Cellar walls.
  addBox(world, -16, cy + 1.4, -9, 0.4, 3, 8, PAL.cellar);
  addBox(world, -6,  cy + 1.4, -9, 0.4, 3, 8, PAL.cellar);
  addBox(world, -11, cy + 1.4, -13, 10, 3, 0.4, PAL.cellar);
  addBox(world, -11, cy + 1.4, -5, 10, 3, 0.4, PAL.cellar);
  // Stair well down from the SW study (stepped, auto-climbable both ways).
  for (let i = 0; i < 7; i++) {
    const depth = -i * (Math.abs(cy) / 7);
    addBox(world, -8.5 + i * 0.5, depth - 0.2, -6, 1.4, 0.4, 1.2, PAL.cellar);
  }
  // A faint candle glow so the cellar isn't pitch black.
  const c = new THREE.PointLight(PAL.candle, 0.5, 12, 2);
  c.position.set(-11, cy + 1.8, -9);
  world.addDecoration(c);
}

/** Decorative props + a bit of cover: furniture blocks, candle glows, hall rug. */
function buildProps(world: World) {
  // Grand hall rug (decoration) + a central table (low cover).
  addBox(world, 0, 0.06, 0, 6, 0.02, 9, 0x5a2a2a, false);
  addBox(world, 0, 0.5, 3, 2.4, 1, 1.2, PAL.trim);        // long table
  // Foyer welcome desk (owner spawn landmark).
  addBox(world, -11, 0.55, 2, 2.2, 1.1, 1, PAL.trim);
  // Library shelves (tall cover) along the E wall.
  addBox(world, 15.4, 1.4, 8, 0.8, 2.8, 5, PAL.exteriorD);
  addBox(world, 15.4, 1.4, -8, 0.8, 2.8, 5, PAL.exteriorD);
  // Bedroom beds (low cover).
  addBox(world, 11, 0.4, 9, 3, 0.8, 2, PAL.trim);
  addBox(world, 11, 0.4, -9, 3, 0.8, 2, PAL.trim);
  // A few candle glows for atmosphere (decoration).
  for (const [x, z] of [[-11, 2], [11, 8], [11, -8], [0, -4]] as const) {
    const c = new THREE.PointLight(PAL.candle, 0.5, 14, 2);
    c.position.set(x, 2.4, z);
    world.addDecoration(c);
  }
}

function addBox(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: number,
  collide = true,
  emissive = false,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive ? 0.7 : 0,
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
