/**
 * Neon District — a cyberpunk night arena: near-black streets, glowing grid
 * lines, magenta + cyan neon trim and holographic cover. The sixth combat map
 * and the darkest/flashiest one, for instant contrast with warm Sandstone,
 * rusty Industrial, steel Cobalt, dusk Overpass and icy Frostline.
 *
 * Built on the proven symmetric Cobalt/Frostline skeleton (so every TDM side is
 * fair and all spawns sit clear of solids — verified headlessly), then fully
 * re-themed: a dark reflective ground laced with neon grid lines, holographic
 * translucent cover panels (magenta), and emissive neon trim everywhere.
 *
 * Layout (top-down, +Z north, ~84 × 84 m playable):
 *
 *      ┌───────────── N team deck (raised) ─────────────┐
 *      │  holo panel      jump pads       holo panel      │
 *      │         ┌──── raised platform ────┐              │
 *      │  W wall │  pillar + corner cover  │  E wall      │
 *      │         └──────────────────────────┘             │
 *      │  holo panel      jump pads       holo panel      │
 *      └───────────── S team deck (raised) ─────────────┘
 *
 * Verticality is entirely jump-pad driven (no mid-height ledges that snag the
 * 0.55 m auto-step). Cover is either low (steppable kerbs) or clearly tall
 * (holo panels / cover walls).
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x0e1018,    // near-black street
  grid:      0x1b3a6e,    // dim neon grid lines (emissive)
  wall:      0x1a2030,    // dark structure
  wallDark:  0x121622,    // shadowed structure
  platform:  0x161c2a,    // raised platform top
  holo:      0xff3ad0,    // holographic magenta cover panel
  beamCyan:  0x2bd0ff,    // cyan accent (emissive)
  beamMag:   0xff3ad0,    // magenta accent (emissive)
  jumpPad:   0x2bd0ff,    // cyan pad
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

export function buildNeon(world: World) {
  // Deep-night sky; neon haze fog dissolves the perimeter into a city glow.
  world.scene.background = new THREE.Color(0x05060c);
  world.scene.fog = new THREE.Fog(0x0a0820, 60, 200);

  // Lighting — low moody ambient + a cool key + a magenta rim so the neon pops.
  const hemi = new THREE.HemisphereLight(0x4a5a8a, 0x0a0a14, 0.6);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xbfd8ff, 0.55);
  key.position.set(28, 66, 22);
  world.addDecoration(key);
  const rim = new THREE.DirectionalLight(0xff3ad0, 0.28);
  rim.position.set(-38, 24, -28);
  world.addDecoration(rim);

  buildGround(world);
  buildPerimeter(world);
  buildCentralPlatform(world);
  buildTeamDecks(world);
  buildCover(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 88, 1, 88, PALETTE.floor);
  // Glowing neon grid lines across the street (decoration, non-colliding).
  for (let i = -4; i <= 4; i++) {
    addBox(world, i * 10, -0.47, 0, 0.16, 0.02, 84, PALETTE.grid, false, 0.7);
    addBox(world, 0, -0.47, i * 10, 84, 0.02, 0.16, PALETTE.grid, false, 0.7);
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Alternating cyan/magenta top-rail accents (non-colliding) — city skyline.
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.beamCyan, false, 0.9);
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.beamMag, false, 0.9);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.beamMag, false, 0.9);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.beamCyan, false, 0.9);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Cyan trim around the platform top edge (decoration).
  addBox(world, 0, 3.05, 8, 16, 0.1, 0.4, PALETTE.beamCyan, false, 0.9);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.beamCyan, false, 0.9);
  addBox(world, 8, 3.05, 0, 0.4, 0.1, 16, PALETTE.beamCyan, false, 0.9);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.beamCyan, false, 0.9);
  // Central neon pillar (top y=6) so the high ground isn't a death-box.
  addHoloPanel(world, 0, 4.5, 0, 3, 3, 3);
  // Four corner crouch-blocks on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addHoloPanel(world, sx, 3.6, sz, 1.6, 1.2, 1.6);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Neon edge stripe (decoration) — magenta N, cyan S for side identity.
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, z > 0 ? PALETTE.beamMag : PALETTE.beamCyan, false, 0.9);
  }
}

function buildCover(world: World) {
  // Mid-field holo-panel stacks (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addHoloPanel(world, cx, 1.1, cz, 2.4, 2.2, 2.4);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable kerbs near spawns for immediate peek cover (top y=0.5).
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

const EMISSIVE_COLORS = new Set<number>([PALETTE.grid, PALETTE.beamCyan, PALETTE.beamMag]);

function addBox(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: number,
  collide = true,
  emissiveIntensity = 0,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const isNeon = EMISSIVE_COLORS.has(color);
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: isNeon ? color : 0x000000,
    emissiveIntensity: isNeon ? (emissiveIntensity || 0.8) : 0,
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

/** Holographic magenta cover panel — solid for collision + hitscan, but
 *  visually airy with a strong neon self-glow. */
function addHoloPanel(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.holo, emissive: 0xff1ab0, emissiveIntensity: 0.45,
    transparent: true, opacity: 0.5, flatShading: true,
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
    emissiveIntensity: 0.7,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const NEON_MAP: GameMap = {
  meta: {
    id: 'neon',
    displayName: 'Neon District',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xff7ae0,
  },
  build: buildNeon,
};
