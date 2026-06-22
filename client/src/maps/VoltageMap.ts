/**
 * Voltage — a neon cyber arena: near-black panelled ground lit by a glowing
 * grid, magenta + cyan neon trim, and translucent light-pylon cover. The sixth
 * combat map and the darkest/flashiest one, for instant visual contrast with
 * warm Sandstone, rusty Industrial, steel Cobalt, dusk Overpass and icy
 * Frostline.
 *
 * Built on the proven symmetric Cobalt/Frostline skeleton — identical collidable
 * geometry coordinates, so every TDM side is fair and all spawns are
 * known-clear of solids (headless-verified). Only the theme + cover styling
 * change: ice blocks become emissive light-pylons, and the floor glows on a
 * neon grid. Verticality is entirely jump-pad driven (no mid-height ledges that
 * snag the 0.55 m auto-step).
 *
 * Dual-accent identity: magenta (warm neon) on the N half / E trim, cyan on the
 * S half / W trim, so the symmetric arena still reads with directional flair.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:     0x101218,    // near-black panel ground
  grid:      0x2bd4ff,    // glowing cyan grid line
  wall:      0x1b2030,    // dark panel structure
  wallDark:  0x121622,    // shadowed panel
  platform:  0x202840,    // raised platform top
  beam:      0x3a4566,    // structural beam
  magenta:   0xff3df0,    // magenta neon accent (emissive)
  cyan:      0x2bd4ff,     // cyan neon accent (emissive)
  jumpPad:   0x49f0c0,    // teal-green pad
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

export function buildVoltage(world: World) {
  // Deep-space backdrop; fog dissolves the perimeter into a dark neon haze.
  world.scene.background = new THREE.Color(0x070810);
  world.scene.fog = new THREE.Fog(0x070810, 65, 200);

  // Lighting — low cool ambient (it's a night arena) + magenta/cyan rim fills
  // so the neon does the heavy lifting.
  const hemi = new THREE.HemisphereLight(0x4a5878, 0x0a0c14, 0.7);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xbfd0ff, 0.45);
  key.position.set(25, 65, 20);
  world.addDecoration(key);
  const magentaFill = new THREE.DirectionalLight(0xff3df0, 0.22);
  magentaFill.position.set(30, 22, 40);
  world.addDecoration(magentaFill);
  const cyanFill = new THREE.DirectionalLight(0x2bd4ff, 0.22);
  cyanFill.position.set(-30, 22, -40);
  world.addDecoration(cyanFill);

  buildGround(world);
  buildPerimeter(world);
  buildCentralPlatform(world);
  buildTeamDecks(world);
  buildCover(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 88, 1, 88, PALETTE.floor);
  // Glowing neon grid — thin emissive lines every 12 m (decoration only).
  for (let i = -3; i <= 3; i++) {
    addBox(world, i * 12, -0.46, 0, 0.12, 0.04, 84, PALETTE.grid, false);
    addBox(world, 0, -0.46, i * 12, 84, 0.04, 0.12, PALETTE.grid, false);
  }
}

function buildPerimeter(world: World) {
  addBox(world, 0, WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, 0, WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.wall);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.wall);
  // Neon top-rails — magenta on N, cyan on S, split E/W (non-colliding flair).
  addBox(world, 0, WALL_H * 2 + 0.1,  PERIM, PERIM * 2, 0.25, 1.2, PALETTE.magenta, false);
  addBox(world, 0, WALL_H * 2 + 0.1, -PERIM, PERIM * 2, 0.25, 1.2, PALETTE.cyan, false);
  addBox(world,  PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.magenta, false);
  addBox(world, -PERIM, WALL_H * 2 + 0.1, 0, 1.2, 0.25, PERIM * 2, PALETTE.cyan, false);
}

function buildCentralPlatform(world: World) {
  // Raised 16×16 platform, top at y=3. Reached by the jump-pad ring.
  addBox(world, 0, 1.5, 0, 16, 3, 16, PALETTE.platform);
  // Neon trim around the platform top edge (magenta N/E, cyan S/W).
  addBox(world, 0, 3.05,  8, 16, 0.1, 0.4, PALETTE.magenta, false);
  addBox(world, 0, 3.05, -8, 16, 0.1, 0.4, PALETTE.cyan, false);
  addBox(world,  8, 3.05, 0, 0.4, 0.1, 16, PALETTE.magenta, false);
  addBox(world, -8, 3.05, 0, 0.4, 0.1, 16, PALETTE.cyan, false);
  // Central glowing reactor pylon (top y=6) so the high ground isn't a death-box.
  addPylon(world, 0, 4.5, 0, 3, 3, 3, PALETTE.cyan);
  // Four corner crouch-pylons on the platform for peeking cover.
  for (const [sx, sz] of [[5, 5], [-5, 5], [5, -5], [-5, -5]] as const) {
    addPylon(world, sx, 3.6, sz, 1.6, 1.2, 1.6, sz > 0 ? PALETTE.magenta : PALETTE.cyan);
  }
}

function buildTeamDecks(world: World) {
  // North + South raised decks (top y=3) — symmetric forward bases.
  for (const z of [28, -28]) {
    addBox(world, 0, 1.5, z, 18, 3, 8, PALETTE.wall);
    // Front parapet (faces centre) — waist-high cover on the deck.
    const front = z > 0 ? z - 3.6 : z + 3.6;
    addBox(world, 0, 3.6, front, 18, 1.2, 0.6, PALETTE.wallDark);
    // Neon edge stripe — magenta for N deck, cyan for S deck (decoration).
    addBox(world, 0, 3.05, front, 18, 0.1, 0.3, z > 0 ? PALETTE.magenta : PALETTE.cyan, false);
  }
}

function buildCover(world: World) {
  // Mid-field light-pylon stacks (tall cover) at the four diagonals.
  for (const [cx, cz] of [[13, 13], [-13, 13], [13, -13], [-13, -13]] as const) {
    addPylon(world, cx, 1.1, cz, 2.4, 2.2, 2.4, cz > 0 ? PALETTE.magenta : PALETTE.cyan);
  }

  // E/W flank walls — break the long cross-map sightlines without sealing lanes.
  for (const x of [22, -22]) {
    addBox(world, x, 1, 9, 1.4, 2, 7, PALETTE.wallDark);
    addBox(world, x, 1, -9, 1.4, 2, 7, PALETTE.wallDark);
  }

  // Low steppable conduit mounds near spawns for immediate peek cover (top y=0.5).
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
  const isNeon = color === PALETTE.magenta || color === PALETTE.cyan || color === PALETTE.grid;
  const mat = new THREE.MeshLambertMaterial({
    color, emissive: isNeon ? color : 0x000000,
    emissiveIntensity: isNeon ? 0.85 : 0, flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  if (collide) {
    world.addSolidBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), mesh);
  } else {
    world.addDecoration(mesh);
  }
}

/** Translucent emissive light-pylon — solid for collision + hitscan, but
 *  visually airy with a strong neon self-glow (the map's signature cover). */
function addPylon(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  neon: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: neon, emissive: neon, emissiveIntensity: 0.5,
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
    emissive: 0x0a6a4a,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const VOLTAGE_MAP: GameMap = {
  meta: {
    id: 'voltage',
    displayName: 'Voltage',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0xff6df0,
  },
  build: buildVoltage,
};
