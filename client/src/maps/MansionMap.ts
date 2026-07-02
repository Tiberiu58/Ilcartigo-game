/**
 * Mansion — the dedicated Heist map (Thief vs Owner).
 *
 * A large, atmospheric night-time manor built ONLY for the asymmetric Heist
 * mode. Unlike the symmetric arena maps, this one is deliberately role-driven
 * and readable as "a place you break into":
 *
 *   - The OWNER spawns INSIDE, in the grand hall — home turf, with balcony
 *     overwatch and defensive furniture cover.
 *   - The THIEF spawns OUTSIDE, at the south gate on the driveway — they must
 *     cross the garden and break in through one of FOUR ground entrances (front
 *     doors, east French doors, west servant door, north back door) or a couple
 *     of low window openings, then descend to the cellar VAULT.
 *
 * Layout (top-down, +Z north, +X east; grounds 84 × 84 m, house 40 × 30 m):
 *
 *   ┌──────────────── fenced grounds (night) ─────────────────┐
 *   │                     back garden / N yard                │
 *   │   ┌──── MANSION (2 storeys + cellar under NW) ─────┐     │
 *   │   │  Kitchen ┊   GRAND HALL (open)   ┊  Gallery    │     │
 *   │   │ (cellar) ┊    + grand stair↑     ┊             │     │
 *   │   │  Lounge  ┊─── arch ───┐          ┊  Study  ]E  │     │  ]E = French
 *   │   │ W[ door  ┊   FOYER    ┊  Dining  ┊  doors      │     │       doors
 *   │   │  Library ┊  (columns) ┊          ┊             │     │
 *   │   └──────────┴─ front doors ─┴───────────────┘     │     │
 *   │        portico │ driveway │ fountain · hedges       │     │
 *   │                └ THIEF spawns at S gate ┘           │     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Construction is the same low-poly box vocabulary as the other maps (so the
 * art style matches), but organised into modular builders. Interior walls leave
 * full-height DOORWAY GAPS; stairs use sub-step-height treads the controller
 * auto-climbs. The single collidable ground slab is built with a hole under the
 * kitchen so the cellar stair actually descends (a full slab would seal it).
 * The glowing vault objective is placed by Heist mode, not here.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

// ── Palette ────────────────────────────────────────────────────────────────
const PAL = {
  lawn:       0x18241a,   // dark mossy lawn
  lawnDark:   0x121c14,   // shadowed grass
  gravel:     0x2b2722,   // driveway gravel
  paving:     0x35302a,   // porch / terrace paving
  fence:      0x0f0d0b,   // wrought-iron perimeter
  stonePost:  0x2a251f,   // gate / fence posts
  exterior:   0x3c342d,   // manor outer stone (warm grey-brown)
  exteriorD:  0x2b2620,   // shadowed stone / lintels
  interior:   0x4a3a2d,   // wood-panel inner walls
  interiorD:  0x392c22,   // darker panelling
  floorWood:  0x3a2c20,   // interior wood floor / upper slabs
  floorStone: 0x322b26,   // foyer / hall stone floor
  rug:        0x5a2326,   // deep red hall rug
  roof:       0x201812,   // dark slate roof
  trim:       0x6a4a2c,   // wood trim / banisters / furniture
  trimD:      0x4c3520,   // darker furniture
  cellar:     0x161310,   // cellar stone (darkest)
  hedge:      0x1d3320,   // topiary green
  trunk:      0x241a12,   // tree trunk
  foliage:    0x1a2c1c,   // tree canopy
  marble:     0x8a8478,   // statues / fountain
  water:      0x2a4a5c,   // fountain water (emissive-cold)
  candle:     0xffb24a,   // warm candle / hearth glow
  windowWarm: 0xffcf87,   // lit window glass (emissive warm)
  gold:       0xd4af37,   // gilded accents
  ownerZone:  0x4a7bff,   // owner spawn pad (blue)
  thiefZone:  0x54e08a,   // thief spawn pad (green)
};

const SPAWN_Y = 0.5;

// House footprint + heights.
const HX0 = -20, HX1 = 20, HZ0 = -15, HZ1 = 15;   // outer wall centrelines
const WALL_H = 4;                                  // ground-floor height
const FLOOR2 = 4.4;                                // second-floor slab top
const UPPER_H = 3.2;                               // upstairs wall height
const T_EXT = 0.6, T_INT = 0.4;                    // wall thicknesses
const GROUNDS = 42;                                // perimeter fence half-extent
const CELLAR_Y = -4.0;                             // cellar floor top

// Stairwell hole cut into the ground slab under the kitchen (so the cellar
// stair can actually descend). Kept small so the kitchen stays a usable room.
const HOLE = { x0: -12, x1: -7, z0: 6, z1: 10 };

// ── Role spawns (consumed by Heist mode; exported for safety) ────────────────
export const OWNER_SPAWN = new THREE.Vector3(0, SPAWN_Y, 0.4);    // grand hall, before the stair
export const THIEF_SPAWN = new THREE.Vector3(0, SPAWN_Y, -38);    // south gate

// Where the cellar vault sits (Heist.ts reads this position for the objective).
export const VAULT_POS = new THREE.Vector3(-13, CELLAR_Y, 12);

// FFA spawns (so the map is valid outside Heist too): a spread of clear points.
const FFA_SPAWNS: THREE.Vector3[] = [
  OWNER_SPAWN.clone(),
  new THREE.Vector3(-13, SPAWN_Y, -10),   // library
  new THREE.Vector3(9.5, SPAWN_Y, -10),   // dining (west of the banquet table)
  new THREE.Vector3(-14.5, SPAWN_Y,  0),  // lounge (between sofa + coffee table)
  new THREE.Vector3( 10, SPAWN_Y,   2),   // study
  new THREE.Vector3(  0, SPAWN_Y,  12),   // grand hall, stair top landing floor
  THIEF_SPAWN.clone(),
  new THREE.Vector3(-30, SPAWN_Y, -22),   // SW garden
  new THREE.Vector3( 30, SPAWN_Y, -22),   // SE garden
  new THREE.Vector3(  0, SPAWN_Y,  26),   // back garden
];

// ── Entry point ──────────────────────────────────────────────────────────────
export function buildMansion(world: World) {
  buildAtmosphere(world);
  buildGroundPlane(world);
  buildGardens(world);
  buildFence(world);
  buildDriveway(world);
  buildHouseShell(world);
  buildGroundFloor(world);
  buildUpperFloor(world);
  buildCellar(world);
  buildFurniture(world);
  buildInteriorLights(world);
  buildSpawnZones(world);
}

// ── Sky, fog, key light ──────────────────────────────────────────────────────
function buildAtmosphere(world: World) {
  world.scene.background = new THREE.Color(0x090c16);
  world.scene.fog = new THREE.Fog(0x090c16, 48, 175);

  // Cold moonlight key + a dim sky/ground hemisphere so nothing is pure black.
  const hemi = new THREE.HemisphereLight(0x33507a, 0x0a0a10, 0.5);
  world.addDecoration(hemi);
  const moon = new THREE.DirectionalLight(0xa2bbe4, 0.6);
  moon.position.set(-55, 85, -40);
  world.addDecoration(moon);
  // A faint warm bounce leaking out of the lit house.
  const spill = new THREE.PointLight(0xffb867, 0.5, 60, 2);
  spill.position.set(0, 6, 2);
  world.addDecoration(spill);
}

// ── Ground: one collidable slab with a hole under the kitchen (cellar stair) ──
function buildGroundPlane(world: World) {
  const E = GROUNDS + 4;               // slab extends a little past the fence
  // Four strips tiling the whole plane while leaving HOLE open.
  slab(world, -E, HOLE.z1, E, E, PAL.lawn);        // north of the hole
  slab(world, -E, -E, E, HOLE.z0, PAL.lawn);       // south of the hole
  slab(world, -E, HOLE.z0, HOLE.x0, HOLE.z1, PAL.lawn);   // west of the hole
  slab(world, HOLE.x1, HOLE.z0, E, HOLE.z1, PAL.lawn);    // east of the hole

  // Decorative interior floor tints (non-collide, laid just above the slab).
  deco(world, 0, 0.03, 0, HX1 - HX0 - 1.2, 0.06, HZ1 - HZ0 - 1.2, PAL.floorStone);
  deco(world, -13, 0.05, -10, 12, 0.06, 9, PAL.floorWood);   // library wood
  deco(world, -13, 0.05,   0, 12, 0.06, 9, PAL.floorWood);   // lounge wood
  deco(world,  13, 0.05, -10, 12, 0.06, 9, PAL.floorWood);   // dining wood
  deco(world,  13, 0.05,   0, 12, 0.06, 9, PAL.floorWood);   // study wood
}

// ── Garden: hedges, trees, fountain, statues (exterior cover + atmosphere) ────
function buildGardens(world: World) {
  // Low hedge borders framing the driveway approach (waist-high cover the thief
  // can crouch behind while closing on the house).
  const hedgeH = 1.3;
  for (const side of [-1, 1]) {
    hedge(world, side * 9, -34, 0.9, 12, hedgeH);       // driveway edge
    hedge(world, side * 16, -22, 8, 0.9, hedgeH);       // cross hedge (approach cover)
    hedge(world, side * 26, -24, 0.9, 10, hedgeH);      // side hedge, clear of entrances
  }
  // A knot-garden ring of clipped hedges around the fountain.
  hedge(world, -6, -26, 0.9, 6, hedgeH);
  hedge(world,  6, -26, 0.9, 6, hedgeH);

  // Central fountain on the driveway island (round-ish basin from boxes + a
  // cold-glowing water disc; a landmark that splits the approach in two).
  fountain(world, 0, -26);

  // Trees scattered for cover + silhouette. Trunks collide, canopies don't.
  const treeSpots: [number, number][] = [
    [-33, -30], [33, -30], [-36, -6], [36, -6], [-30, 18], [30, 18],
    [-16, -34], [16, -34], [-38, 30], [38, 30], [0, 34],
  ];
  for (const [x, z] of treeSpots) tree(world, x, z);

  // Marble statues flanking the porch steps (chest-high cover at the door).
  statue(world, -6, -17);
  statue(world,  6, -17);

  // A couple of garden benches / planters as scattered cover.
  for (const [x, z] of [[-24, -30], [24, -30], [-26, 6], [26, 6]] as const) {
    solid(world, x, 0.5, z, 2.4, 1.0, 0.9, PAL.trimD);   // bench
  }
}

// ── Perimeter fence: solid wall, front (S) gate + a west service gate ─────────
function buildFence(world: World) {
  const H = 3.2, T = 0.5;
  // North + east walls (solid).
  solid(world, 0, H / 2, GROUNDS, GROUNDS * 2, H, T, PAL.fence);
  solid(world, GROUNDS, H / 2, 0, T, H, GROUNDS * 2, PAL.fence);
  // West wall with a small pedestrian service gate near the SW (alt approach).
  solid(world, -GROUNDS, H / 2, 18, T, H, GROUNDS * 2 - 40, PAL.fence);
  solid(world, -GROUNDS, H / 2, -14, T, H, GROUNDS * 2 - 44, PAL.fence);
  gatePost(world, -GROUNDS, -2); gatePost(world, -GROUNDS, 2);
  // South wall with the main 8 m gate in the centre (the thief's front door).
  solid(world, -(GROUNDS / 2 + 2), H / 2, -GROUNDS, GROUNDS - 4, H, T, PAL.fence);
  solid(world,  (GROUNDS / 2 + 2), H / 2, -GROUNDS, GROUNDS - 4, H, T, PAL.fence);
  // Main gate posts + warm lanterns atop them.
  for (const x of [-4, 4]) {
    gatePost(world, x, -GROUNDS);
    const lamp = new THREE.PointLight(PAL.candle, 0.7, 16, 2);
    lamp.position.set(x, 4, -GROUNDS + 0.5);
    world.addDecoration(lamp);
  }
}

// ── Driveway: gravel path + a columned portico over the front doors ───────────
function buildDriveway(world: World) {
  // Gravel from the S gate to the porch (non-collide surface tint).
  deco(world, 0, 0.04, -28, 8, 0.06, 28, PAL.gravel);
  deco(world, 0, 0.04, -16.5, 14, 0.06, 4, PAL.paving);   // porch paving

  // Porch steps up to the front doors (shallow, auto-climbed).
  for (let i = 0; i < 3; i++) {
    solid(world, 0, 0.12 + i * 0.12, -15.4 - (2 - i) * 0.7, 8 - i * 1.2, 0.24, 0.7, PAL.paving);
  }
  // Portico: four columns + a roof slab sheltering the entrance (cover for the
  // exposed front approach).
  for (const x of [-4.5, 4.5]) for (const z of [-16, -18.4]) column(world, x, z, 3.4);
  solid(world, 0, 3.7, -17.2, 11, 0.5, 5, PAL.roof);

  // Lamp posts lining the driveway with warm pools of light.
  for (const z of [-33, -22]) for (const x of [-6.5, 6.5]) lampPost(world, x, z);
}

// ── House shell: outer walls (4 entrances), windows, roof ─────────────────────
function buildHouseShell(world: World) {
  const cx = (HX0 + HX1) / 2, cz = (HZ0 + HZ1) / 2;
  const w = HX1 - HX0, d = HZ1 - HZ0;

  // South wall — front-door gap (x:[-3,3]) + two low window openings (1.5 m
  // tall) flanking it: a standing player (1.8 m) is blocked, but you can CROUCH
  // (1.2 m) through them — a stealth entry into the library / dining room.
  wallX(world, HZ0, HX0, HX1, WALL_H, PAL.exterior, T_EXT,
    [[-3, 3]], [[-13, -10, 1.5], [10, 13, 1.5]]);
  lintel(world, cx, HZ0, 4.4);
  // North wall — back-door gap (flank route into the grand hall from behind).
  wallX(world, HZ1, HX0, HX1, WALL_H, PAL.exterior, T_EXT, [[-3, 3]]);
  lintel(world, cx, HZ1, 4.4);
  // West wall — servant door (into the lounge) at z=0.
  wallZ(world, HX0, HZ0, HZ1, WALL_H, PAL.exterior, T_EXT, [[-1.6, 1.6]]);
  // East wall — French doors (into the dining room, garden side) at z=-10.
  wallZ(world, HX1, HZ0, HZ1, WALL_H, PAL.exterior, T_EXT, [[-11.6, -8.4]]);

  // Solid roof over the whole house (top of floor 2) so play stays inside/yard.
  solid(world, cx, FLOOR2 * 2 + 0.3, cz, w + 1.2, 0.6, d + 1.2, PAL.roof);

  // Warm lit-window insets along the exterior walls (emissive, non-collide) so
  // the manor reads as inhabited at night.
  for (const z of [-9, -3, 9]) {
    windowPane(world, HX0 + 0.05, z, 'x');
    windowPane(world, HX1 - 0.05, z, 'x');
  }
  for (const x of [-13, -6.5, 6.5, 13]) {
    windowPane(world, x, HZ1 - 0.05, 'z');
  }
  // Upstairs windows.
  for (const x of [-13, 13]) {
    windowPane(world, x, HZ0 + 0.05, 'z', FLOOR2 + 1.4);
    windowPane(world, x, HZ1 - 0.05, 'z', FLOOR2 + 1.4);
  }
}

// ── Ground floor: interior partitions forming the room grid ───────────────────
function buildGroundFloor(world: World) {
  const h = WALL_H;
  // Two N-S spine walls split the house into West wing | Centre | East wing.
  // West spine (x=-6): doors into library, lounge (from grand hall), kitchen.
  wallZ(world, -6, HZ0, HZ1, h, PAL.interior, T_INT, [[-11, -8.5], [-1, 1.5], [7, 9.5]]);
  // East spine (x=6): doors into dining, study, gallery.
  wallZ(world,  6, HZ0, HZ1, h, PAL.interior, T_INT, [[-11, -8.5], [-1, 1.5], [7, 9.5]]);

  // West wing cross walls (z=-5, z=5) → library / lounge / kitchen; N-S door.
  wallX(world, -5, HX0, -6, h, PAL.interior, T_INT, [[-14.2, -11.8]]);
  wallX(world,  5, HX0, -6, h, PAL.interior, T_INT, [[-14.2, -11.8]]);
  // East wing cross walls → dining / study / gallery; N-S door.
  wallX(world, -5, 6, HX1, h, PAL.interior, T_INT, [[11.8, 14.2]]);
  wallX(world,  5, 6, HX1, h, PAL.interior, T_INT, [[11.8, 14.2]]);

  // Centre: arch wall at z=-2 separating the FOYER (south) from the open GRAND
  // HALL (north). Wide central arch + a floor slab over the foyer (single-height
  // there; the grand hall stays open two storeys).
  wallX(world, -2, -6, 6, h, PAL.interiorD, T_INT, [[-3, 3]]);
  solid(world, 0, h - 0.4, -2, 6.4, 0.8, T_INT, PAL.exteriorD);   // arch lintel

  // Two columns inside the foyer flanking the front door (cover on both sides
  // of the main entrance kill-zone).
  column(world, -3.4, -12.5, WALL_H);
  column(world,  3.4, -12.5, WALL_H);
}

// ── Upper floor: balcony ring over the grand hall + a grand staircase + rooms ─
function buildUpperFloor(world: World) {
  const y = FLOOR2;
  // Second-floor slabs over the wings + foyer; the grand hall void stays open
  // (x:[-6,6], z:[-2,11]). Landing slab (z:[11,15]) bridges the two wings.
  slabY(world, HX0, HZ0, -6, HZ1, y, PAL.floorWood);   // west wing floor
  slabY(world, 6, HZ0, HX1, HZ1, y, PAL.floorWood);    // east wing floor
  slabY(world, -6, HZ0, 6, -2, y, PAL.floorWood);      // over the foyer
  slabY(world, -6, 9, 6, HZ1, y, PAL.floorWood);       // north landing (meets stair top)

  // Grand staircase rising through the grand hall (z 2→10) up to the landing.
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const topY = (i + 1) * (y / steps);   // tread top: 0.49 … 4.4 (rise 0.49 < step-up)
    const z = 2 + i * (8 / steps);
    solid(world, 0, topY / 2, z, 5, topY, 0.95, PAL.trimD);   // full block floor→top
  }
  // Balcony railings around the open grand-hall void (waist-high cover up top).
  railing(world, -5.7, y, 'z', -2, 9);
  railing(world,  5.7, y, 'z', -2, 9);
  railing(world, 0, y, 'x', -6, 6, -2.2);   // south edge of the void
  // North void edge: rails only either side of the stair mouth (x:[-2.5,2.5]).
  railing(world, 0, y, 'x', -6, -2.5, 9.2);
  railing(world, 0, y, 'x', 2.5, 6, 9.2);

  // Upstairs partitions: a master suite (NW) + a landing corridor. Doorway gaps.
  wallXAt(world, 5, HX0, -6, y, UPPER_H, PAL.interior, T_INT, [[-14.2, -11.8]]);
  wallZAt(world, -6, 5, HZ1, y, UPPER_H, PAL.interior, T_INT, [[8, 10.5]]);
  wallXAt(world, 5, 6, HX1, y, UPPER_H, PAL.interior, T_INT, [[11.8, 14.2]]);
  railing(world, 6, y, 'z', -2, 5);   // east balcony inner rail short return
}

// ── Cellar: vault room under the NW kitchen, reached by the stairwell hole ─────
function buildCellar(world: World) {
  const fy = CELLAR_Y;
  const x0 = -19, x1 = -7, z0 = 5, z1 = 14;
  // Cellar floor.
  slabAt(world, x0, z0, x1, z1, fy, PAL.cellar);
  // Walls from the cellar floor up to just under the ground slab (top at −0.8 so
  // they seal against the slab WITHOUT poking a lip above the kitchen floor).
  const wtop = -0.8, wh = wtop - fy, wcy = (fy + wtop) / 2;
  solid(world, x0, wcy, (z0 + z1) / 2, 0.4, wh, z1 - z0, PAL.cellar);   // W
  solid(world, x1, wcy, (z0 + z1) / 2, 0.4, wh, z1 - z0, PAL.cellar);   // E
  solid(world, (x0 + x1) / 2, wcy, z1, x1 - x0, wh, 0.4, PAL.cellar);   // N
  // South wall, leaving the stairwell mouth (under HOLE) open.
  solid(world, -15.5, wcy, z0, 7, wh, 0.4, PAL.cellar);

  // Stairwell: a descending staircase of solid blocks (floor→tread-top), like
  // the grand stair inverted. Each tread top drops 0.44 m (< the 0.55 m
  // step-down), and the blocks fill the HOLE width so you can't fall past them.
  const steps = 9;
  for (let i = 0; i < steps - 1; i++) {
    const yTop = -(i + 1) * (Math.abs(fy) / steps);   // -0.44 … -3.56
    const x = -7.3 - i * 0.55;                        // -7.3 … -11.15 (inside HOLE)
    solid(world, x, (yTop + fy) / 2, 8, 1.0, yTop - fy, 3.6, PAL.cellar);
  }

  // Cellar dressing: storage crates (cover near the vault) + wine racks.
  for (const [x, z] of [[-17, 7], [-9, 12], [-16, 12]] as const) {
    solid(world, x, fy + 0.6, z, 1.4, 1.2, 1.4, PAL.trimD);
  }
  solid(world, -18.3, fy + 1.2, 10, 0.6, 2.4, 5, PAL.interiorD);   // wine rack

  // A dim candle so the cellar isn't pitch black (the vault glow adds the rest).
  const c = new THREE.PointLight(PAL.candle, 0.6, 14, 2);
  c.position.set(-14, fy + 2.4, 9);
  world.addDecoration(c);
}

// ── Furniture: cover + landmarks per room ─────────────────────────────────────
function buildFurniture(world: World) {
  // Grand hall — central rug, a big table, a fireplace on the north wall, and
  // four corner columns (structural cover around the open centre).
  deco(world, 0, 0.06, 4, 7, 0.03, 10, PAL.rug);
  solid(world, 0, 0.5, 6, 3, 1.0, 1.4, PAL.trim);          // long hall table
  solid(world, 0, 1.1, 13.6, 4, 2.2, 0.8, PAL.exteriorD);  // fireplace surround
  const hearth = new THREE.PointLight(0xff7a2a, 1.1, 18, 2);
  hearth.position.set(0, 1.4, 13);
  world.addDecoration(hearth);
  for (const x of [-5, 5]) for (const z of [-1, 10]) column(world, x, z, WALL_H);

  // Foyer — reception desk (owner landmark) + coat stands.
  solid(world, 0, 0.55, -6, 3, 1.1, 1.0, PAL.trim);

  // Library (SW) — tall bookshelves lining the walls (hard cover + sightblock).
  // The south shelf stops short of the window opening (x:[-13,-10]) so the
  // crouch-through entry stays clear on the inside.
  solid(world, -19.2, 1.5, -10, 0.7, 3.0, 7, PAL.interiorD);
  solid(world, -16.5, 1.5, -14.4, 5, 3.0, 0.7, PAL.interiorD);
  solid(world, -9, 0.5, -8, 2.4, 1.0, 1.2, PAL.trimD);     // reading table

  // Lounge (W) — sofas around a coffee table (low cover).
  solid(world, -16, 0.45, 0, 1.0, 0.9, 3, PAL.trim);
  solid(world, -13, 0.45, 3.2, 3, 0.9, 1.0, PAL.trim);
  solid(world, -13, 0.35, 0, 1.8, 0.6, 1.0, PAL.trimD);

  // Kitchen (NW) — counters framing the stairwell (cover + rails the descent).
  solid(world, -18.5, 0.5, 9, 1.2, 1.0, 8, PAL.exteriorD);
  solid(world, -13, 0.5, 13.5, 8, 1.0, 1.2, PAL.exteriorD);
  solid(world, -9, 0.5, 12, 1.2, 1.0, 3, PAL.exteriorD);

  // Dining (SE) — a long banquet table + chairs (a central cover spine).
  solid(world, 13, 0.5, -10, 2.4, 1.0, 7, PAL.trim);
  for (const z of [-13, -7]) { solid(world, 10.5, 0.4, z, 0.8, 0.8, 0.8, PAL.trimD); solid(world, 15.5, 0.4, z, 0.8, 0.8, 0.8, PAL.trimD); }
  solid(world, 19.2, 1.3, -10, 0.7, 2.6, 5, PAL.interiorD);   // sideboard/cabinet

  // Study (E) — desk + shelves.
  solid(world, 13, 0.5, 0, 2.6, 1.0, 1.4, PAL.trim);
  solid(world, 19.2, 1.5, 0, 0.7, 3.0, 6, PAL.interiorD);

  // Gallery (NE) — display pedestals with statues (scattered pillar cover) +
  // framed paintings (emissive) on the walls.
  for (const [x, z] of [[10, 9], [16, 9], [13, 13]] as const) {
    solid(world, x, 0.6, z, 1.0, 1.2, 1.0, PAL.marble);
    deco(world, x, 1.9, z, 0.7, 1.4, 0.7, PAL.marble);
  }
  for (const z of [7, 12]) painting(world, 19.4, z, 'z');

  // Upstairs master suite (NW) — a bed + wardrobe (a perch over the grand hall).
  solid(world, -14, FLOOR2 + 0.5, 10, 4, 1.0, 3, PAL.trim);
  solid(world, -18.6, FLOOR2 + 1.3, 6, 0.7, 2.6, 3, PAL.interiorD);
}

// ── Interior point lights (chandeliers, sconces) ──────────────────────────────
function buildInteriorLights(world: World) {
  const chandelier = (x: number, y: number, z: number, intensity: number, range: number) => {
    const l = new THREE.PointLight(PAL.candle, intensity, range, 2);
    l.position.set(x, y, z);
    world.addDecoration(l);
    // A small glowing fixture so the source reads visually.
    deco(world, x, y, z, 0.8, 0.3, 0.8, PAL.windowWarm, PAL.windowWarm, 0.9);
  };
  chandelier(0, 3.4, 4, 1.2, 26);      // grand hall
  chandelier(0, 3.0, -8, 0.9, 18);     // foyer
  chandelier(-13, 2.8, -10, 0.7, 16);  // library
  chandelier(-13, 2.8, 0, 0.7, 16);    // lounge
  chandelier(13, 2.8, -10, 0.7, 16);   // dining
  chandelier(13, 2.8, 0, 0.7, 16);     // study
  chandelier(13, 2.8, 10, 0.7, 16);    // gallery
  chandelier(-14, FLOOR2 + 2.6, 10, 0.6, 15);  // master suite
}

// ── Team spawn zones (readable coloured pads) ─────────────────────────────────
function buildSpawnZones(world: World) {
  // Owner pad — a soft blue emissive ring on the grand-hall floor.
  zonePad(world, OWNER_SPAWN.x, OWNER_SPAWN.z, PAL.ownerZone);
  const oGlow = new THREE.PointLight(PAL.ownerZone, 0.5, 10, 2);
  oGlow.position.set(OWNER_SPAWN.x, 0.6, OWNER_SPAWN.z);
  world.addDecoration(oGlow);
  // Thief pad — a green emissive ring on the driveway at the gate.
  zonePad(world, THIEF_SPAWN.x, THIEF_SPAWN.z, PAL.thiefZone);
  const tGlow = new THREE.PointLight(PAL.thiefZone, 0.5, 10, 2);
  tGlow.position.set(THIEF_SPAWN.x, 0.6, THIEF_SPAWN.z);
  world.addDecoration(tGlow);
}

// ═══════════════════════════════════════════════════════════════════════════
// Primitive builders
// ═══════════════════════════════════════════════════════════════════════════

/** Solid collidable box centred at (cx,cy,cz). */
function solid(
  world: World, cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number, color: number,
) {
  const mesh = box(sx, sy, sz, color);
  mesh.position.set(cx, cy, cz);
  world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
}

