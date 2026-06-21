/**
 * Overpass — an urban dusk arena built around verticality.
 *
 * Layout (top-down, +Z north, ~76 × 76 m playable):
 *
 *        +Z ───────── north lane (containers, cover) ───────── +Z
 *        ┌──────────────────────────────────────────────────┐
 *        │  NW deck                                  NE deck │
 *        │        ╔══════════ THE OVERPASS ══════════╗       │  ← elevated bridge
 *        │  ▣pad  ║  raised E-W deck · sniper lane    ║  pad▣ │     (top y = 5)
 *        │        ╚══════════════════════════════════╝       │
 *        │  SW deck            containers            SE deck │
 *        └──────────────────────────────────────────────────┘
 *        -Z ───────── south lane (containers, cover) ───────── -Z
 *
 * Three layers of play:
 *   - THE OVERPASS (centre, y=5): a long E-W deck — the dominant sightline.
 *     Reached by jump pads at each end; railings let you peek without falling.
 *   - GROUND LANES (north & south, y=0): close-quarters cover fights between
 *     shipping containers, flanking *under* the bridge between the two lanes.
 *   - CORNER DECKS (y=3): four raised pads at the corners — mid-height perches
 *     that watch the lanes, reached by their own jump pads.
 *
 * Falling off the bridge just drops you to ground level (fully enclosed, no
 * void) — vertical risk without a death penalty, so the bridge stays inviting.
 *
 * Palette: cool concrete + steel, teal accents, sodium-orange jump pads, dusk
 * blue sky. Solo-selectable (combat / Gun Game / Onslaught). MP runs Sandstone
 * by default — adding Overpass online just needs its AABBs in server collision.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

const PALETTE = {
  ground:    0x3b4250,    // wet asphalt
  groundTile:0x2f343f,    // darker road markings band
  concrete:  0x8a8f98,    // pillars / decks
  concreteD: 0x5d626c,    // shadowed concrete
  steel:     0x6f7a86,    // bridge deck steel
  steelD:    0x474f59,
  rail:      0x2b3038,    // dark guard rails
  teal:      0x2fb6a8,    // accent trim
  container1:0xb5533a,    // rust-red container
  container2:0x2f6e8f,    // teal container
  container3:0xc9a23a,    // ochre container
  jumpPad:   0xf5963a,    // sodium orange
};

const SPAWN_Y = 0.5;
const PERIM = 38;
const WALL_H = 8;
const BRIDGE_TOP = 5;     // y of the overpass walking surface

// FFA spawns — clear of the corner decks (footprint x,z ∈ 24..32), the lane
// containers, the bridge pillars, and the perimeter walls. Tucked along the
// east/west edges + the two lane ends.
const FFA_SPAWNS: THREE.Vector3[] = [
  new THREE.Vector3( 33, SPAWN_Y,  13),
  new THREE.Vector3(-33, SPAWN_Y,  13),
  new THREE.Vector3( 33, SPAWN_Y, -13),
  new THREE.Vector3(-33, SPAWN_Y, -13),
  new THREE.Vector3(  0, SPAWN_Y,  31),
  new THREE.Vector3(  0, SPAWN_Y, -31),
];

// TDM pair — north lane vs south lane.
const TDM_TEAM_SPAWNS: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, SPAWN_Y,  32),
  new THREE.Vector3(0, SPAWN_Y, -32),
];

export function buildOverpass(world: World) {
  // Dusk sky — deep blue, fog matched so the perimeter dissolves into haze.
  world.scene.background = new THREE.Color(0x1d2733);
  world.scene.fog = new THREE.Fog(0x1d2733, 45, 165);

  // Cool overhead fill + a low warm key light raking across the decks.
  const hemi = new THREE.HemisphereLight(0x9fb6cc, 0x2a3038, 0.75);
  world.addDecoration(hemi);
  const key = new THREE.DirectionalLight(0xffd2a0, 0.9);
  key.position.set(-40, 55, 30);
  world.addDecoration(key);
  // Subtle teal rim light from the opposite side for that night-city feel.
  const rim = new THREE.DirectionalLight(0x3fd0c0, 0.35);
  rim.position.set(45, 25, -35);
  world.addDecoration(rim);

  buildGround(world);
  buildPerimeter(world);
  buildOverpassDeck(world);
  buildBridgeStairs(world);
  buildCornerDecks(world);
  buildContainers(world);
  buildJumpPads(world);
}

function buildGround(world: World) {
  addBox(world, 0, -0.5, 0, 84, 1, 84, PALETTE.ground);
  // Lane road markings — long dark bands running N-S either side of centre.
  addBox(world, -16, -0.49, 0, 3, 0.02, 70, PALETTE.groundTile, false);
  addBox(world,  16, -0.49, 0, 3, 0.02, 70, PALETTE.groundTile, false);
  // Teal centre stripe under the overpass.
  addBox(world, 0, -0.49, 0, 1.2, 0.02, 70, PALETTE.teal, false);
}

function buildPerimeter(world: World) {
  addBox(world, 0,      WALL_H, -PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.concreteD);
  addBox(world, 0,      WALL_H,  PERIM, PERIM * 2, WALL_H * 2, 1, PALETTE.concreteD);
  addBox(world, -PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.concreteD);
  addBox(world,  PERIM, WALL_H, 0, 1, WALL_H * 2, PERIM * 2, PALETTE.concreteD);
  // Teal accent trim along the wall tops.
  const t = WALL_H * 2 + 0.15;
  addBox(world, 0, t, -PERIM, PERIM * 2, 0.3, 1.2, PALETTE.teal, false);
  addBox(world, 0, t,  PERIM, PERIM * 2, 0.3, 1.2, PALETTE.teal, false);
  addBox(world, -PERIM, t, 0, 1.2, 0.3, PERIM * 2, PALETTE.teal, false);
  addBox(world,  PERIM, t, 0, 1.2, 0.3, PERIM * 2, PALETTE.teal, false);
}

function buildOverpassDeck(world: World) {
  // The raised E-W deck — the headline sightline. Top surface at y=BRIDGE_TOP.
  const deckThick = 1;
  const deckY = BRIDGE_TOP - deckThick / 2;        // centre of the slab
  addBox(world, 0, deckY, 0, 64, deckThick, 10, PALETTE.steel);
  // A raised median strip down the deck centre — break line-of-sight a little
  // so it isn't a pure no-cover catwalk (you can crouch-peek either side).
  addBox(world, 0, BRIDGE_TOP + 0.6, 0, 64, 1.2, 1.2, PALETTE.steelD);

  // Support pillars from ground to deck underside.
  const pillarTop = BRIDGE_TOP - deckThick;        // underside of slab
  for (const px of [-26, -13, 13, 26]) {
    for (const pz of [-4, 4]) {
      addBox(world, px, pillarTop / 2, pz, 1.4, pillarTop, 1.4, PALETTE.concrete);
    }
  }

  // Guard rails along both long edges (decorative — low enough to vault, high
  // enough to read as an edge). Non-colliding so movement stays fluid.
  for (const rz of [-5, 5]) {
    addBox(world, 0, BRIDGE_TOP + 0.5, rz, 64, 1.0, 0.18, PALETTE.rail, false);
  }
  // End caps so the deck reads as a structure, not a floating slab.
  addBox(world, -32, BRIDGE_TOP + 0.4, 0, 0.4, 1.4, 10, PALETTE.rail, false);
  addBox(world,  32, BRIDGE_TOP + 0.4, 0, 0.4, 1.4, 10, PALETTE.rail, false);
}

function buildBridgeStairs(world: World) {
  // A staircase at each end rises from ground to the overpass surface (y=5),
  // landing on the deck. Reliable, deterministic access (no air-control needed),
  // and reads as the bridge's on-ramps. Treads are < STEP_HEIGHT so the
  // controller's auto-step climbs them smoothly.
  buildStairs(world, new THREE.Vector3( 36, 0, 0), new THREE.Vector3( 30, 0, 0), BRIDGE_TOP, PALETTE.steel);
  buildStairs(world, new THREE.Vector3(-36, 0, 0), new THREE.Vector3(-30, 0, 0), BRIDGE_TOP, PALETTE.steel);
}

/**
 * Flight of stairs from `from` toward `to`, rising `totalRise`. Treads are
 * 0.35 m (< the controller's 0.55 m auto-step) and each is solid from the base
 * up, so the stair reads as a mass from the side. Ported from IndustrialMap.
 */
