/**
 * Frostbite — a frozen-fortress arena. The third map (Phase 17), added for
 * Krunker-style variety. Solo/combat-selectable; the server stays on its own
 * map list (sandstone/industrial), so this is purely a single-player addition
 * and touches no networking — solo collision comes from the build() solids.
 *
 * Layout (top-down, ~80 × 80m playable, fully symmetric so no spawn is favoured):
 *
 *       +Z ──── north ridge (sniper sightline) ──── +Z
 *       ┌──────────────────────────────────────────┐
 *       │ NW bunker          ice crates       NE bunker │
 *       │                                              │
 *       │   ┌──── frozen lake + central keep ────┐    │
 *       │   │  ramps + jump pads → keep roof     │    │
 *       │   └────────────────────────────────────┘    │
 *       │ SW bunker          ice crates       SE bunker │
 *       └──────────────────────────────────────────┘
 *       -Z ──── south ridge ──── -Z
 *
 * Three lanes: north ridge (long), central keep (vertical, mid), south ridge
 * (long). The central keep is a two-tier ice block reachable by climbable steps
 * and corner jump pads — the vertical landmark + power position.
 *
 * Palette: snow-white ground, glacier-blue ice, dark steel walls, frost-teal
 * jump pads. Cool fog so the arena reads distinctly from sun-baked Sandstone.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  snow:       0xe8eef5,    // ground / open spaces
  snowShadow: 0xc3d0de,    // lower-saturation accent tiles
  ice:        0x9fc7e8,    // glacier-blue ice blocks
  iceDark:    0x6c9bc0,    // shadowed ice variant
  steel:      0x44505c,    // dark structural steel
  steelTrim:  0x2b343d,    // darker steel trim
  keep:       0xb6d6ec,    // central keep stone (pale ice)
  jumpPad:    0x49e6d0,    // frost-teal pad
};

const SPAWN_Y = 0.5;
const HEIGHT  = 4;            // standard bunker height

// FFA spawns — four corners, set back from the ridges' long sightlines.
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3( 32, SPAWN_Y,  32),   // NE corner
  new THREE.Vector3(-32, SPAWN_Y,  32),   // NW corner
  new THREE.Vector3( 32, SPAWN_Y, -32),   // SE corner
  new THREE.Vector3(-32, SPAWN_Y, -32),   // SW corner
];

// TDM pair — N team vs S team (used only if a team mode ever picks this map).
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, SPAWN_Y,  36),
  new THREE.Vector3(0, SPAWN_Y, -36),
];

export function buildFrostbite(world: World) {
  // Sky — cold pale blue; fog matches so the horizon dissolves into a snow haze.
  world.scene.background = new THREE.Color(0xcfe2f0);
  world.scene.fog = new THREE.Fog(0xcfe2f0, 50, 175);

  // Lighting — cool overhead light + a soft blue fill from below so flat-shaded
  // down-faces don't read as black against the snow.
  const hemi = new THREE.HemisphereLight(0xf2f8ff, 0x8fa6bd, 0.75);
  world.addDecoration(hemi);
  const sun = new THREE.DirectionalLight(0xdfeeff, 0.9);
  sun.position.set(-30, 65, 30);
  world.addDecoration(sun);

  buildGround(world);
  buildPerimeter(world);
  buildBunkers(world);
  buildCentralKeep(world);
  buildIceCrates(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  // Ground plane — single big snow box. Top at y=0.
  addBox(world, 0, -0.5, 0, 90, 1, 90, PALETTE.snow);

  // Frozen lake — a pale-ice slab inset in the centre (visual only, flush with
  // the ground so it doesn't trip movement).
  addBox(world, 0, -0.48, 0, 26, 0.04, 26, PALETTE.ice, false);

  // Sparse ice tiles for visual rhythm across the open snow.
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 3 !== 0) continue;
      addBox(world, x * 10, -0.49, z * 10, 2, 0.02, 2, PALETTE.snowShadow, false);
    }
  }
}

function buildPerimeter(world: World) {
  // 8m-high boundary walls — steel-faced. 1m thick. 45 from center each side.
  const PERIM = 45;
  addBox(world, 0,      HEIGHT, -PERIM, PERIM * 2, HEIGHT * 2, 1, PALETTE.steel);
  addBox(world, 0,      HEIGHT,  PERIM, PERIM * 2, HEIGHT * 2, 1, PALETTE.steel);
  addBox(world, -PERIM, HEIGHT, 0, 1, HEIGHT * 2, PERIM * 2, PALETTE.steel);
  addBox(world,  PERIM, HEIGHT, 0, 1, HEIGHT * 2, PERIM * 2, PALETTE.steel);

  // Top trim — visual accent along each wall.
  addBox(world, 0,      HEIGHT * 2 + 0.2, -PERIM, PERIM * 2, 0.4, 1.2, PALETTE.steelTrim, false);
  addBox(world, 0,      HEIGHT * 2 + 0.2,  PERIM, PERIM * 2, 0.4, 1.2, PALETTE.steelTrim, false);
  addBox(world, -PERIM, HEIGHT * 2 + 0.2, 0, 1.2, 0.4, PERIM * 2, PALETTE.steelTrim, false);
  addBox(world,  PERIM, HEIGHT * 2 + 0.2, 0, 1.2, 0.4, PERIM * 2, PALETTE.steelTrim, false);
}

function buildBunkers(world: World) {
  // Four corner bunkers — solid blocks the player can run on top of, with an
  // ice-slab roof + steel trim. Roughly 12 × 4 × 12.
  bunker(world,  24,  24, 12, HEIGHT, 12);   // NE
  bunker(world, -24,  24, 12, HEIGHT, 12);   // NW
  bunker(world,  24, -24, 12, HEIGHT, 12);   // SE
  bunker(world, -24, -24, 12, HEIGHT, 12);   // SW

  // Mid-flank half-cover blocks between the ridges and the centre (2.5m tall —
  // half-cover + a stepping stone toward the bunker roofs).
  shortBlock(world,  15,  9, 6, 2.5, 6);
  shortBlock(world, -15,  9, 6, 2.5, 6);
  shortBlock(world,  15, -9, 6, 2.5, 6);
  shortBlock(world, -15, -9, 6, 2.5, 6);
}

function bunker(world: World, cx: number, cz: number, sx: number, sy: number, sz: number) {
  addBox(world, cx, sy / 2, cz, sx, sy, sz, PALETTE.steel);
  // Ice roof slab — slightly wider for an overhang.
  addBox(world, cx, sy + 0.25, cz, sx + 0.6, 0.5, sz + 0.6, PALETTE.ice);
  // Dark trim atop.
  addBox(world, cx, sy + 0.55, cz, sx + 0.7, 0.1, sz + 0.7, PALETTE.steelTrim, false);
}

function shortBlock(world: World, cx: number, cz: number, sx: number, sy: number, sz: number) {
  addBox(world, cx, sy / 2, cz, sx, sy, sz, PALETTE.iceDark);
  addBox(world, cx, sy + 0.2, cz, sx + 0.4, 0.4, sz + 0.4, PALETTE.ice);
}

function buildCentralKeep(world: World) {
  // Two-tier ice keep at the centre — the vertical power position. Reachable by
  // climbable steps on the N/S faces (each step 0.5m ≤ the 0.55m step-up) and by
  // corner jump pads. The lower tier roof sits at y=3, the upper at y=5.

  // Lower tier — 10 × 3 × 10 block, roof walkable at y=3.
  addBox(world, 0, 1.5, 0, 10, 3, 10, PALETTE.keep);
  // Upper tier — 5 × 2 × 5 block on top, roof walkable at y=5.
  addBox(world, 0, 4.0, 0, 5, 2, 5, PALETTE.iceDark);
  // Crown trim.
  addBox(world, 0, 5.1, 0, 5.4, 0.2, 5.4, PALETTE.steelTrim, false);

  // Climbable steps up the north face of the lower tier (z = +5 outward).
  // Four 0.5m risers stepping out from the block.
  for (let i = 0; i < 5; i++) {
    const y = 0.25 + i * 0.5;
    const z = 5 + 1.0 + i * 1.0;   // each tread 1m deep, marching away from the keep
    addBox(world, 0, y, z, 4, 0.5 + i * 0.5, 1.2, PALETTE.iceDark);
  }
  // Mirror on the south face (z = -5 outward).
  for (let i = 0; i < 5; i++) {
    const y = 0.25 + i * 0.5;
    const z = -(5 + 1.0 + i * 1.0);
    addBox(world, 0, y, z, 4, 0.5 + i * 0.5, 1.2, PALETTE.iceDark);
  }
}

function buildIceCrates(world: World) {
  // Ice-crate stacks on the ridges — higher-than-step blockers for cover.
  const crate = (cx: number, cy: number, cz: number) =>
    addBox(world, cx, cy, cz, 1.4, 1.4, 1.4, PALETTE.iceDark);
  crate( 10, 0.7,  19);
  crate( 12, 2.1,  19);
  crate(-10, 0.7,  19);
  crate(-10, 0.7,  21);
  crate( 10, 0.7, -19);
  crate(-10, 0.7, -19);
  crate(-12, 2.1, -19);

  // Low snow mounds in the plaza flanks — vaultable cover (0.5m stacks).
  const mound = (cx: number, cz: number) => {
    addBox(world, cx, 0.25, cz, 1.8, 0.5, 0.9, PALETTE.snowShadow);
    addBox(world, cx, 0.75, cz, 1.6, 0.5, 0.8, PALETTE.snow);
  };
  mound( 13, 0);
  mound(-13, 0);
}

function buildJumpPads(world: World) {
  // Corner pads flanking the keep — launch onto the keep's lower roof (y=3).
  addJumpPad(world,  7, 0.1,  7, 2.4, 0.2, 2.4, 13);
  addJumpPad(world, -7, 0.1,  7, 2.4, 0.2, 2.4, 13);
  addJumpPad(world,  7, 0.1, -7, 2.4, 0.2, 2.4, 13);
  addJumpPad(world, -7, 0.1, -7, 2.4, 0.2, 2.4, 13);

  // Bunker pads — launch onto the corner bunker roofs (y≈4.25).
  addJumpPad(world,  22, 0.1,  17, 2.4, 0.2, 2.4, 15);   // NE
  addJumpPad(world, -22, 0.1,  17, 2.4, 0.2, 2.4, 15);   // NW
  addJumpPad(world,  22, 0.1, -17, 2.4, 0.2, 2.4, 15);   // SE
  addJumpPad(world, -22, 0.1, -17, 2.4, 0.2, 2.4, 15);   // SW
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
    emissive: 0x0a4a44,
    emissiveIntensity: 0.5,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const FROSTBITE_MAP: GameMap = {
  meta: {
    id: 'frostbite',
    displayName: 'Frostbite',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xbfe6ff,
  },
  build: buildFrostbite,
};
