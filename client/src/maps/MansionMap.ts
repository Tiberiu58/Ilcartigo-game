/**
 * Mansion — the Heist map (Owner vs Thief).
 *
 * A gothic, night-time manor standing in walled grounds. Unlike the symmetric
 * arena maps this one is deliberately *asymmetric* and role-driven, built to
 * support a stealth-and-pursuit minigame:
 *   - The OWNER spawns INSIDE, in the grand hall — home turf to defend.
 *   - The THIEF spawns OUTSIDE, at the front gate — they must break in and
 *     reach the glowing VAULT in the cellar (the objective is placed by
 *     Heist mode; see VAULT_POSITION below).
 *
 * Top-down (│ +Z = north, +X = east; grounds ≈ 92×92 m, house ≈ 40×32 m):
 *
 *    ┌───────────────── walled grounds (perimeter wall) ─────────────────┐
 *    │  gazebo   back garden / terrace          orchard                  │
 *    │        ┌── terrace door (N) ──┐                                   │
 *    │   ┌────┴──────── MANSION ──────┴────┐                             │
 *    │   │  KITCHEN  │   GALLERY   │ LIBRARY│◄ French doors (E)          │
 *    │   ├───────────┤  GRAND HALL ├────────┤                            │
 *    │ ▲ │  (well)   │ (2-storey + │        │  ▲ kitchen                 │
 *    │ │ │  LOUNGE   │  balcony)   │ DINING │  │ service door (W)        │
 *    │   │  ╲cellar  │   FOYER     │        │                            │
 *    │   └───────────┴── front door ┴───────┘                            │
 *    │        driveway · fountain · hedges · statues                     │
 *    │                    ┌── front gate (S) ──┐   ← THIEF spawns here   │
 *    └──────────────────────────────────────────────────────────────────┘
 *
 * The house is a loop of rooms (foyer → lounge → kitchen → gallery → library →
 * dining → foyer, plus the central hall), so there are no dead ends. FIVE ways
 * in — front door, kitchen service door (W), terrace door (N), library French
 * doors (E), and a sunken cellar bulkhead (a thief-only stealth route straight
 * down to the vault). A two-storey grand hall with a balcony ring gives the
 * Owner vertical defensive perches (including an exterior balcony over the
 * driveway).
 *
 * Everything is the same low-poly flat-shaded box vocabulary as the other maps,
 * kept lean (a few hundred solids, ≤ ~8 point lights) so it stays cheap. All
 * doorway gaps are full-height openings. Stairs use ≤0.4 m risers so the
 * controller's 0.55 m auto-step climbs them smoothly.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PAL = {
  ground:    0x161d13,    // dark mossy lawn
  lawnEdge:  0x1c2418,    // lighter lawn accent
  gravel:    0x2b2723,    // driveway gravel
  fence:     0x0f0d0b,    // wrought-iron-dark perimeter wall
  stone:     0x3a322c,    // manor outer stone (warm grey-brown)
  stoneD:    0x2c2620,    // shadowed stone / trim
  interior:  0x4a3a2e,    // wood-panel inner walls
  floorWood: 0x3a2c20,    // interior wood floor (upper storey)
  floorStone:0x322b26,    // ground-floor stone
  roof:      0x201712,    // dark slate roof
  trim:      0x6a4a2c,    // wood trim / banisters / furniture
  trimD:     0x4a3418,    // darker wood
  cellar:    0x14100d,    // cellar stone (darkest)
  cellarF:   0x1c1712,    // cellar floor
  candle:    0xffb24a,    // warm candle glow (emissive)
  window:    0xffc061,    // warm lit window glass (emissive)
  windowC:   0x4a6a8c,    // cold unlit window glass (emissive, dim)
  hedge:     0x1e3a1b,    // garden hedge green
  hedgeD:    0x152c13,
  trunk:     0x241a12,    // tree trunk
  leaf:      0x1f3620,    // tree canopy
  leafD:     0x18291a,
  water:     0x2b4d6e,    // fountain water (emissive, dim)
  marble:    0x6c6c74,    // statues / fountain rim
  gold:      0xd4af37,    // gilded accents
};

const SPAWN_Y = 0.5;

// House footprint. Interior usable area ≈ x:[-20,20], z:[-16,16].
const HOUSE = { x0: -20, x1: 20, z0: -16, z1: 16, wallH: 4.2, floor2: 4.4, T: 0.7 };
const GROUNDS = 46;          // perimeter wall half-extent
const CELLAR_Y = -3.2;       // cellar floor top
// Vault room footprint (cellar). Extends WEST past the house wall into a sunken
// exterior areaway (the bulkhead entrance well).
const VAULT_ROOM = { x0: -26, x1: -7, z0: -16, z1: -4 };

// Heist role spawns (consumed by Heist mode; also exposed via meta for safety).
export const OWNER_SPAWN = new THREE.Vector3(0, SPAWN_Y, -3);         // grand hall (by the archway)
export const THIEF_SPAWN = new THREE.Vector3(0, SPAWN_Y, -40);        // outside, at the S gate
// Where the vault sits (cellar, under the SW of the house). Heist mode reads
// this to place the glowing objective + proximity check.
export const VAULT_POSITION = new THREE.Vector3(-12, CELLAR_Y, -12);

// FFA spawns (so the map is valid for non-Heist modes / fallback): safe
// interior + exterior points, all verified clear of solids.
const FFA_SPAWNS: THREE.Vector3[] = [
  OWNER_SPAWN.clone(),                    // grand hall
  new THREE.Vector3(-13, SPAWN_Y,  10),   // kitchen
  new THREE.Vector3( 13, SPAWN_Y,  10),   // library
  new THREE.Vector3(-17, SPAWN_Y,  -6),   // lounge
  new THREE.Vector3( 16, SPAWN_Y,  -8),   // dining
  new THREE.Vector3(  0, SPAWN_Y,  13),   // gallery
  new THREE.Vector3(  0, SPAWN_Y, -12),   // foyer
  THIEF_SPAWN.clone(),                    // front gate
  new THREE.Vector3(-30, SPAWN_Y,  20),   // west garden
  new THREE.Vector3( 30, SPAWN_Y,  20),   // east garden
];

export function buildMansion(world: World) {
  // Moonlit gothic evening — deep indigo sky, cold haze over the grounds. The
  // ambient is lifted enough to keep the manor readable (no pure-black corners)
  // while the warm point lights still pool the interior.
  world.scene.background = new THREE.Color(0x0b0f1a);
  world.scene.fog = new THREE.Fog(0x0b0f1a, 55, 175);

  // Cold moon key + a generous hemisphere fill (fill is a single cheap light —
  // it does the readability heavy-lifting so the point-light budget stays low).
  const hemi = new THREE.HemisphereLight(0x8494bc, 0x2a2c38, 1.15);
  world.addDecoration(hemi);
  const moon = new THREE.DirectionalLight(0xbcd0f0, 0.85);
  moon.position.set(-50, 80, -35);
  world.addDecoration(moon);

  // Warm chandelier over the grand hall + a visible brass fixture, cozy fills in
  // the key rooms, a cellar lamp — the warm interior vs cool-moonlit exterior
  // contrast. (Intensities are high because three's decay-2 falloff is steep.)
  warmLight(world, 0, 5.8, 2, 4.5, 60);      // grand-hall chandelier
  addBox(world, 0, 6.1, 2, 1.6, 0.5, 1.6, PAL.gold, false, true, 0.7);   // fixture
  addBox(world, 0, 5.6, 2, 0.25, 1.0, 0.25, PAL.trimD, false);           // chain
  warmLight(world, -13, 3.2, 9, 2.6, 30);    // kitchen
  warmLight(world, 13, 3.2, 9, 2.6, 30);     // library
  warmLight(world, 0, 3.2, -11, 2.4, 28);    // foyer
  warmLight(world, 0, 3.2, 13, 2.2, 26);     // gallery
  warmLight(world, -12, -1.4, -12, 2.4, 18); // cellar / vault

  buildGrounds(world);
  buildPerimeter(world);
  buildGardens(world);
  buildHouseShell(world);
  buildGroundFloorRooms(world);
  buildCellar(world);
  buildStairs(world);
  buildUpperFloor(world);
  buildFurniture(world);
}

// ─── Grounds & lawn ─────────────────────────────────────────────────────────
// The lawn is a solid slab (players stand on it). It is built as a FRAME around
// the vault-room footprint so that footprint is left open for the sunken cellar
// below — a single big slab could not be "carved", and there is no implicit
// ground plane in the controller.
function buildGrounds(world: World) {
  const { x0, x1, z0, z1 } = VAULT_ROOM;
  // South band (everything south of the vault room).
  addBox(world, 0, -0.5, (-GROUNDS + z0) / 2, GROUNDS * 2, 1, z0 + GROUNDS, PAL.ground);
  // North band (everything north of the vault room).
  addBox(world, 0, -0.5, (z1 + GROUNDS) / 2, GROUNDS * 2, 1, GROUNDS - z1, PAL.ground);
  // West of the vault room (across its z-band).
  addBox(world, (-GROUNDS + x0) / 2, -0.5, (z0 + z1) / 2, x0 + GROUNDS, 1, z1 - z0, PAL.ground);
  // East of the vault room (across its z-band).
  addBox(world, (x1 + GROUNDS) / 2, -0.5, (z0 + z1) / 2, GROUNDS - x1, 1, z1 - z0, PAL.ground);

  // Gravel driveway from the front gate up to the porch, + a circular forecourt.
  addBox(world, 0, 0.01, -31, 8, 0.06, 30, PAL.gravel, false);
  addBox(world, 0, 0.01, -22, 22, 0.06, 8, PAL.gravel, false);
  // Stone porch apron just outside the front door.
  addBox(world, 0, 0.03, -17.5, 10, 0.1, 5, PAL.floorStone, false);
}

// ─── Perimeter wall + gate ──────────────────────────────────────────────────
function buildPerimeter(world: World) {
  const H = 4.5, T = 0.8, G = GROUNDS;
  addBox(world, 0, H / 2, G, G * 2, H, T, PAL.fence);      // north
  addBox(world, -G, H / 2, 0, T, H, G * 2, PAL.fence);     // west
  addBox(world, G, H / 2, 0, T, H, G * 2, PAL.fence);      // east
  // South wall with an 8 m front gate gap in the middle.
  const seg = (G * 2 - 8) / 2;
  addBox(world, -(4 + seg / 2), H / 2, -G, seg, H, T, PAL.fence);
  addBox(world, (4 + seg / 2), H / 2, -G, seg, H, T, PAL.fence);
  // Ornate gate posts + a lamp glow on each.
  for (const sx of [-1, 1]) {
    addBox(world, sx * 5, H / 2 + 0.4, -G, 1.2, H + 0.8, 1.2, PAL.stoneD);
    addBox(world, sx * 5, H + 1.0, -G, 1.5, 0.5, 1.5, PAL.gold, false, true, 0.3);
    warmLight(world, sx * 5, H + 1.2, -G + 1, 0.4, 16);
  }
}

// ─── Gardens: hedges, trees, statues, a fountain (exterior cover) ────────────
function buildGardens(world: World) {
  // Central forecourt fountain (cover + a landmark on the thief's approach).
  fountain(world, 0, -31);

  // Hedge rows lining the driveway — waist-high cover the thief can vault peeks
  // over while approaching.
  for (const z of [-38, -33, -28, -23]) {
    hedge(world, -11, z, 3.5, 1.4);
    hedge(world, 11, z, 3.5, 1.4);
  }
  // Forecourt corner hedges + a couple of low garden walls flanking the porch.
  hedge(world, -8, -19, 6, 1.2);
  hedge(world, 8, -19, 6, 1.2);
  addBox(world, -12, 0.6, -18, 0.6, 1.2, 6, PAL.stoneD);   // low garden wall W
  addBox(world, 12, 0.6, -18, 0.6, 1.2, 6, PAL.stoneD);    // low garden wall E

  // Statues flanking the porch steps.
  statue(world, -6, -20);
  statue(world, 6, -20);

  // Lamp posts lining the driveway — glowing lanterns light the thief's
  // approach (emissive-only, no extra real lights, to keep the budget lean).
  for (const z of [-38, -30, -22]) {
    lampPost(world, -6, z);
    lampPost(world, 6, z);
  }

  // Trees scattered around the grounds (trunks are cover; canopies are visual).
  for (const [x, z] of [
    [-36, -34], [36, -34], [-40, -10], [40, -10],
    [-34, 30], [34, 30], [-14, 34], [14, 34], [0, 40],
  ] as const) {
    tree(world, x, z);
  }

  // Side garden crates stacked by the kitchen window — a subtle "climb in here"
  // hint / cover near the west service approach.
  addBox(world, -24, 0.6, 9, 1.6, 1.2, 1.6, PAL.trimD);
  addBox(world, -24, 1.7, 9, 1.2, 1.0, 1.2, PAL.trimD);
  addBox(world, -22.5, 0.5, 10.5, 1.4, 1.0, 1.4, PAL.trimD);

  // Back-garden gazebo + terrace hedges behind the house (northern approach).
  gazebo(world, 0, 40);
  hedge(world, -10, 24, 8, 1.3);
  hedge(world, 10, 24, 8, 1.3);
}

// ─── Mansion outer shell (exterior walls, doors, windows, roof) ──────────────
function buildHouseShell(world: World) {
  const { x0, x1, z0, z1, wallH, T, floor2 } = HOUSE;
  const w = x1 - x0, d = z1 - z0, cx = 0, cz = 0;

  // Ground-floor stone slab across the house — EXCEPT over the vault room,
  // which gets a thin ceiling slab (the lounge floor) with a stairwell hole.
  // (South/east of the vault room the lawn slab already provides the floor.)
  buildLoungeFloor(world);

  // Exterior walls with FULL-HEIGHT door gaps.
  // South wall — 4 m front door gap (centered).
  wallRunX(world, z0, x0, x1, wallH, T, PAL.stone, [[-2, 2]]);
  addBox(world, cx, wallH - 0.35, z0, 4.4, 0.7, T, PAL.stoneD);   // door lintel
  // North wall — 4 m terrace door gap.
  wallRunX(world, z1, x0, x1, wallH, T, PAL.stone, [[-2, 2]]);
  addBox(world, cx, wallH - 0.35, z1, 4.4, 0.7, T, PAL.stoneD);
  // West wall — 3 m kitchen service door gap (north side).
  wallRunZ(world, x0, z0, z1, wallH, T, PAL.stone, [[6.5, 9.5]]);
  // East wall — 3 m library French-door gap (north side).
  wallRunZ(world, x1, z0, z1, wallH, T, PAL.stone, [[6.5, 9.5]]);

  // Lit / unlit window panes (cheap emissive decoration) along the walls.
  for (const z of [-11, -6, 12]) {
    litWindow(world, x0 + 0.05, 2, z, 'z');
    litWindow(world, x1 - 0.05, 2, z, 'z');
  }
  for (const x of [-13, -6, 6, 13]) {
    coldWindow(world, x, 2, z0 + 0.05, 'x');
  }
  for (const x of [-13, 13]) {
    litWindow(world, x, 2, z1 - 0.05, 'x');
  }
  // Upper-storey windows.
  for (const z of [-10, 0, 10]) {
    coldWindow(world, x0 + 0.05, floor2 + 1.6, z, 'z');
    coldWindow(world, x1 - 0.05, floor2 + 1.6, z, 'z');
  }

  // Slate roof over the whole house (caps the two-storey atrium; solid so no
  // shooting in from above). A ridge line for a bit of silhouette.
  addBox(world, cx, 7.9, cz, w + 1.4, 0.6, d + 1.4, PAL.roof);
  addBox(world, cx, 8.5, cz, w + 0.4, 0.7, 6, PAL.roof, false);
  // Decorative corner chimneys.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addBox(world, sx * (x1 - 3), 8.6, sz * (z1 - 4), 1.4, 1.8, 1.4, PAL.stoneD, false);
  }
}

/** Thin ground slab over the vault room (the lounge floor), with a stairwell
 *  hole so the interior cellar stair can descend through it. Built as boxes
 *  around the hole. */
