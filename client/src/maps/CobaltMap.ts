/**
 * Cobalt — a clean, symmetric steel-and-neon arena.
 *
 * The third combat map, and the first built for pure *competitive symmetry*:
 * mirrored about both axes so neither side of a TDM has a layout advantage, and
 * cool-toned (slate blue + teal neon) for instant visual contrast with the warm
 * Sandstone and rusty Industrial.
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable):
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │   crate          jump pads          crate       │
 *      │         ┌──── central platform ────┐            │
 *      │  W wall │   pillar cover · pads    │  E wall    │
 *      │         └──────────────────────────┘            │
 *      │   crate          jump pads          crate       │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is jump-pad driven (matches Sandstone's proven model): four pads
 * ring the central platform (top y=3), two more launch onto each team deck. No
 * mid-height ledges that snag the 0.55 m step-up — cover is either low (steppable
 * bumps) or clearly tall (full cover walls / crates).
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x2b3340,    // dark slate ground
  floorTile: 0x353f4e,    // bleached floor accent tiles
  wall:      0x3a4555,    // steel blue-grey structure
  wallDark:  0x2a323e,    // shadow variant
  platform:  0x44505f,    // raised platform top
  crate:     0x4a3f5a,    // muted purple cover crates
  beam:      0x1c2230,    // dark structural beam
  accent:    0x36c8e0,    // neon teal accent (emissive)
  jumpPad:   0x36e0c8,    // cyan-green pad
};

const SPAWN_Y = 0.5;
const PERIM = 42;          // perimeter wall distance from centre
const WALL_H = 8;          // perimeter wall height

// FFA spawns — four corners, set back from the structures.
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

export function buildCobalt(world: World) {
  // Cool night sky; fog dissolves the perimeter into a blue haze.
  world.scene.background = new THREE.Color(0x10151c);
  world.scene.fog = new THREE.Fog(0x10151c, 60, 200);

  // Lighting — cool overhead key + soft fill so flat-shaded faces stay legible.
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x1a2230, 0.85);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xeaf2ff, 0.9);
  key.position.set(-30, 65, 35);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0x6fd8e0, 0.35);
  fill.position.set(40, 30, -25);
  world.addDecoration(fill);

  buildGround(world);
  buildPerimeter(world);
  buildCentralPlatform(world);
  buildTeamDecks(world);
  buildCover(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 88, 1, 88, PALETTE.floor);
  // Sparse accent tiles for visual rhythm + a teal grid feel.
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 2 !== 0) continue;
      addBox(world, x * 10, -0.49, z * 10, 3, 0.02, 3, PALETTE.floorTile, false);
    }
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Neon top-rail accents (non-colliding).
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 platform, top at y=3. Reached by the ring of jump pads.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Neon trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  // Central pillar cover on top (top y=6) so the high ground isn't a death-box.
  addBox(world, 0, 4.5, 0, 3, 3, 3, PALETTE.wallDark);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addBox(world, sx, 3.6, sz, 1.6, 1.2, 1.6, PALETTE.crate);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases that give
  // each TDM team a high perch over the mid. 18 wide × 8 deep.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Neon edge stripe (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.accent, false);
  }
}

function buildCover(world: World) {
  // Mid-field crate stacks (tall cover) at the four diagonals.
  const crate = (cx: number, cz: number) =>
    addBox(world, cx, 1.1, cz, 2.2, 2.2, 2.2, PALETTE.crate);
  crate(13, 13); crate(-13, 13); crate(13, -13); crate(-13, -13);

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable bumps near spawns for immediate peek cover (top y=0.5).
  for (const [sx, sz] of [[30, 30], [-30, 30], [30, -30], [-30, -30]] as const) {
    addBox(world, sx, 0.25, sz, 4, 0.5, 1.4, PALETTE.wallDark);
  }
}

function buildJumpPads(world: World) {
  // Ring around the central platform — land on top (y=3).
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
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const emissive = color === PALETTE.accent ? color : 0x000000;
  const mat = new THREE.MeshLambertMaterial({
    color, emissive, emissiveIntensity: color === PALETTE.accent ? 0.8 : 0, flatShading: true,
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
    emissive: 0x0a5a4a,
    emissiveIntensity: 0.55,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const COBALT_MAP: GameMap = {
  meta: {
    id: 'cobalt',
    displayName: 'Cobalt',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0x6fd8e0,
  },
  build: buildCobalt,
};