/** Decoration box (no collision). Optional emissive. */
function deco(
  world: World, cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number, color: number,
  emis = 0x000000, emisInt = 0,
) {
  const mesh = box(sx, sy, sz, color, emis, emisInt);
  mesh.position.set(cx, cy, cz);
  world.addDecoration(mesh);
}

function box(sx: number, sy: number, sz: number, color: number, emis = 0x000000, emisInt = 0): THREE.Mesh {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color, emissive: emis, emissiveIntensity: emisInt, flatShading: true,
  });
  return new THREE.Mesh(geom, mat);
}

/** A ground-level collidable slab (top at y=0) spanning an XZ rectangle. */
function slab(world: World, x0: number, z0: number, x1: number, z1: number, color: number) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  solid(world, cx, -0.5, cz, x1 - x0, 1, z1 - z0, color);
}

/** A raised horizontal slab whose TOP is at y. */
function slabY(world: World, x0: number, z0: number, x1: number, z1: number, y: number, color: number) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  solid(world, cx, y - 0.2, cz, x1 - x0, 0.4, z1 - z0, color);
}

/** A slab whose top is at an arbitrary depth y (used for the cellar floor). */
function slabAt(world: World, x0: number, z0: number, x1: number, z1: number, y: number, color: number) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  solid(world, cx, y - 0.3, cz, x1 - x0, 0.6, z1 - z0, color);
}