function buildLoungeFloor(world: World) {
  const { x0, x1, z0, z1 } = VAULT_ROOM;
  // Only the UNDER-HOUSE portion needs a floor (x:[-20,-7]); the western part
  // ([-26,-20]) is the open sunken areaway.
  const fx0 = HOUSE.x0;               // -20
  // Stairwell hole: x:[-12,-7], z:[-8,-4] (NE corner of the lounge).
  // South strip (z:[z0,-8]) full width.
  addBox(world, (fx0 + x1) / 2, -0.1, (z0 + -8) / 2, x1 - fx0, 0.2, -8 - z0, PAL.floorStone);
  // North-west strip (z:[-8,-4], x:[fx0,-12]) — leaves the hole open to its east.
  addBox(world, (fx0 + -12) / 2, -0.1, (-8 + z1) / 2, -12 - fx0, 0.2, z1 - -8, PAL.floorStone);
  void x0;
}

// ─── Ground-floor interior partitions (rooms + corridors) ────────────────────
function buildGroundFloorRooms(world: World) {
  const h = HOUSE.wallH, T = 0.4;
  // Two vertical spines split the house: West rooms | central hall | East rooms.
  // Doors: lounge↔foyer & kitchen↔hall (west spine); dining↔foyer & library↔hall.
  wallRunZ(world, -7, HOUSE.z0, HOUSE.z1, h, T, PAL.interior, [[-13, -9], [4.5, 7.5]]);
  wallRunZ(world, 7, HOUSE.z0, HOUSE.z1, h, T, PAL.interior, [[-13, -9], [4.5, 7.5]]);

  // Central cross-walls: foyer ↔ grand hall (S) and grand hall ↔ gallery (N),
  // each a 4 m grand archway.
  wallRunX(world, -6, -7, 7, h, T, PAL.interior, [[-2, 2]]);
  wallRunX(world, 10, -7, 7, h, T, PAL.interior, [[-2, 2]]);

  // West block split: lounge (S) ↔ kitchen (N), 2.5 m door.
  wallRunX(world, -4, HOUSE.x0, -7, h, T, PAL.interior, [[-15.5, -13]]);
  // East block split: dining (S) ↔ library (N), 2.5 m door.
  wallRunX(world, -4, 7, HOUSE.x1, h, T, PAL.interior, [[13, 15.5]]);
}

