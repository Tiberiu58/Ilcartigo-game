/**
 * Foundry — a compact, 4-fold-symmetric industrial arena built around a single
 * raised central BUNKER (the "crucible"). Its identity is vertical: the rooftop
 * is the dominant high ground, reachable only by the four jump pads at the
 * bunker's faces, so fights orbit the question "who holds the roof?" — a
 * different rhythm from Sandstone's open plaza and Industrial's CQB warehouse.
 *
 * Layout (top-down, ~72 × 72m playable):
 *
 *     ┌─────────────────────────────────────┐
 *     │  ◍ spawn        N buttress      ◍   │   ◍ = corner spawn + crate
 *     │           ┌──── pad ────┐            │
 *     │   crate   │   BUNKER    │   crate    │   BUNKER roof = high ground
 *     │ W butt.  pad   (roof)  pad  E butt.  │
 *     │   crate   │   y = 6     │   crate    │
 *     │           └──── pad ────┘            │
 *     │  ◍           S buttress         ◍   │
 *     └─────────────────────────────────────┘
 *
 * Cover layers: the central bunker blocks the long diagonals; four buttress
 * walls break the mid-edge sightlines; eight crates give peek cover near the
 * spawns and on the diagonals. Symmetric, so no spawn is advantaged.
 *
 * Palette: cold steel floor, rusted ferric walls, molten-orange accents +
 * jump pads. IMPORTANT: every collide=true box here is mirrored numerically in
 * MapCollision.ts (client + server) as FOUNDRY_COLLISION — keep them in lockstep.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  floor:      0x3a3f47,   // cold steel deck
  floorTile:  0x2b2f35,   // darker accent tile
  wall:       0x4a4038,   // rusted ferric wall
  wallDark:   0x2e2823,   // shadowed wall variant
  metal:      0x55606b,   // structural steel
  bunker:     0x404852,   // central bunker mass
  bunkerTrim: 0x222831,   // bunker edge trim
  molten:     0xff7a2a,   // molten-orange accent
  jumpPad:    0xffaa14,
};

const SPAWN_Y = 0.5;

// FFA spawns — four corners, set back behind the corner crates. Mirrored in the
// server's SPAWNS_BY_MAP.foundry.
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3( 30, SPAWN_Y,  30),
  new THREE.Vector3(-30, SPAWN_Y,  30),
  new THREE.Vector3( 30, SPAWN_Y, -30),
  new THREE.Vector3(-30, SPAWN_Y, -30),
];

// TDM pair — N team vs S team (kept for future TDM; harmless now).
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, SPAWN_Y,  30),
  new THREE.Vector3(0, SPAWN_Y, -30),
];

export function buildFoundry(world: World) {
  // Cold industrial sky + matching fog so the steel arena feels enclosed.
  world.scene.background = new THREE.Color(0x1a1e24);
  world.scene.fog = new THREE.Fog(0x1a1e24, 45, 160);

  // Lighting — cool overhead key + a warm molten fill from below-ish so the
  // flat-shaded undersides pick up the foundry glow.
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x402a18, 0.7);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xdce8ff, 0.9);
  key.position.set(-30, 65, 20);
  world.addDecoration(key);
  const moltenFill = new THREE.PointLight(0xff7a2a, 0.6, 60, 1.6);
  moltenFill.position.set(0, 7.5, 0);     // glow off the central bunker roof
  world.addDecoration(moltenFill);

  buildGround(world);
  buildPerimeter(world);
  buildBunker(world);
  buildButtresses(world);
  buildCrates(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  // Steel deck — top at y=0, spans ±40.
  addBox(world, 0, -0.5, 0, 80, 1, 80, PALETTE.floor);
  // Accent floor tiles in a sparse grid for visual rhythm (non-collision).
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if ((x + z) % 2 !== 0) continue;
      addBox(world, x * 10, -0.49, z * 10, 3, 0.02, 3, PALETTE.floorTile, false);
    }
  }
}

function buildPerimeter(world: World) {
  // 8m boundary walls, 1m thick, 36 from center.
  const P = 36, H = 4;
  addBox(world, 0,  H, -P, P * 2, H * 2, 1, PALETTE.wall);
  addBox(world, 0,  H,  P, P * 2, H * 2, 1, PALETTE.wall);
  addBox(world, -P, H,  0, 1, H * 2, P * 2, PALETTE.wall);
  addBox(world,  P, H,  0, 1, H * 2, P * 2, PALETTE.wall);
  // Top molten trim (visual only).
  addBox(world, 0, H * 2 + 0.2, -P, P * 2, 0.3, 1.2, PALETTE.molten, false);
  addBox(world, 0, H * 2 + 0.2,  P, P * 2, 0.3, 1.2, PALETTE.molten, false);
  addBox(world, -P, H * 2 + 0.2, 0, 1.2, 0.3, P * 2, PALETTE.molten, false);
  addBox(world,  P, H * 2 + 0.2, 0, 1.2, 0.3, P * 2, PALETTE.molten, false);
}

function buildBunker(world: World) {
  // Central raised bunker — a 20×6×20 mass; its roof (y=6) is the map's prime
  // high ground. Collidable so players stand on the roof + take cover behind it.
  addBox(world, 0, 3, 0, 20, 6, 20, PALETTE.bunker);
  // Edge trim band (visual) + a molten core stripe up each face.
  addBox(world, 0, 6.05, 0, 20.6, 0.4, 20.6, PALETTE.bunkerTrim, false);
  addBox(world, 0, 3, 10.05, 2.0, 5, 0.1, PALETTE.molten, false);
  addBox(world, 0, 3, -10.05, 2.0, 5, 0.1, PALETTE.molten, false);
  addBox(world, 10.05, 3, 0, 0.1, 5, 2.0, PALETTE.molten, false);
  addBox(world, -10.05, 3, 0, 0.1, 5, 2.0, PALETTE.molten, false);
  // Roof rim posts (visual) at the four roof corners.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    addBox(world, sx * 9.2, 6.5, sz * 9.2, 0.4, 1, 0.4, PALETTE.metal, false);
  }
}

function buildButtresses(world: World) {
  // Four mid-edge cover walls (2.5m tall) that break the cardinal sightlines
  // between the central bunker and the perimeter. Placed at ±24 (clear of the
  // shared bot spawn at (0,-22)).
  buttress(world, 0, 24, 10, 1.5);     // N
  buttress(world, 0, -24, 10, 1.5);    // S
  buttress(world, 24, 0, 1.5, 10);     // E
  buttress(world, -24, 0, 1.5, 10);    // W
}

function buttress(world: World, cx: number, cz: number, sx: number, sz: number) {
  addBox(world, cx, 1.25, cz, sx, 2.5, sz, PALETTE.wallDark);
  addBox(world, cx, 2.6, cz, sx + 0.3, 0.3, sz + 0.3, PALETTE.molten, false);   // cap glow
}

function buildCrates(world: World) {
  // Peek cover: four near the corner spawns + four on the inner diagonals.
  const crate = (cx: number, cz: number) =>
    addBox(world, cx, 0.7, cz, 1.4, 1.4, 1.4, PALETTE.metal);
  crate(26, 26); crate(-26, 26); crate(26, -26); crate(-26, -26);
  crate(14, 14); crate(-14, 14); crate(14, -14); crate(-14, -14);
}

function buildJumpPads(world: World) {
  // One pad just off each bunker face — launches a ground player up onto the
  // y=6 roof (boost tuned above Sandstone's 17→y5 to clear the 6m lip).
  const B = 19;
  addJumpPad(world, 0, 0.1, 12.5, 2.4, 0.2, 2.4, B);    // N face
  addJumpPad(world, 0, 0.1, -12.5, 2.4, 0.2, 2.4, B);   // S face
  addJumpPad(world, 12.5, 0.1, 0, 2.4, 0.2, 2.4, B);    // E face
  addJumpPad(world, -12.5, 0.1, 0, 2.4, 0.2, 2.4, B);   // W face
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
    emissive: 0x6a4500,
    emissiveIntensity: 0.5,
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
    spawnFlashColor: 0xff7a2a,
  },
  build: buildFoundry,
};
