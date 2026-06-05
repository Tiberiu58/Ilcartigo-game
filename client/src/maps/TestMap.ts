/**
 * TestMap — Phase 1 sandbox: ground plane, walls, ramps, platforms, jump pads.
 *
 * Built purely from BoxGeometry primitives with flat-shaded MeshLambert materials.
 * Ramps are visually rendered as tilted boxes but collision-wise we approximate
 * them with a series of stepped boxes — fine for Phase 1 and avoids needing a
 * triangle-sweep collider.
 */

import * as THREE from 'three';
import { World } from '../core/World';
import type { GameMap } from './Map';

// Palette — vibrant, low-saturation-darks for contrast against player/enemy.
const PALETTE = {
  ground: 0x4a6b3a,
  groundAccent: 0x3d5a30,
  wall: 0xc7b89a,
  wallDark: 0x9f9374,
  ramp: 0xd97a3a,
  platform: 0x5b7faf,
  jumpPad: 0xf5d442,
  pillar: 0x6d5c4c,
  labFloor: 0x303a4a,             // dark blue-gray, distinct from combat ground
  labAccent: 0x4ac8a8,             // cyan markers / signage
  labStripe: 0x6cc6ff,
};

/** Player spawn for combat mode (FFA test spawn). Feet position. */
export const COMBAT_SPAWN = new THREE.Vector3(0, 0.5, 12);
/** Player spawn for practice mode — inside the physics lab. */
export const PRACTICE_SPAWN = new THREE.Vector3(0, 0.5, -76);

export function buildTestMap(world: World) {
  // Sky.
  world.scene.background = new THREE.Color(0x8fb4d4);
  world.scene.fog = new THREE.Fog(0x8fb4d4, 50, 220);

  // Lighting — hemisphere + a single directional sun for flat-shaded look.
  const hemi = new THREE.HemisphereLight(0xcbe0ff, 0x556055, 0.65);
  world.addDecoration(hemi);
  const sun = new THREE.DirectionalLight(0xffeacb, 0.85);
  sun.position.set(40, 60, 25);
  world.addDecoration(sun);

  // Ground — flat plane (visual) + thin AABB beneath the play area (collision).
  addBox(world, 0, -0.5, 0, 200, 1, 200, PALETTE.ground);
  // Decorative grid stripes via two-tone boxes set just above the ground.
  for (let i = -4; i <= 4; i++) {
    addBox(world, i * 20, -0.49, 0, 0.5, 0.02, 200, PALETTE.groundAccent, false);
    addBox(world, 0, -0.49, i * 20, 200, 0.02, 0.5, PALETTE.groundAccent, false);
  }

  // Perimeter walls — 8m high, 1m thick.
  // The south wall has a 4m-wide gap centered on x=0 so the player can walk
  // between the combat area and the Practice Range physics lab to the south.
  const PERIM = 50;
  addBox(world, -27, 4,  -PERIM, 46, 8, 1, PALETTE.wall);   // south wall, left of gap
  addBox(world,  27, 4,  -PERIM, 46, 8, 1, PALETTE.wall);   // south wall, right of gap
  // Lintel above the doorway so the gap reads as an arch, not a missing wall.
  addBox(world,   0, 7,  -PERIM,  4, 2, 1, PALETTE.wallDark);
  addBox(world, 0, 4, PERIM, PERIM * 2, 8, 1, PALETTE.wall);
  addBox(world, -PERIM, 4, 0, 1, 8, PERIM * 2, PALETTE.wall);
  addBox(world, PERIM, 4, 0, 1, 8, PERIM * 2, PALETTE.wall);

  // Central crate cluster — for cover & jumping practice.
  addBox(world, 6, 1, 6, 2, 2, 2, PALETTE.wallDark);
  addBox(world, 9, 0.5, 6, 2, 1, 2, PALETTE.wallDark);
  addBox(world, 6, 0.5, 9, 2, 1, 2, PALETTE.wallDark);
  addBox(world, 4, 2, 4, 2, 4, 2, PALETTE.pillar);

  // Step pyramid — tests step-up / ground transitions.
  for (let i = 0; i < 5; i++) {
    const w = 12 - i * 2;
    addBox(world, -15, i * 0.6 + 0.3, -15, w, 0.6, w, i % 2 === 0 ? PALETTE.wall : PALETTE.wallDark);
  }

  // Ramp (stepped approximation — 12 thin steps from y=0 to y=4 over 12m).
  buildStepRamp(world, new THREE.Vector3(-20, 0, 15), new THREE.Vector3(8, 4, 12), 16);

  // High platform reachable via the ramp or a jump pad.
  addBox(world, -22, 4.5, 28, 8, 0.5, 8, PALETTE.platform);
  // Pillars for the platform's visual weight.
  addBox(world, -25.5, 2.25, 31, 0.5, 4.5, 0.5, PALETTE.pillar);
  addBox(world, -18.5, 2.25, 31, 0.5, 4.5, 0.5, PALETTE.pillar);

  // Jump pads — yellow, low and flat.
  addJumpPadVisual(world, 20, 0.1, 0, 3, 0.2, 3, 14);   // mild
  addJumpPadVisual(world, 30, 0.1, 15, 3, 0.2, 3, 22);  // big launch toward platform
  addJumpPadVisual(world, -28, 0.1, -8, 3, 0.2, 3, 16);

  // Long bunny-hop corridor — open lane with a low rail to encourage strafing.
  addBox(world, 25, 0.5, -25, 0.5, 1, 30, PALETTE.wallDark);
  addBox(world, 40, 0.5, -25, 0.5, 1, 30, PALETTE.wallDark);

  // Tall pillar to look at for spatial reference.
  addBox(world, 0, 6, 0, 1.5, 12, 1.5, PALETTE.pillar);

  buildPhysicsLab(world);
}