/** Cut a run into [lo,hi] by removing `gaps` (each [g0,g1]); returns solid runs. */
function segments(lo: number, hi: number, gaps: [number, number][]): [number, number][] {
  const sorted = gaps.slice().sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = lo;
  for (const [g0, g1] of sorted) {
    const s = Math.max(lo, g0), e = Math.min(hi, g1);
    if (e <= cur) continue;
    if (s > cur) out.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < hi) out.push([cur, hi]);
  return out;
}

/**
 * A wall running along X at fixed z, base at y=0, with full-height door `gaps`
 * and optional low `windows` (each [w0,w1,openH] leaves an opening from the
 * floor up to height `openH`, with a header beam filling the wall above it — a
 * crouch-through shortcut / firing slit).
 */
function wallX(
  world: World, z: number, xa: number, xb: number, h: number, color: number,
  thick: number, gaps: [number, number][] = [], windows: [number, number, number][] = [],
) {
  const winGaps = windows.map((w) => [w[0], w[1]] as [number, number]);
  for (const [s, e] of segments(xa, xb, [...gaps, ...winGaps])) {
    solid(world, (s + e) / 2, h / 2, z, e - s, h, thick, color);
  }
  // Window openings: fill the wall above the opening with a header beam.
  for (const [w0, w1, openH] of windows) {
    const header = h - openH;
    solid(world, (w0 + w1) / 2, openH + header / 2, z, w1 - w0, header, thick, PAL.exteriorD);
    windowPane(world, (w0 + w1) / 2, z, 'x', openH + header / 2);
  }
}

