/**
 * Frostline — a frozen tundra arena: snow-white ground, pale-ice structures,
 * aurora-cyan neon. The fifth combat map and the coldest-looking one, for instant
 * visual contrast with warm Sandstone, rusty Industrial, steel Cobalt and dusk
 * Overpass.
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable) — built on the proven
 * symmetric Cobalt skeleton (so every TDM side is fair and all spawns sit clear
 * of solids), then re-themed and re-covered with its own identity:
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │  ice block       jump pads        ice block      │
 *      │         ┌──── frozen platform ────┐              │
 *      │  W wall │  pillar + corner cover  │  E wall      │
 *      │         └──────────────────────────┘             │
 *      │  ice block       jump pads        ice block      │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is entirely jump-pad driven (no mid-height ledges that snag the
 * 0.55 m auto-step). Cover is either low (steppable snow mounds) or clearly tall
 * (ice blocks / cover walls). Translucent ice blocks read as cover but feel airy.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0xdfe9f2,    // packed-snow ground
  floorTile: 0xc6d8ea,    // pale ice accent tiles
  wall:      0xaec6dc,    // frosted ice-blue structure
  wallDark:  0x7e9bb8,    // shadowed ice
  platform:  0xb9d0e4,    // frozen platform top
  iceBlock:  0x9fd4e8,    // translucent ice cover block
  beam:      0x5a7088,    // cold structural beam
  accent:    0x6ef0ff,    // aurora-cyan accent (emissive)
  jumpPad:   0x66e0ff,    // cyan pad
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

export function buildFrostline(world: World) {
  // Pale arctic sky; fog dissolves the perimeter into an icy haze.
  world.scene.background = new THREE.Color(0xcfe2f0);
  world.scene.fog = new THREE.Fog(0xcfe2f0, 70, 210);

  // Lighting — bright cold key (snow glare) + soft cyan fill.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb6cc, 0.95);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(30, 70, 25);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0x88d8ff, 0.3);
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
  // Pale ice tiles in a sparse checker for visual rhythm.
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
  // Aurora top-rail accents (non-colliding).
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.accent, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.accent, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 frozen platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Aurora trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.accent, false);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.accent, false);
  // Central ice pillar (top y=6) so the high ground isn't a death-box.
  addIceBlock(world, 0, 4.5, 0, 3, 3, 3);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addIceBlock(world, sx, 3.6, sz, 1.6, 1.2, 1.6);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Aurora edge stripe (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.accent, false);
  }
}

function buildCover(world: World) {
  // Mid-field ice-block stacks (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addIceBlock(world, cx, 1.1, cz, 2.4, 2.2, 2.4);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable snow mounds near spawns for immediate peek cover (top y=0.5).
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

/** Translucent ice cover block — solid for collision + hitscan, but visually
 *  airy with a faint aurora self-glow. */
function addIceBlock(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.iceBlock, emissive: 0x1c6a82, emissiveIntensity: 0.25,
    transparent: true, opacity: 0.8, flatShading: true,
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
    emissive: 0x0a4a6a,
    emissiveIntensity: 0.55,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const FROSTLINE_MAP: GameMap = {
  meta: {
    id: 'frostline',
    displayName: 'Frostline',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0x9fe8ff,
  },
  build: buildFrostline,
};