// ─── Cellar / vault room ─────────────────────────────────────────────────────
function buildCellar(world: World) {
  const { x0, x1, z0, z1 } = VAULT_ROOM;
  const wy = (CELLAR_Y + -0.2) / 2, wh = -0.2 - CELLAR_Y;   // wall span [CELLAR_Y,-0.2]
  // Floor.
  addBox(world, (x0 + x1) / 2, CELLAR_Y - 0.2, (z0 + z1) / 2, x1 - x0, 0.4, z1 - z0, PAL.cellarF);
  // Perimeter walls. The NORTH wall only closes the under-house chamber
  // (x:[-20,-7]) — the western part (x:[-26,-20]) is left open to the garden so
  // the exterior bulkhead stair can descend into the sunken areaway.
  addBox(world, (x0 + x1) / 2, wy, z0, x1 - x0, wh, 0.4, PAL.cellar);   // south (full)
  addBox(world, (HOUSE.x0 + x1) / 2, wy, z1, x1 - HOUSE.x0, wh, 0.4, PAL.cellar); // north (under-house only)
  addBox(world, x0, wy, (z0 + z1) / 2, 0.4, wh, z1 - z0, PAL.cellar);   // west
  addBox(world, x1, wy, (z0 + z1) / 2, 0.4, wh, z1 - z0, PAL.cellar);   // east

  // Wine-rack + crate cover around the vault chamber.
  addBox(world, -22, CELLAR_Y + 1.0, -6, 0.6, 2.0, 4, PAL.trimD);
  addBox(world, -22, CELLAR_Y + 1.0, -14, 0.6, 2.0, 4, PAL.trimD);
  addBox(world, -9, CELLAR_Y + 0.7, -8, 1.4, 1.4, 1.4, PAL.trimD);
  addBox(world, -16, CELLAR_Y + 0.5, -6, 1.6, 1.0, 1.6, PAL.trimD);

  // Low railing around the exposed edges of the exterior areaway (the sunken
  // well, x:[-26,-20]) so players don't stumble in from the west garden — the
  // bulkhead stair (built in buildStairs) is the intended way down.
  addBox(world, x0, 0.5, (z0 + z1) / 2, 0.5, 1.0, z1 - z0, PAL.stoneD);        // west rail
  addBox(world, -23, 0.5, z0, 6, 1.0, 0.5, PAL.stoneD);                        // south rail
}