/** A wall running along Z at fixed x, base at y=0, with full-height door gaps. */
function wallZ(
  world: World, x: number, za: number, zb: number, h: number, color: number,
  thick: number, gaps: [number, number][] = [],
) {
  for (const [s, e] of segments(za, zb, gaps)) {
    solid(world, x, h / 2, (s + e) / 2, thick, h, e - s, color);
  }
}

/** Upstairs variants: wall along X/Z whose base sits at height `base`. */
function wallXAt(
  world: World, z: number, xa: number, xb: number, base: number, h: number,
  color: number, thick: number, gaps: [number, number][] = [],
) {
  for (const [s, e] of segments(xa, xb, gaps)) {
    solid(world, (s + e) / 2, base + h / 2, z, e - s, h, thick, color);
  }
}
function wallZAt(
  world: World, x: number, za: number, zb: number, base: number, h: number,
  color: number, thick: number, gaps: [number, number][] = [],
) {
  for (const [s, e] of segments(za, zb, gaps)) {
    solid(world, x, base + h / 2, (s + e) / 2, thick, h, e - s, color);
  }
}

/** A door lintel beam bridging a gap in an exterior wall. */
function lintel(world: World, x: number, z: number, width: number) {
  solid(world, x, WALL_H - 0.4, z, width, 0.8, T_EXT, PAL.exteriorD);
}

