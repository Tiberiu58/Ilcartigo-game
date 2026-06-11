/**
 * Sandstone — Krunker-style sun-baked desert town.
 *
 * Layout (top-down, +Z is north, -Z is south, ~80 × 80m playable):
 *
 *       +Z ──── long lane (sniper sightline) ──── +Z
 *       ┌──────────────────────────────────────────┐
 *       │ N-W tower         crates            N-E tower │
 *       │                                              │
 *       │    ┌──────── plaza & central tower ───────┐  │
 *       │    │  jump pads → rooftop catwalks       │  │
 *       │    └─────────────────────────────────────┘  │
 *       │ S-W bldg     alley (short lane)     S-E bldg │
 *       └──────────────────────────────────────────┘
 *       -Z ──── short alley ──── -Z
 *
 * Three sightlines:
 *   - LONG LANE (north strip, z ≈ +25): sniper paradise, slight cover via crates.
 *   - PLAZA (centre, z ≈ 0): mid-range, vertical play via central tower + catwalks.
 *   - ALLEY (south strip, z ≈ -25): close-range, lots of corners.
 *
 * Catwalks at y=4 connect plaza tower to NE/NW rooftops, reachable via jump
 * pads from ground floor.
 *
 * Palette: sun-baked tan ground, terracotta walls, dark wood beam accents,
 * burnt orange roof tiles, yellow jump pads.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  sand:        0xd9b87a,    // ground / open spaces
  sandShadow:  0xb5945a,    // lower-saturation accent tiles
  adobe:       0xc77a4b,    // primary wall — terracotta
  adobeDark:   0x8c4f2f,    // shadowed wall variant
  beam:        0x3a2618,    // dark wood structural beam
  roof:        0xa4502a,    // burnt orange tile
  roofDark:    0x6e3015,    // shadow side of roof
  stone:       0x9a8d70,    // tower / monument stone
  jumpPad:     0xf5d442,
};

const SPAWN_Y = 0.5;
const HEIGHT  = 4;            // standard building height
const ROOF_HEIGHT = 4.5;      // roof platform Y (top of building + 0.5)

// FFA spawns — four corners of the map, set back from sightlines.
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3( 32, SPAWN_Y,  32),   // NE corner
  new THREE.Vector3(-32, SPAWN_Y,  32),   // NW corner
  new THREE.Vector3( 32, SPAWN_Y, -32),   // SE corner
  new THREE.Vector3(-32, SPAWN_Y, -32),   // SW corner
];

// TDM pair — N team vs S team.
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, SPAWN_Y,  36),     // North team
  new THREE.Vector3(0, SPAWN_Y, -36),     // South team
];

export function buildSandstone(world: World) {
  // Sky — warm hazy tan; fog matches so the horizon dissolves into desert glare.
  world.scene.background = new THREE.Color(0xe8c98a);
  world.scene.fog = new THREE.Fog(0xe8c98a, 50, 180);

  // Lighting — warm overhead sun + warm fill. Hemisphere bottom color tinted
  // toward the sand so flat-shaded down-faces don't read as black.
  const hemi = new THREE.HemisphereLight(0xfff1c8, 0xb5945a, 0.7);
  world.addDecoration(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 0.95);
  sun.position.set(35, 70, 25);
  world.addDecoration(sun);

  buildGround(world);
  buildPerimeter(world);
  buildBuildings(world);
  buildCentralTower(world);
  buildCatwalks(world);
  buildSandbags(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  // Ground plane — single big sand box. Top at y=0.
  addBox(world, 0, -0.5, 0, 90, 1, 90, PALETTE.sand);

  // Decorative ground tiles — sun-bleached squares in a sparse grid so the
  // open sand has visual rhythm without going maximalist.
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 3 !== 0) continue;
      addBox(world, x * 9, -0.49, z * 9, 2, 0.02, 2, PALETTE.sandShadow, false);
    }
  }
}

function buildPerimeter(world: World) {
  // 8m-high boundary walls — adobe-faced. 1m thick. 45 from center each side.
  const PERIM = 45;
  addBox(world, 0,    HEIGHT, -PERIM, PERIM * 2, HEIGHT * 2, 1, PALETTE.adobe);
  addBox(world, 0,    HEIGHT,  PERIM, PERIM * 2, HEIGHT * 2, 1, PALETTE.adobe);
  addBox(world, -PERIM, HEIGHT, 0, 1, HEIGHT * 2, PERIM * 2, PALETTE.adobe);
  addBox(world,  PERIM, HEIGHT, 0, 1, HEIGHT * 2, PERIM * 2, PALETTE.adobe);

  // Top beams — visual accent along each wall.
  addBox(world, 0,  HEIGHT * 2 + 0.2, -PERIM, PERIM * 2, 0.4, 1.2, PALETTE.beam, false);
  addBox(world, 0,  HEIGHT * 2 + 0.2,  PERIM, PERIM * 2, 0.4, 1.2, PALETTE.beam, false);
  addBox(world, -PERIM, HEIGHT * 2 + 0.2, 0, 1.2, 0.4, PERIM * 2, PALETTE.beam, false);
  addBox(world,  PERIM, HEIGHT * 2 + 0.2, 0, 1.2, 0.4, PERIM * 2, PALETTE.beam, false);
}

function buildBuildings(world: World) {
  // Four corner buildings — solid blocks the player can run on top of.
  // Each is roughly 12 × 4 × 12, with a roof slab and a wood beam line.

  // NE building
  building(world,  24,  24, 14, HEIGHT, 12);
  // NW building
  building(world, -24,  24, 14, HEIGHT, 12);
  // SE building
  building(world,  24, -24, 14, HEIGHT, 12);
  // SW building
  building(world, -24, -24, 14, HEIGHT, 12);

  // Mid-flank shorter buildings between the long lane and plaza.
  // Lower (2.5m) so they offer half-cover and a stepping-stone to rooftops.
  shortBlock(world,  16,  10, 6, 2.5, 6);
  shortBlock(world, -16,  10, 6, 2.5, 6);
  shortBlock(world,  16, -10, 6, 2.5, 6);
  shortBlock(world, -16, -10, 6, 2.5, 6);
}

/** Tall solid building with a slightly-thicker roof slab for visual depth. */
function building(world: World, cx: number, cz: number, sx: number, sy: number, sz: number) {
  // Main mass — adobe sides.
  addBox(world, cx, sy / 2, cz, sx, sy, sz, PALETTE.adobe);
  // Roof slab — burnt orange, slightly wider than the body for an overhang.
  addBox(world, cx, sy + 0.25, cz, sx + 0.6, 0.5, sz + 0.6, PALETTE.roof);
  // Top dark trim.
  addBox(world, cx, sy + 0.55, cz, sx + 0.7, 0.1, sz + 0.7, PALETTE.beam, false);
  // Front door indentation (purely visual).
  addBox(world, cx, 1.2, cz - sz / 2 - 0.01, 1.6, 2.4, 0.05, PALETTE.beam, false);
}

