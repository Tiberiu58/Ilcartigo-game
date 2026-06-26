/**
 * Foundry — a molten steel-mill arena: dark plate-metal structures, scorched
 * floor, and glowing orange lava channels. The seventh combat map and the
 * hottest-looking one, for instant contrast with warm Sandstone, rusty
 * Industrial, steel-blue Cobalt, dusk Overpass and frozen Frostline.
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable) — built on the proven
 * symmetric Cobalt/Frostline skeleton (so every TDM side is fair and all spawns
 * sit clear of solids), then fully re-themed: the collision geometry mirrors the
 * verified skeleton, only the materials + decorative lava channels are new, so
 * the layout is known-safe.
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │  slag block      jump pads       slag block      │
 *      │         ┌──── furnace platform ───┐              │
 *      │  W wall │  core pillar + cover    │  E wall      │
 *      │         └──────────────────────────┘             │
 *      │  slag block      jump pads       slag block      │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is entirely jump-pad driven (no mid-height ledges that snag the
 * 0.55 m auto-step). Lava channels are decoration only (non-colliding) — they
 * read as hazard but don't trap movement, keeping the floor fully playable.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x303338,    // dark scorched steel-plate ground
  floorTile: 0x3c2a20,    // burnt accent tiles
  wall:      0x474b52,    // plate-metal structure
  wallDark:  0x33363b,    // shadowed steel
  platform:  0x504036,    // rusted furnace platform top
  slag:      0x2c2e33,    // dark slag cover block
  beam:      0x24262a,    // structural beam
  accent:    0xff7a1a,    // molten-orange accent (emissive)
  lava:      0xff5410,    // glowing lava channel (emissive, non-colliding)
  jumpPad:   0xff9a3a,    // ember-orange pad
};

const SPAWN_Y = 0.5;
const PERIM = 42;          // perimeter wall distance from centre
const WALL_H = 8;          // perimeter wall height

// FFA spawns — four corners, set back from the structures (Cobalt-verified).
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
  // Hot, smoky interior; fog dissolves the perimeter into a furnace haze.
  world.scene.background = new THREE.Color(0x1a1310);
  world.scene.fog = new THREE.Fog(0x2a1c14, 60, 200);

  // Lighting — warm key (furnace glow) + dim ember fill so the lava reads bright.
  const hemi = new THREE.HemisphereLight(0xffd2a0, 0x2a1810, 0.6);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xffce96, 0.85);
  key.position.set(30, 70, 25);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0xff7a30, 0.35);
  fill.position.set(-40, 25, -25);
  world.addDecoration(fill);

  buildGround(world);
  buildLavaChannels(world);
  buildPerimeter(world);
  buildCentralPlatform(world);
  buildTeamDecks(world);
  buildCover(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 88, 1, 88, PALETTE.floor);
  // Scorched plate tiles in a sparse checker for visual rhythm.
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 2 !== 0) continue;
      addBox(world, x * 10, -0.49, z * 10, 3, 0.02, 3, PALETTE.floorTile, false);
    }
  }
}

/** Glowing lava channels — pure decoration (non-colliding), thin and just above
 *  the floor, running between the structures so the mill feels molten. */
function buildLavaChannels(world: World) {
  // Two long E-W channels flanking the central platform.
  for (const z of [10, -10]) {
    addBox(world, 0, -0.45, z, 30, 0.08, 1.4, PALETTE.lava, false, 0.95);
  }
  // Two short N-S channels feeding the team decks.
  for (const x of [16, -16]) {
    addBox(world, x, -0.45, 0, 1.4, 0.08, 24, PALETTE.lava, false, 0.95);
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Molten top-rail accents (non-colliding).
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 furnace platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Molten trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  // Central core pillar (top y=6) so the high ground isn't a death-box.
  addBox(world, 0, 4.5, 0, 3, 3, 3, PALETTE.beam);
  // Glowing core seam on the pillar (decoration).
  addBox(world, 0, 4.5, 1.55, 1.6, 1.6, 0.08, PALETTE.lava, false, 0.9);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addBox(world, sx, 3.6, sz, 1.6, 1.2, 1.6, PALETTE.slag);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Molten edge stripe (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.accent, false);
  }
}

function buildCover(world: World) {
  // Mid-field slag stacks (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addBox(world, cx, 1.1, cz, 2.4, 2.2, 2.4, PALETTE.slag);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable plate mounds near spawns for immediate peek cover (top y=0.5).
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
  glow = 0,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const isEmissive = color === PALETTE.accent || color === PALETTE.lava;
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: isEmissive ? color : 0x000000,
    emissiveIntensity: glow > 0 ? glow : (color === PALETTE.accent ? 0.8 : 0),
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
    emissive: 0x6a2a05,
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
    spawnFlashColor: 0xff9a3a,
  },
  build: buildFoundry,
};
