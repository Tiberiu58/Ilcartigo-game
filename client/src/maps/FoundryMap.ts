/**
 * Foundry — a molten steelworks arena.
 *
 * The seventh combat map, and the warm/fiery counterpart to icy Frostline:
 * dark cast-iron structures veined with glowing orange magma, ember-lit, with a
 * deep-red night sky. Built on the proven *symmetric* Cobalt/Frostline skeleton
 * (mirrored about both axes → no TDM side advantage, spawn corners known-clear)
 * then fully re-themed + re-covered with its own identity: a central smelter
 * dais crowned by a tall furnace stack, two team decks, and decorative lava
 * channels carved into the floor (non-colliding — pure look).
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable):
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │   slag           jump pads          slag        │
 *      │         ┌──── smelter dais ────┐                │
 *      │  W wall │   furnace stack · pads │  E wall      │
 *      │         └──────────────────────┘                │
 *      │   slag           jump pads          slag        │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is jump-pad driven (matches Sandstone/Cobalt's proven model): four
 * pads ring the central dais (top y=3), two more launch onto each team deck. No
 * mid-height ledges that snag the 0.55 m step-up — cover is either low (steppable
 * slag bumps) or clearly tall (full cover walls / slag heaps).
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x241c1a,    // dark scorched iron ground
  floorTile: 0x2e2320,    // bleached ash accent tiles
  wall:      0x352a26,    // cast-iron structure (warm dark)
  wallDark:  0x261d1a,    // shadow variant
  platform:  0x3d2f29,    // raised smelter dais top
  crate:     0x4a3328,    // rusted slag heaps (cover)
  beam:      0x1c1411,    // dark structural beam
  lava:      0xff5a1e,    // molten orange accent (emissive)
  ember:     0xffb347,    // warm ember highlight (emissive)
  jumpPad:   0xff8a3c,    // glowing orange pad
};

const SPAWN_Y = 0.5;
const PERIM = 42;          // perimeter wall distance from centre
const WALL_H = 8;          // perimeter wall height

// FFA spawns — four corners, set back from the structures (same proven-clear
// anchors as Cobalt/Frostline).
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3( 34, SPAWN_Y,  34),
  new THREE.Vector3(-34, SPAWN_Y,  34),
  new THREE.Vector3( 34, SPAWN_Y, -34),
  new THREE.Vector3(-34, SPAWN_Y, -34),
];

// TDM pair — North team vs South team, behind their decks.
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, SPAWN_Y,  34),
  new THREE.Vector3(0, SPAWN_Y, -34),
];

export function buildFoundry(world: World) {
  // Smoky red-black night sky; fog dissolves the perimeter into ember haze.
  world.scene.background = new THREE.Color(0x140a08);
  world.scene.fog = new THREE.Fog(0x180b07, 55, 195);

  // Lighting — warm overhead key + a hot orange fill so the molten theme reads
  // and flat-shaded faces stay legible.
  const hemi = new THREE.HemisphereLight(0xffd2a6, 0x140a08, 0.8);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xffe6c2, 0.85);
  key.position.set(-28, 62, 36);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0xff7a30, 0.4);
  fill.position.set(38, 26, -22);
  world.addDecoration(fill);
  // A hot point glow rising from the central furnace.
  const furnaceGlow = new THREE.PointLight(0xff5a1e, 1.1, 55, 2);
  furnaceGlow.position.set(0, 5, 0);
  world.addDecoration(furnaceGlow);

  buildGround(world);
  buildPerimeter(world);
  buildCentralDais(world);
  buildTeamDecks(world);
  buildCover(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 88, 1, 88, PALETTE.floor);
  // Sparse ash accent tiles for visual rhythm.
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 2 !== 0) continue;
      addBox(world, x * 10, -0.49, z * 10, 3, 0.02, 3, PALETTE.floorTile, false);
    }
  }
  // Molten lava channels — glowing cross strips through the floor (decoration).
  addBox(world, 0, -0.46, 0, 84, 0.04, 1.1, PALETTE.lava, false, true);
  addBox(world, 0, -0.46, 0, 1.1, 0.04, 84, PALETTE.lava, false, true);
  // Diagonal ember veins (short segments) for extra heat read.
  for (const [vx, vz] of [[19, 19], [-19, 19], [19, -19], [-19, -19]] as const) {
    addBox(world, vx, -0.45, vz, 5, 0.03, 0.5, PALETTE.ember, false, true);
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Molten top-rail accents (non-colliding, emissive).
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.lava, false, true);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.lava, false, true);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.lava, false, true);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.lava, false, true);
}

function buildCentralDais(world: World) {
  // Raised 16×16 smelter dais, top at y=3. Reached by the ring of jump pads.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Molten trim around the dais top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.lava, false, true);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.lava, false, true);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.lava, false, true);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.lava, false, true);
  // Central furnace stack (top y=8) — tall hard cover so the high ground isn't a
  // death-box and the smelter reads as the map's landmark.
  addBox(world, 0, 5.5, 0, 3.2, 5, 3.2, PALETTE.wallDark);
  // Glowing furnace mouth band partway up (decoration).
  addBox(world, 0, 4.2, 1.65, 2.2, 0.8, 0.1, PALETTE.lava, false, true);
  addBox(world, 0, 4.2, -1.65, 2.2, 0.8, 0.1, PALETTE.lava, false, true);
  // Four corner crouch-blocks on the dais for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addBox(world, sx, 3.6, sz, 1.6, 1.2, 1.6, PALETTE.crate);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases with a high
  // perch over the mid. 18 wide × 8 deep.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Molten edge stripe (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.lava, false, true);
  }
}

function buildCover(world: World) {
  // Mid-field slag heaps (tall cover) at the four diagonals.
  const heap = (cx: number, cz: number) =>
    addBox(world, cx, 1.1, cz, 2.2, 2.2, 2.2, PALETTE.crate);
  heap(13, 13); heap(-13, 13); heap(13, -13); heap(-13, -13);

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable slag bumps near spawns for immediate peek cover (top y=0.5).
  for (const [sx, sz] of [[30, 30], [-30, 30], [30, -30], [-30, -30]] as const) {
    addBox(world, sx, 0.25, sz, 4, 0.5, 1.4, PALETTE.wallDark);
  }
}

function buildJumpPads(world: World) {
  // Ring around the central dais — land on top (y=3).
  addJumpPad(world,  9, 0.1, 0, 2.4, 0.2, 2.4, 13);
  addJumpPad(world, -9, 0.1, 0, 2.4, 0.2, 2.4, 13);
  addJumpPad(world,  0, 0.1, 9, 2.4, 0.2, 2.4, 13);
  addJumpPad(world,  0, 0.1, -9, 2.4, 0.2, 2.4, 13);
  // Two pads launch onto each team deck (top y=3).
  addJumpPad(world,  7, 0.1, 22, 2.4, 0.2, 2.4, 13);
  addJumpPad(world, -7, 0.1, 22, 2.4, 0.2, 2.4, 13);
  addJumpPad(world,  7, 0.1, -22, 2.4, 0.2, 2.4, 13);
  addJumpPad(world, -7, 0.1, -22, 2.4, 0.2, 2.4, 13);
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
    emissiveIntensity: emissive ? 0.85 : 0,
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

function addJumpPad(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  boost: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.jumpPad,
    emissive: 0x7a2e08,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const FOUNDRY_MAP: GameMap = {
  meta: {
    id: 'foundry',
    displayName: 'Foundry',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xff8a3c,
  },
  build: buildFoundry,
};