/** A waist-high balcony/landing railing along X or Z between two coords. */
function railing(
  world: World, fixed: number, floorY: number, axis: 'x' | 'z',
  a: number, b: number, offset = 0,
) {
  const mid = (a + b) / 2, len = Math.abs(b - a);
  if (axis === 'z') solid(world, fixed, floorY + 0.6, mid, 0.2, 1.2, len, PAL.trim);
  else solid(world, mid, floorY + 0.6, fixed + offset, len, 1.2, 0.2, PAL.trim);
}

/** A stone/wood column (collidable cover). */
function column(world: World, x: number, z: number, h: number) {
  solid(world, x, h / 2, z, 0.8, h, 0.8, PAL.exteriorD);
  deco(world, x, 0.15, z, 1.1, 0.3, 1.1, PAL.marble);   // base
  deco(world, x, h - 0.15, z, 1.1, 0.3, 1.1, PAL.marble); // capital
}

/** A clipped hedge (low collidable cover). */
function hedge(world: World, cx: number, cz: number, sx: number, sz: number, h: number) {
  solid(world, cx, h / 2, cz, sx, h, sz, PAL.hedge);
}

/** A tree: collidable trunk + a non-colliding two-tier canopy. */
function tree(world: World, x: number, z: number) {
  solid(world, x, 1.6, z, 0.7, 3.2, 0.7, PAL.trunk);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 7), leaf());
  lower.position.set(x, 4.2, z);
  world.addDecoration(lower);
  const upper = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.6, 7), leaf());
  upper.position.set(x, 5.8, z);
  world.addDecoration(upper);
}
function leaf() {
  return new THREE.MeshLambertMaterial({ color: PAL.foliage, flatShading: true });
}