// ─── Stairs (cellar descents + grand hall ascents) ───────────────────────────
function buildStairs(world: World) {
  // (A) Interior cellar stair — descends through the lounge-floor hole
  // (x:[-12,-7], z:[-8,-4]) down to the vault floor, running south.
  stairFlight(world, {
    x: -9.5, width: 4, topY: 0, bottomY: CELLAR_Y,
    fromZ: -4, toZ: -9, steps: 9, axis: 'z',
  });

  // (B) Exterior bulkhead stair — inside the sunken areaway (x:[-26,-20]),
  // descends from the west-garden lawn edge (z=-4) down into the vault, running
  // south. The thief's stealth route straight to the objective.
  stairFlight(world, {
    x: -23, width: 5, topY: 0, bottomY: CELLAR_Y,
    fromZ: -4, toZ: -10, steps: 9, axis: 'z',
  });

  // (C) Twin grand staircases in the open two-storey hall, rising south→north
  // up to the east / west balcony wings (y=floor2). No ceiling above the hall,
  // so no hole is needed.
  const f2 = HOUSE.floor2;
  stairFlight(world, {
    x: 5.5, width: 3, topY: f2, bottomY: 0,
    fromZ: -5, toZ: 4, steps: 11, axis: 'z',
  });
  stairFlight(world, {
    x: -5.5, width: 3, topY: f2, bottomY: 0,
    fromZ: -5, toZ: 4, steps: 11, axis: 'z',
  });
}

