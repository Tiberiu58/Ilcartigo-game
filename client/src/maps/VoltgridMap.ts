/**
 * Voltgrid — a neon-night / synthwave arena: near-black ground laced with a
 * glowing magenta grid, dark slate structures rimmed in electric cyan + magenta
 * neon. The seventh combat map and the most striking-looking one, for instant
 * visual contrast with warm Sandstone, rusty Industrial, steel Cobalt, dusk
 * Overpass and icy Frostline.
 *
 * It reuses the **proven symmetric Cobalt/Frostline skeleton** verbatim (same
 * spawn anchors, platform, decks, cover + jump-pad layout — all known-clear and
 * TDM-fair), then fully re-themes it: a black floor with an emissive neon grid,
 * dark structures with cyan/magenta trim, and translucent neon glass cover. No
 * geometry change means no spawn-clearance risk; the identity is pure palette +
 * lighting (a moody dark map with hot neon edges — the Krunker/Tron look).
 *
 * Verticality is entirely jump-pad driven (no mid-height ledges that snag the
 * 0.55 m auto-step). Cover is either low (steppable) or clearly tall.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x0c0c14,    // near-black night floor
  gridLine:  0xff2d8a,    // hot-magenta floor grid (emissive)
  wall:      0x1b2030,    // dark slate structure
  wallDark:  0x121622,    // shadowed slate
  platform:  0x171c2b,    // raised platform top
  glass:     0x2a3a6a,    // translucent neon glass cover
  cyan:      0x29f0ff,    // electric-cyan accent (emissive)
  magenta:   0xff3da6,    // neon-magenta accent (emissive)
  jumpPad:   0xff3da6,    // magenta pad
};
// Emissive accent colours (so the addBox emissive check covers both).
const ACCENTS = new Set([PALETTE.cyan, PALETTE.magenta, PALETTE.gridLine]);

const SPAWN_Y = 0.5;
const PERIM = 42;          // perimeter wall distance from centre
const WALL_H = 8;          // perimeter wall height

// FFA spawns — four corners, set back from the structures (skeleton-verified).
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

export function buildVoltgrid(world: World) {
  // Deep-night sky; fog dissolves the perimeter into a dark neon haze.
  world.scene.background = new THREE.Color(0x07070e);
  world.scene.fog = new THREE.Fog(0x07070e, 60, 200);

  // Lighting — low moody ambient + a cool key, so the emissive neon pops.
  const hemi = new THREE.HemisphereLight(0x3a4a8a, 0x0a0a14, 0.55);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xbfd0ff, 0.5);
  key.position.set(30, 70, 25);
  world.addDecoration(key);
  const fill = new THREE.DirectionalLight(0xff3da6, 0.22);
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
  // Emissive neon grid — thin magenta lines every 12 m (decoration only).
  for (let i = -3; i <= 3; i++) {
    addBox(world, i * 12, -0.46, 0, 0.18, 0.02, 84, PALETTE.gridLine, false);
    addBox(world, 0, -0.46, i * 12, 84, 0.02, 0.18, PALETTE.gridLine, false);
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Neon top-rail accents (non-colliding) — cyan N/S, magenta E/W for contrast.
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.cyan, false);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.cyan, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.magenta, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.magenta, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Neon trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.cyan, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.cyan, false);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.cyan, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.cyan, false);
  // Central neon-glass pillar (top y=6) so the high ground isn't a death-box.
  addGlassBlock(world, 0, 4.5, 0, 3, 3, 3);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addGlassBlock(world, sx, 3.6, sz, 1.6, 1.2, 1.6);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Neon edge stripe (decoration) — magenta so the deck reads as "home".
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, PALETTE.magenta, false);
  }
}

function buildCover(world: World) {
  // Mid-field neon-glass stacks (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addGlassBlock(world, cx, 1.1, cz, 2.4, 2.2, 2.4);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable blocks near spawns for immediate peek cover (top y=0.5).
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
  const isAccent = ACCENTS.has(color);
  const mat = new THREE.MeshLambertMaterial({
    color, emissive: isAccent ? color : 0x000000,
    emissiveIntensity: isAccent ? 0.85 : 0, flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  if (collide) {
    world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
  } else {
    world.addDecoration(mesh);
  }
}

/** Translucent neon-glass cover block — solid for collision + hitscan, but
 *  visually airy with a faint cyan self-glow. */
function addGlassBlock(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.glass, emissive: 0x1c5a82, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.72, flatShading: true,
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
    emissive: 0x7a1050,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const VOLTGRID_MAP: GameMap = {
  meta: {
    id: 'voltgrid',
    displayName: 'Voltgrid',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xff5ac0,
  },
  build: buildVoltgrid,
};