function buildStairs(world: World, from: THREE.Vector3, to: THREE.Vector3, totalRise: number, color: number) {
  const TREAD_RISE = 0.35;
  const steps = Math.ceil(totalRise / TREAD_RISE);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const runLen = Math.hypot(dx, dz);
  if (runLen < 0.01) return;
  const dirX = dx / runLen;
  const dirZ = dz / runLen;
  const treadDepth = runLen / steps;
  const sideWidth = 2.6;
  const perpX = -dirZ;
  const perpZ = dirX;
  const baseY = from.y;

  // Side rails — waist-high, non-colliding (visual edge).
  const actualRise = TREAD_RISE * steps;
  const railH = 1.0;
  const railY = baseY + actualRise / 2 + railH / 2;
  const railLen = runLen + 0.5;
  for (const sgn of [1, -1]) {
    addBox(
      world,
      from.x + dx / 2 + sgn * perpX * sideWidth / 2, railY, from.z + dz / 2 + sgn * perpZ * sideWidth / 2,
      Math.abs(dirX) * railLen + Math.abs(perpX) * 0.2,
      railH,
      Math.abs(dirZ) * railLen + Math.abs(perpZ) * 0.2,
      PALETTE.rail, false,
    );
  }

  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * TREAD_RISE;
    const cx = from.x + dirX * (treadDepth * (i + 0.5));
    const cz = from.z + dirZ * (treadDepth * (i + 0.5));
    const sx = Math.abs(dirX) * treadDepth + Math.abs(perpX) * sideWidth;
    const sz = Math.abs(dirZ) * treadDepth + Math.abs(perpZ) * sideWidth;
    addBox(world, cx, baseY + y / 2, cz, sx, y, sz, i % 2 === 0 ? color : PALETTE.steelD);
  }
}