// ─── Upper floor: balcony ring, wings, exterior balcony ──────────────────────
function buildUpperFloor(world: World) {
  const y = HOUSE.floor2, T = 0.4;
  const { x0, x1, z0, z1 } = HOUSE;
  // The grand-hall VOID stays open: x:[-7,7], z:[-6,10].
  // Wing floors (west & east blocks) + south/north landings ring the void.
  addBox(world, (x0 - 7) / 2, y, 0, -7 - x0, 0.4, z1 - z0, PAL.floorWood);       // west wing
  addBox(world, (7 + x1) / 2, y, 0, x1 - 7, 0.4, z1 - z0, PAL.floorWood);        // east wing
  addBox(world, 0, y, (z0 - 6) / 2, 14, 0.4, -6 - z0, PAL.floorWood);            // south landing
  addBox(world, 0, y, (10 + z1) / 2, 14, 0.4, z1 - 10, PAL.floorWood);           // north landing

  // Balcony railings around the void (with gaps where the two stairs arrive,
  // z:[3,5] on each side).
  railZ(world, -7, -6, 10, y, [[3, 5]]);
  railZ(world, 7, -6, 10, y, [[3, 5]]);
  railX(world, -6, -7, 7, y);
  railX(world, 10, -7, 7, y);

  // A few upper partition walls → a master suite (NE) and a landing nook (NW),
  // giving the Owner rooms + perches upstairs. Short walls with door gaps.
  const uy = y + 1.5, uh = 2.8;
  addBox(world, 13.5, uy, 6.2, x1 - 7, uh, T, PAL.interior);                     // master S wall
  wallRunZ(world, 8, 6.2, z1, uh, T, PAL.interior, [[10, 12.5]], uy);            // master W wall (door)
  addBox(world, -13.5, uy, 6.2, -7 - x0, uh, T, PAL.interior);                   // guest S wall
  wallRunZ(world, -8, 6.2, z1, uh, T, PAL.interior, [[10, 12.5]], uy);           // guest W wall (door)

  // Exterior balcony over the front door — an Owner sniper perch onto the
  // driveway. Slab + railings, reached via a door gap in the south upper wall.
  addBox(world, 0, y, z0 - 1.6, 8, 0.4, 3.4, PAL.floorWood);
  railX(world, z0 - 3.2, -4, 4, y);
  railZ(world, -4, z0 - 3.2, z0, y, []);
  railZ(world, 4, z0 - 3.2, z0, y, []);
  // Balcony door: gap in the south exterior wall at the upper storey.
  addBox(world, -5.75, y + 1.5, z0, 8.5 - 4, 2.8, HOUSE.T, PAL.stone);
  addBox(world, 5.75, y + 1.5, z0, 8.5 - 4, 2.8, HOUSE.T, PAL.stone);
  // Fill the rest of the upper south/north/side exterior walls (above the
  // ground-floor walls) so the upper storey is enclosed except the balcony door.
  upperExteriorBand(world);
}

