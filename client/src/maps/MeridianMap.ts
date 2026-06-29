/**
 * Meridian — a sunlit white-marble & gold coliseum. The seventh combat map and
 * the brightest, cleanest-looking one: warm marble ground, sandy-stone
 * structures, gold neon trim under a midday sun — instant contrast with warm
 * Sandstone, rusty Industrial, steel Cobalt, dusk Overpass, frozen Frostline and
 * molten Foundry.
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable) — built on the proven
 * symmetric Cobalt/Frostline skeleton (every TDM side is fair and all spawns sit
 * clear of solids), re-themed marble + gold with opaque stone column cover:
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │  column          jump pads        column         │
 *      │         ┌──── marble platform ────┐              │
 *      │  W wall │  pillar + corner cover  │  E wall      │
 *      │         └──────────────────────────┘             │
 *      │  column          jump pads        column         │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is entirely jump-pad driven (no mid-height ledges that snag the
 * 0.55 m auto-step). Cover is either low (steppable marble kerbs) or clearly tall
 * (stone columns / cover walls).
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0xe8e2d2,    // warm marble ground
  floorTile: 0xd6cdb4,    // sandstone accent tiles
  wall:      0xcfc6ad,    // sandy-marble structure
  wallDark:  0x9a8f70,    // shadowed stone
  platform:  0xddd3bb,    // marble platform top
  column:    0xeae3cf,    // stone column cover
  beam:      0x8a7d55,    // warm structural beam
  accent:    0xffd35a,    // gold accent (emissive)
  jumpPad:   0xffcf4d,    // gold pad
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

export function buildMeridian(world: World) {
  // Warm hazy sky; fog dissolves the perimeter into a sunlit haze.
  world.scene.background = new THREE.Color(0xf2ead6);
  world.scene.fog = new THREE.Fog(0xf2ead6, 75, 220);

  // Lighting — strong warm midday key + soft sky fill (the marble glow).
  const hemi = new THREE.HemisphereLight(0xfff6e0, 0xb8ac8c, 0.95);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xfff2d8, 0.95);
  key.position.set(35, 80, 20);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0xffe6b0, 0.28);
  fill.position.set(-40, 30, -25);
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
  // Sandstone accent tiles in a sparse checker for visual rhythm.
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
  // Gold top-rail accents (non-colliding).
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 marble platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Gold trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  // Central stone pillar (top y=6) so the high ground isn't a death-box.
  addColumn(world, 0, 4.5, 0, 3, 3, 3);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addColumn(world, sx, 3.6, sz, 1.6, 1.2, 1.6);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Gold edge stripe (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.accent, false);
  }
}

function buildCover(world: World) {
  // Mid-field stone columns (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addColumn(world, cx, 1.1, cz, 2.4, 2.2, 2.4);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable marble kerbs near spawns for immediate peek cover (top y=0.5).
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

/** Opaque marble column cover — solid for collision + hitscan, with a faint warm
 *  self-glow so it reads as polished stone. */
function addColumn(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.column, emissive: 0x4a4228, emissiveIntensity: 0.15, flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
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
    emissive: 0x6a4a0a,
    emissiveIntensity: 0.55,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const MERIDIAN_MAP: GameMap = {
  meta: {
    id: 'meridian',
    displayName: 'Meridian',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xffe08a,
  },
  build: buildMeridian,
};