/** A gate/fence stone post. */
function gatePost(world: World, x: number, z: number) {
  solid(world, x, 2.1, z, 0.9, 4.2, 0.9, PAL.stonePost);
  deco(world, x, 4.3, z, 1.1, 0.3, 1.1, PAL.marble);
}

/** A driveway lamp post with a warm light. */
function lampPost(world: World, x: number, z: number) {
  solid(world, x, 1.6, z, 0.25, 3.2, 0.25, PAL.fence);
  deco(world, x, 3.4, z, 0.6, 0.6, 0.6, PAL.windowWarm, PAL.windowWarm, 0.9);
  const l = new THREE.PointLight(PAL.candle, 0.6, 14, 2);
  l.position.set(x, 3.4, z);
  world.addDecoration(l);
}

/** A marble statue on a plinth (chest-high cover). */
function statue(world: World, x: number, z: number) {
  solid(world, x, 0.6, z, 1.2, 1.2, 1.2, PAL.stonePost);
  deco(world, x, 1.9, z, 0.7, 1.6, 0.7, PAL.marble);
}

/** A round-ish garden fountain with a cold-glowing water disc. */
function fountain(world: World, x: number, z: number) {
  // Octagonal basin wall from short segments.
  const r = 3.2, seg = 8;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    solid(world, px, 0.5, pz, 1.6, 1.0, 0.6, PAL.marble);
  }
  deco(world, x, 0.35, z, r * 1.6, 0.1, r * 1.6, PAL.water, PAL.water, 0.5);
  solid(world, x, 1.2, z, 0.8, 2.4, 0.8, PAL.marble);   // central plinth
  const l = new THREE.PointLight(0x6fb4d6, 0.6, 12, 2);
  l.position.set(x, 1.6, z);
  world.addDecoration(l);
}