/** Enclose the upper storey: a 2.8 m band of exterior wall above the
 *  ground-floor walls on all four sides (the south side's balcony door gap is
 *  already carved by the two segments in buildUpperFloor). */
function upperExteriorBand(world: World) {
  const { x0, x1, z0, z1, floor2, T } = HOUSE;
  const y = floor2 + 1.5, h = 2.8;
  addBox(world, 0, y, z1, x1 - x0, h, T, PAL.stone);        // north
  addBox(world, x0, y, 0, T, h, z1 - z0, PAL.stone);        // west
  addBox(world, x1, y, 0, T, h, z1 - z0, PAL.stone);        // east
}

// ─── Interior furniture / cover ──────────────────────────────────────────────
function buildFurniture(world: World) {
  // Grand hall — rug (decoration) + a long centre table + flanking benches.
  addBox(world, 0, 0.05, 2, 7, 0.02, 12, 0x4a1f1f, false);
  addBox(world, 0, 0.5, 2, 2.6, 1.0, 4, PAL.trim);
  addBox(world, -4.5, 0.4, 6, 1.2, 0.8, 3, PAL.trimD);
  addBox(world, 4.5, 0.4, 6, 1.2, 0.8, 3, PAL.trimD);

  // Foyer — welcome desk (Owner spawn landmark) + coat stand.
  addBox(world, -3.5, 0.55, -12, 3, 1.1, 1, PAL.trim);
  addBox(world, 4, 0.7, -13, 0.8, 1.4, 0.8, PAL.trimD);

  // Kitchen — a big central island + counters along the north wall.
  addBox(world, -13, 0.6, 8, 4, 1.2, 2, PAL.trimD);
  addBox(world, -13, 0.75, 14.5, 10, 1.5, 1.4, PAL.stoneD);

  // Library — tall bookshelves (good cover / sightline breaks).
  addBox(world, 18.5, 1.6, 6, 1.2, 3.2, 5, PAL.trimD);
  addBox(world, 18.5, 1.6, 13, 1.2, 3.2, 5, PAL.trimD);
  addBox(world, 12, 1.6, 15.4, 8, 3.2, 1.0, PAL.trimD);
  addBox(world, 10, 0.5, 8, 2.4, 1.0, 1.2, PAL.trim);       // reading table

  // Dining — long banquet table + a sideboard.
  addBox(world, 13, 0.55, -10, 3, 1.1, 7, PAL.trim);
  addBox(world, 18.5, 0.7, -12, 1.2, 1.4, 5, PAL.trimD);

  // Lounge — sofas around a low table (cover near the cellar stair).
  addBox(world, -15, 0.5, -12, 5, 1.0, 1.4, PAL.trim);
  addBox(world, -18.5, 0.5, -10, 1.4, 1.0, 4, PAL.trim);
  addBox(world, -14, 0.35, -10, 2.2, 0.7, 1.4, PAL.trimD);  // coffee table

  // Gallery — display plinths (low cover) with gilded caps.
  for (const x of [-3, 3]) {
    addBox(world, x, 0.6, 13, 1.0, 1.2, 1.0, PAL.stoneD);
    addBox(world, x, 1.35, 13, 0.7, 0.3, 0.7, PAL.gold, false, true, 0.25);
  }

  // Upstairs — master bed + guest bed + a balcony-side chest (perch cover).
  addBox(world, 15, HOUSE.floor2 + 0.5, 12, 3.5, 0.9, 2.4, PAL.trim);
  addBox(world, -15, HOUSE.floor2 + 0.5, 12, 3.5, 0.9, 2.4, PAL.trim);
  addBox(world, 9, HOUSE.floor2 + 0.5, 2, 1.6, 0.9, 1.6, PAL.trimD);
  addBox(world, -9, HOUSE.floor2 + 0.5, 2, 1.6, 0.9, 1.6, PAL.trimD);
}