function buildCornerDecks(world: World) {
  // Four mid-height perches (top y=3) in the corners. Solid blocks you can
  // stand on; reached by their own jump pads. 8×8 footprint.
  const deck = (cx: number, cz: number) => {
    addBox(world, cx, 1.5, cz, 8, 3, 8, PALETTE.concreteD);
    // A low parapet on the inward-facing two edges for cover.
    const sx = Math.sign(cx), sz = Math.sign(cz);
    addBox(world, cx - sx * 3.8, 3.4, cz, 0.4, 0.8, 8, PALETTE.concrete, false);
    addBox(world, cx, 3.4, cz - sz * 3.8, 8, 0.8, 0.4, PALETTE.concrete, false);
  };
  deck( 28,  28);
  deck(-28,  28);
  deck( 28, -28);
  deck(-28, -28);
}

function buildContainers(world: World) {
  // Shipping containers in the two ground lanes — close-quarters cover + a few
  // stacks you can climb (step-up). Sizes ~ 6 × 2.6 × 2.6.
  const container = (cx: number, cy: number, cz: number, color: number, long: 'x' | 'z' = 'x') => {
    const sx = long === 'x' ? 6 : 2.6;
    const sz = long === 'x' ? 2.6 : 6;
    addBox(world, cx, cy, cz, sx, 2.6, sz, color);
  };

  // North lane (z ≈ +20).
  container( -8, 1.3,  20, PALETTE.container1, 'x');
  container( -8, 3.9,  20, PALETTE.container2, 'x');     // stacked
  container(  8, 1.3,  18, PALETTE.container3, 'z');
  container( 20, 1.3,  22, PALETTE.container2, 'x');
  container(-22, 1.3,  16, PALETTE.container3, 'x');

  // South lane (z ≈ -20).
  container(  8, 1.3, -20, PALETTE.container2, 'x');
  container(  8, 3.9, -20, PALETTE.container1, 'x');      // stacked
  container( -8, 1.3, -18, PALETTE.container3, 'z');
  container(-20, 1.3, -22, PALETTE.container1, 'x');
  container( 22, 1.3, -16, PALETTE.container2, 'x');

  // Two low crates beside the central under-bridge passage (mid cover).
  addBox(world,  10, 0.8, 0, 1.6, 1.6, 1.6, PALETTE.concrete);
  addBox(world, -10, 0.8, 0, 1.6, 1.6, 1.6, PALETTE.concrete);
}

function buildJumpPads(world: World) {
  // Corner-deck pads — just OUTSIDE each corner deck (footprint 24..32), open
  // sky above, launching players up onto the y=3 perches with their run-up
  // momentum carrying them over the edge.
  addJumpPad(world,  21, 0.1,  21, 2.2, 0.2, 2.2, 14);
  addJumpPad(world, -21, 0.1,  21, 2.2, 0.2, 2.2, 14);
  addJumpPad(world,  21, 0.1, -21, 2.2, 0.2, 2.2, 14);
  addJumpPad(world, -21, 0.1, -21, 2.2, 0.2, 2.2, 14);
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
    emissive: 0x5a2c00,
    emissiveIntensity: 0.5,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

export const OVERPASS_MAP: GameMap = {
  meta: {
    id: 'overpass',
    displayName: 'Overpass',
    ffaSpawns: FFA_SPAWNS,
    teamSpawns: TDM_TEAM_SPAWNS,
    spawnFlashColor: 0x3fd0c0,
  },
  build: buildOverpass,
};