function shortBlock(world: World, cx: number, cz: number, sx: number, sy: number, sz: number) {
  addBox(world, cx, sy / 2, cz, sx, sy, sz, PALETTE.adobeDark);
  addBox(world, cx, sy + 0.2, cz, sx + 0.4, 0.4, sz + 0.4, PALETTE.roof);
}

function buildCentralTower(world: World) {
  // Central monument tower at (0, _, 0) — stone, two-tier, climbable via
  // catwalks but not directly. Provides the mid-plaza vertical landmark.
  addBox(world, 0, 2.5, 0, 4, 5, 4, PALETTE.stone);
  addBox(world, 0, 5.5, 0, 3, 1, 3, PALETTE.beam);
  addBox(world, 0, 6.5, 0, 2.2, 1, 2.2, PALETTE.stone);
  // Top platform — can be reached from catwalks via a small leap.
  addBox(world, 0, 7.2, 0, 1.6, 0.4, 1.6, PALETTE.roof);
}

function buildCatwalks(world: World) {
  // Catwalk at y=4: links the central tower's first tier to the NE/NW corner
  // building rooftops (which sit at y≈4.25). Player can walk it as a high
  // sightline. We build it as a series of plank-thin solid slabs.

  // NE catwalk: from tower (x=2, y=4, z=2) toward NE rooftop (x=24, z=24).
  // Three segments form an L-shape so it bends around the central pillar's footprint.
  catwalkSegment(world,   2,  4,   8,  3, 0.4, 12);   // straight east-ish, length 12
  catwalkSegment(world,  16,  4,  14, 12, 0.4,  3);   // turn north
  // NW catwalk — mirror across X.
  catwalkSegment(world,  -2, 4,   8, 3, 0.4, 12);
  catwalkSegment(world, -16, 4,  14, 12, 0.4,  3);

  // Catwalk side rails (visual; not collision so player can drop off either side).
  catwalkRail(world,    8,  4.6,   8, 0.05, 0.6, 12);
  catwalkRail(world,   16,  4.6,  14, 12, 0.6, 0.05);
}