// ─── Primitive builders ──────────────────────────────────────────────────────

/** A wall running along X (constant Z), optionally with door gaps given as
 *  [xStart,xEnd] ranges. Segments between gaps are filled. */
function wallRunX(
  world: World, z: number, xa: number, xb: number,
  h: number, t: number, color: number, gaps: Array<[number, number]> = [], yCenter = h / 2,
) {
  const edges = [xa, ...gaps.flat(), xb].sort((a, b) => a - b);
  // Fill segments that are NOT inside a gap.
  for (let i = 0; i < edges.length - 1; i++) {
    const s = edges[i], e = edges[i + 1];
    if (e - s < 0.05) continue;
    const inGap = gaps.some(([gs, ge]) => s >= gs - 0.01 && e <= ge + 0.01);
    if (inGap) continue;
    addBox(world, (s + e) / 2, yCenter, z, e - s, h, t, color);
  }
}

/** A wall running along Z (constant X), optional door gaps as [zStart,zEnd]. */
function wallRunZ(
  world: World, x: number, za: number, zb: number,
  h: number, t: number, color: number, gaps: Array<[number, number]> = [], yCenter = h / 2,
) {
  const edges = [za, ...gaps.flat(), zb].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const s = edges[i], e = edges[i + 1];
    if (e - s < 0.05) continue;
    const inGap = gaps.some(([gs, ge]) => s >= gs - 0.01 && e <= ge + 0.01);
    if (inGap) continue;
    addBox(world, x, yCenter, (s + e) / 2, t, h, e - s, color);
  }
}

/** Balcony railing along X (constant Z), optional gaps [xStart,xEnd]. */
function railX(world: World, z: number, xa: number, xb: number, floorY: number, gaps: Array<[number, number]> = []) {
  const edges = [xa, ...gaps.flat(), xb].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const s = edges[i], e = edges[i + 1];
    if (e - s < 0.05) continue;
    if (gaps.some(([gs, ge]) => s >= gs - 0.01 && e <= ge + 0.01)) continue;
    addBox(world, (s + e) / 2, floorY + 0.75, z, e - s, 1.1, 0.25, PAL.trim);
  }
}

/** Balcony railing along Z (constant X), optional gaps [zStart,zEnd]. */
function railZ(world: World, x: number, za: number, zb: number, floorY: number, gaps: Array<[number, number]> = []) {
  const edges = [za, ...gaps.flat(), zb].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const s = edges[i], e = edges[i + 1];
    if (e - s < 0.05) continue;
    if (gaps.some(([gs, ge]) => s >= gs - 0.01 && e <= ge + 0.01)) continue;
    addBox(world, x, floorY + 0.75, (s + e) / 2, 0.25, 1.1, e - s, PAL.trim);
  }
}

/**
 * A flight of stairs. Each step is a solid box sitting on the flight's bottom
 * (so there are no gaps beneath to fall through) rising toward the top. Runs
 * along the Z axis at fixed X. Risers are (topY-bottomY)/steps ≤ 0.55 so the
 * controller auto-steps them both ways.
 */