/** GameMap wrapper for the practice/test map. */
export const TEST_MAP: GameMap = {
  meta: {
    id: 'practice',
    displayName: 'Practice Range',
    ffaSpawns: [PRACTICE_SPAWN.clone(), COMBAT_SPAWN.clone()],
    spawnFlashColor: 0x6cc6ff,
  },
  build: buildTestMap,
};

/**
 * Physics Lab — quiet area south of the combat zone for movement testing.
 *
 * Centered around z = -90. No enemies. Includes:
 *   - A 60m straight speed-test strip with distance markers every 10m
 *   - A bhop staircase (12 short rises) to chain hops upward
 *   - A long, low slide ramp
 *   - A wide open square for unrestricted slide / dash testing
 *   - Three test jump pads of escalating power
 *
 * The lab floor uses a distinct dark blue-gray palette so it never gets
 * confused with the combat ground at a glance.
 */
function buildPhysicsLab(world: World) {
  const cz = -90;                 // lab center Z

  // Lab floor — 60 × 60 m, dark blue-gray.
  addBox(world, 0, -0.5, cz, 60, 1, 60, PALETTE.labFloor);

  // Cyan distance stripes at 10m intervals from the doorway south.
  for (let i = 1; i <= 6; i++) {
    const z = -50 - i * 10;       // -60, -70, ..., -110
    addBox(world, 0, -0.49, z, 16, 0.02, 0.2, PALETTE.labStripe, false);
    // Numeric markers as small cyan blocks: i tally bars on the right side.
    for (let n = 0; n < i; n++) {
      addBox(world, 8 + n * 0.5, 0.05, z, 0.25, 0.1, 0.6, PALETTE.labAccent, false);
    }
  }

  // "PRACTICE" signage strip on the floor right past the doorway.
  addBox(world, 0, -0.48, -54, 8, 0.02, 1.4, PALETTE.labAccent, false);

  // Lab perimeter walls — open at the north side (faces the doorway).
  const LX = 30, LZ_S = cz - 30, LZ_N = -60;     // south wall is far end
  addBox(world,    0, 4, LZ_S, LX * 2, 8, 1, PALETTE.wallDark);
  addBox(world, -LX, 4, (LZ_S + LZ_N) / 2, 1, 8, (LZ_N - LZ_S), PALETTE.wallDark);
  addBox(world,  LX, 4, (LZ_S + LZ_N) / 2, 1, 8, (LZ_N - LZ_S), PALETTE.wallDark);

  // ----- Bhop staircase (east side) -----
  // 14 steps rising from 0 → 4.2m over 28m. Each step is 0.3m tall, 2m deep.
  // Chain bhops across the gap (gap = ~0m, you just step up).
  for (let i = 0; i < 14; i++) {
    const y = i * 0.3 + 0.15;
    const z = -64 - i * 2;
    addBox(world, 18, y, z, 6, 0.3, 2, i % 2 === 0 ? PALETTE.wallDark : PALETTE.wall);
  }
  // Top landing.
  addBox(world, 18, 4.2 + 0.15, -64 - 14 * 2, 6, 0.3, 4, PALETTE.platform);

  // ----- Long slide ramp (west side) -----
  // A 14-step ramp from y=3 down to y=0 over 18m, oriented to slide *into* the
  // open square. Player can climb (auto step-up) or run off the top to slide.
  for (let i = 0; i < 14; i++) {
    const y = 3 - (i / 13) * 3 + 0.15;
    const z = -64 - i * 1.3;
    addBox(world, -18, y, z, 6, 0.3, 1.4, i % 2 === 0 ? PALETTE.ramp : 0xc06a30);
  }
  // Side rails so you don't fall off the ramp during a slide.
  addBox(world, -21, 1.8, -71, 0.3, 3.6, 18, PALETTE.wallDark);
  addBox(world, -15, 1.8, -71, 0.3, 3.6, 18, PALETTE.wallDark);

  // ----- Speed-test strip down the center -----
  // 60m of unobstructed flat ground (already part of the lab floor). Two thin
  // cyan rails mark the lane edges so you can sight your line.
  addBox(world, -2.5, 0.05, cz, 0.1, 0.1, 60, PALETTE.labStripe, false);
  addBox(world,  2.5, 0.05, cz, 0.1, 0.1, 60, PALETTE.labStripe, false);

  // ----- Jump pads, escalating -----
  addJumpPadVisual(world,  -8, 0.1, -85, 2.5, 0.2, 2.5, 12);    // baby hop
  addJumpPadVisual(world,   0, 0.1, -100, 2.5, 0.2, 2.5, 20);   // mid
  addJumpPadVisual(world,   8, 0.1, -115, 2.5, 0.2, 2.5, 30);   // launch — top of bhop arc clears 4m

  // ----- "Spawn pad" marker (also serves as a visual orient cue) -----
  addBox(world, 0, 0.02, -76, 2.4, 0.04, 2.4, PALETTE.labAccent, false);
  addBox(world, 0, 0.05, -76, 2.0, 0.06, 0.15, PALETTE.labStripe, false);
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

function addJumpPadVisual(
  world: World,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  boost: number,
) {
  const geom = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshLambertMaterial({
    color: PALETTE.jumpPad,
    emissive: 0x5a4a00,
    emissiveIntensity: 0.4,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(cx, cy, cz);
  world.addJumpPad(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(sx, sy, sz), boost, mesh);
}

// Stepped ramp: many thin boxes so the player can walk up at speed without
// needing curved-collision support. Total rise = size.y, run = size.z.
function buildStepRamp(world: World, origin: THREE.Vector3, size: THREE.Vector3, steps: number) {
  const stepRun = size.z / steps;
  const stepRise = size.y / steps;
  for (let i = 0; i < steps; i++) {
    const y = (i + 0.5) * stepRise;
    const z = origin.z + (i + 0.5) * stepRun;
    addBox(world, origin.x, origin.y + y, z, size.x, stepRise + 0.02, stepRun + 0.02, i % 2 === 0 ? PALETTE.ramp : 0xc06a30);
  }
}