function catwalkSegment(world: World, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
  addBox(world, cx, cy, cz, sx, sy, sz, PALETTE.beam);
  // Light-tan top so the walking surface reads visibly from below.
  addBox(world, cx, cy + sy / 2 + 0.01, cz, sx - 0.1, 0.02, sz - 0.1, PALETTE.sand, false);
}

function catwalkRail(world: World, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
  addBox(world, cx, cy, cz, sx, sy, sz, PALETTE.beam, false);
}

function buildSandbags(world: World) {
  // Sandbag clusters in the plaza — cover that the player can vault by step-up.
  // Step-up height is 0.55m, so a 0.5m-tall stack is climbable, 1.2m is not.
  const stack = (cx: number, cz: number) => {
    addBox(world, cx, 0.25, cz, 1.8, 0.5, 0.8, PALETTE.sandShadow);
    addBox(world, cx, 0.75, cz, 1.6, 0.5, 0.7, PALETTE.sand);
  };
  stack( 6, 0);
  stack(-6, 0);
  stack( 0,  6);
  stack( 0, -6);

  // Wooden crate stacks in mid-lane — higher-than-step blockers.
  const crate = (cx: number, cy: number, cz: number) =>
    addBox(world, cx, cy, cz, 1.4, 1.4, 1.4, PALETTE.adobeDark);
  crate( 10, 0.7,  18);
  crate( 12, 2.1,  18);
  crate(-10, 0.7,  18);
  crate(-10, 0.7,  20);
  crate( 10, 0.7, -18);
  crate(-10, 0.7, -18);
  crate(-12, 2.1, -18);
}

function buildJumpPads(world: World) {
  // Four jump pads positioned to launch ground-floor players up to catwalks
  // and rooftops. Boost values tuned with JUMP_VELOCITY = 7.5 reference.

  // Plaza pads — launch onto central tower's lower tier (y=5).
  addJumpPad(world,  3, 0.1,  6, 2.4, 0.2, 2.4, 17);
  addJumpPad(world, -3, 0.1,  6, 2.4, 0.2, 2.4, 17);
  addJumpPad(world,  3, 0.1, -6, 2.4, 0.2, 2.4, 17);
  addJumpPad(world, -3, 0.1, -6, 2.4, 0.2, 2.4, 17);

  // Corner pads — launch onto the corner rooftops (y≈4.25).
  addJumpPad(world,  22, 0.1,  18, 2.4, 0.2, 2.4, 15);   // NE
  addJumpPad(world, -22, 0.1,  18, 2.4, 0.2, 2.4, 15);   // NW
  addJumpPad(world,  22, 0.1, -18, 2.4, 0.2, 2.4, 15);   // SE
  addJumpPad(world, -22, 0.1, -18, 2.4, 0.2, 2.4, 15);   // SW
}

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

function addJumpPad(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  boost: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.jumpPad,
    emissive: 0x5a4a00,
    emissiveIntensity: 0.45,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

// Unused but exported so callers can preview the rooftop height when designing.
void ROOF_HEIGHT;

export const SANDSTONE_MAP: GameMap = {
  meta: {
    id: 'sandstone',
    displayName: 'Sandstone',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xffd9a0,
    // Pickups (Phase 14). Floor top is y=0. Health/armour on the mid-quadrant
    // lanes; the marquee Damage + Haste buffs flank the central plaza tower so
    // they're contested territory.
    pickupSpawns: [
      { type: 'health', x:  16, y: 0, z:  16 },
      { type: 'health', x: -16, y: 0, z: -16 },
      { type: 'armor',  x: -16, y: 0, z:  16 },
      { type: 'armor',  x:  16, y: 0, z: -16 },
      { type: 'damage', x:   0, y: 0, z:  10 },
      { type: 'haste',  x:   0, y: 0, z: -10 },
    ],
  },
  build: buildSandstone,
};