function stairFlight(
  world: World,
  o: { x: number; width: number; topY: number; bottomY: number; fromZ: number; toZ: number; steps: number; axis: 'z' },
) {
  const rise = (o.topY - o.bottomY) / o.steps;
  const dz = (o.toZ - o.fromZ) / o.steps;
  const depth = Math.abs(dz) + 0.02;
  for (let i = 0; i < o.steps; i++) {
    // Step i is the (i+1)-th from the bottom; its TOP surface is at this height.
    const top = o.bottomY + rise * (o.steps - i);
    const zc = o.fromZ + dz * (i + 0.5);
    const height = top - o.bottomY;
    addBox(world, o.x, o.bottomY + height / 2, zc, o.width, height, depth, PAL.trim);
  }
}

/** A garden hedge (low box cover) with a slightly darker base. */
function hedge(world: World, x: number, z: number, len: number, h: number) {
  addBox(world, x, h / 2, z, len, h, 1.4, PAL.hedge);
  addBox(world, x, 0.15, z, len + 0.3, 0.3, 1.7, PAL.hedgeD, false);
}

/** A stylised low-poly tree: box trunk (collides) + two canopy tiers (visual). */
function tree(world: World, x: number, z: number) {
  addBox(world, x, 2, z, 0.9, 4, 0.9, PAL.trunk);
  addBox(world, x, 4.6, z, 4.2, 3.0, 4.2, PAL.leaf, false);
  addBox(world, x, 6.4, z, 2.8, 2.2, 2.8, PAL.leafD, false);
}

/** A wrought-iron lamp post with a glowing lantern (emissive; no real light). */
function lampPost(world: World, x: number, z: number) {
  addBox(world, x, 1.5, z, 0.3, 3.0, 0.3, PAL.fence);          // post (cover)
  addBox(world, x, 3.15, z, 0.7, 0.7, 0.7, PAL.window, false, true, 1.0); // lantern
  addBox(world, x, 3.6, z, 0.4, 0.3, 0.4, PAL.stoneD, false);  // cap
}

/** A stone statue on a plinth (porch flanker / cover). */
function statue(world: World, x: number, z: number) {
  addBox(world, x, 0.4, z, 1.4, 0.8, 1.4, PAL.stoneD);
  addBox(world, x, 1.6, z, 0.7, 1.8, 0.7, PAL.marble, false);
  addBox(world, x, 2.7, z, 0.6, 0.6, 0.6, PAL.marble, false);
}

/** A tiered fountain: octagonal-ish stone rim + a glowing water disc + a spout. */
function fountain(world: World, x: number, z: number) {
  addBox(world, x, 0.5, z, 6, 1.0, 6, PAL.marble);
  addBox(world, x, 1.02, z, 5.2, 0.1, 5.2, PAL.water, false, true, 0.35);
  addBox(world, x, 1.6, z, 1.2, 1.2, 1.2, PAL.marble, false);
  addBox(world, x, 2.6, z, 0.5, 1.0, 0.5, PAL.marble, false);
}

/** A back-garden gazebo: a ring of pillars + a roof (visual landmark + cover). */
function gazebo(world: World, x: number, z: number) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    addBox(world, x + sx * 2.5, 1.6, z + sz * 2.5, 0.6, 3.2, 0.6, PAL.marble);
  }
  addBox(world, x, 3.4, z, 6.5, 0.4, 6.5, PAL.stoneD, false);
  addBox(world, x, 3.9, z, 4.5, 0.7, 4.5, PAL.roof, false);
}

/** A driveway / interior warm point light (registered as a decoration). */
function warmLight(world: World, x: number, y: number, z: number, intensity: number, dist: number) {
  const l = new THREE.PointLight(0xffb668, intensity, dist, 2);
  l.position.set(x, y, z);
  world.addDecoration(l);
}

/** A warm lit window pane (emissive, non-collide). `axis` = wall orientation. */
function litWindow(world: World, x: number, y: number, z: number, axis: 'x' | 'z') {
  const [sx, sz] = axis === 'z' ? [0.08, 1.8] : [1.8, 0.08];
  addBox(world, x, y, z, sx, 1.9, sz, PAL.window, false, true, 0.9);
}

/** A cold unlit window pane (dim emissive, non-collide). */
function coldWindow(world: World, x: number, y: number, z: number, axis: 'x' | 'z') {
  const [sx, sz] = axis === 'z' ? [0.08, 1.8] : [1.8, 0.08];
  addBox(world, x, y, z, sx, 1.9, sz, PAL.windowC, false, true, 0.45);
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