/** A lit window pane (emissive, non-collide). `at` = vertical centre. */
function windowPane(world: World, x: number, z: number, wall: 'x' | 'z', at = 2.0) {
  if (wall === 'x') deco(world, x, at, z, 0.06, 1.7, 1.6, PAL.windowWarm, PAL.windowWarm, 0.75);
  else deco(world, x, at, z, 1.6, 1.7, 0.06, PAL.windowWarm, PAL.windowWarm, 0.75);
}

/** A framed painting (emissive accent) hung on a wall. */
function painting(world: World, x: number, z: number, wall: 'x' | 'z') {
  if (wall === 'z') deco(world, x, 2.2, z, 0.1, 1.6, 1.2, PAL.gold, PAL.candle, 0.4);
  else deco(world, x, 2.2, z, 1.2, 1.6, 0.1, PAL.gold, PAL.candle, 0.4);
}

/** A flat emissive spawn-zone pad (a readable team marker on the floor). */
function zonePad(world: World, x: number, z: number, color: number) {
  deco(world, x, 0.06, z, 4, 0.04, 4, color, color, 0.55);
  deco(world, x, 0.08, z, 3, 0.04, 3, 0x0a0a0a, 0x000000, 0);
}

// ── Map registration ──────────────────────────────────────────────────────────
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
