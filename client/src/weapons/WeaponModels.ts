/**
 * WeaponModels — lazy FBX loader + per-weapon transform tuning for the
 * first-person viewmodel.
 *
 * The Viewmodel historically built each gun from procedural boxes. This module
 * lets it instead show real FBX models (dropped into
 * `public/assets/models/weapons/`). Design constraints:
 *
 *   - **Non-blocking + safe.** FBXLoader is dynamically imported (kept out of
 *     the main bundle) and models load asynchronously. Until a model is ready —
 *     or if it's missing / fails to load — the Viewmodel falls back to its box
 *     builder, so the game is never broken by a model problem.
 *   - **Cached + cloned.** Each FBX is parsed once, then `clone()`d per use
 *     (the local viewmodel; later, remote viewmodels could share the cache).
 *   - **Normalized.** FBX exports come in wildly different scales/orientations
 *     (e.g. Blender Y-up at 100× units). Each weapon has a hand-tuned transform
 *     (scale / rotation / position) + a muzzle-Z so flashes/tracers line up,
 *     all in the Viewmodel's local space (rest pose faces -Z).
 *
 * Materials are converted to MeshLambertmaterial-compatible so the existing
 * cosmetic hooks (skin tint on the body, finish emissive, cloak opacity) keep
 * working unchanged.
 */

import * as THREE from 'three';
import type { WeaponId } from './Weapon';

/**
 * The FBX weapon exports carry meaningful material NAMES (LightWood, DarkWood,
 * Black, Metal, Barrels, BulletYellow…) but all-white diffuse colours, so the
 * model would render as a flat grey blob. Reconstruct a colour from the name
 * (case-insensitive substring match, most-specific first) so each part reads
 * distinctly and the guns look like guns. Returns null for unknown names
 * (caller uses a neutral gunmetal fallback).
 */
const MATERIAL_COLORS: Array<[RegExp, number]> = [
  [/lightwood|light_wood/i, 0xb5824a],
  [/darkwood|dark_wood/i,   0x5c3a1e],
  [/wood/i,                 0x8a5a2c],
  [/darkermetal|darkmetal|dark_metal/i, 0x33393f],
  [/gunmetal|metal/i,       0x6e757d],
  [/barrel/i,               0x2b2f34],
  [/trigger/i,              0x3a3f45],
  [/grip|handle/i,          0x26292d],
  [/magazine|\bmag\b/i,     0x2e3338],
  [/muzzle/i,               0x1c1f22],
  [/bulletred|\bred\b/i,    0xb23b32],
  [/bulletyellow|brass|yellow/i, 0xc8a13a],
  [/bulletorange|orange/i,  0xc8742a],
  [/scope|lens|glass|optic/i, 0x6fb7cf],
  [/black/i,                0x16181b],
  [/grey|gray/i,            0x7a8088],
  [/green/i,                0x4a9d52],
];
function colorForMaterialName(name: string): THREE.Color | null {
  for (const [re, hex] of MATERIAL_COLORS) {
    if (re.test(name)) return new THREE.Color(hex);
  }
  return null;
}

/**
 * Some models (e.g. the P90) ship with generic material names (`Material.001`…)
 * AND white colours, so the name-map can't help — they'd render as a flat grey
 * blob. For those, colour by material INDEX with a hand-picked weapon palette
 * (biggest group = body). Keyed by FBX file name.
 */
const MATERIAL_INDEX_COLORS: Record<string, number[]> = {
  // P90 — compact polymer SMG: dark olive/black body, steel accents, black optic.
  'P90.fbx': [0x3a4038 /*body*/, 0x14161a /*black trim*/, 0x2b2f35 /*receiver*/, 0x6a727a /*steel*/],
};

/** Per-weapon FBX file + how to place it in the viewmodel's local space. */
interface ModelDef {
  /** File under public/assets/models/weapons/. */
  file: string;
  /** Target length (viewmodel-local units) of the model's LONGEST axis. The
   *  model is auto-scaled to this at load time, so we don't have to hand-guess
   *  raw FBX units (which vary wildly + can bake internal scale onto nodes). */
  length: number;
  /** Euler rotation (radians) to orient the barrel down -Z. Applied AFTER the
   *  auto-normalize, so it's purely about orientation, not size. */
  rot: [number, number, number];
  /** Position offset in viewmodel-local space (after normalize + rotate). */
  pos: [number, number, number];
  /** Muzzle tip Z (group-local) for flash + tracer origin. */
  muzzleZ: number;
}

/**
 * Tuning table. Each model is auto-normalized at load (recentred on origin +
 * scaled so its longest axis == `length`), which removes the raw-FBX-units
 * guesswork. `rot` then orients the barrel down -Z:
 *   - Rifle/Shotgun/Sniper/P90/RayGun export barrel-down-Z already → no Y-rot.
 *   - LMG + Pistol export barrel-along-X → +90° Y-rot to face -Z.
 * A weapon with no entry keeps the procedural box builder.
 *
 * `marksman` reuses the Rifle model (no dedicated DMR FBX); `railgun` uses the
 * RayGun. `pistol` uses Pistol.fbx — the Revolver export is degenerate (a stray
 * vertex blows its bbox to 42000 units) so it's deliberately NOT used.
 */
// Two native orientations among these FBX exports (measured in-browser by
// checking which world axis the model's longest dimension lands on, AND which
// end the muzzle is on):
//   Z0 = long axis on model-Z, but muzzle points +Z (toward camera) → 180° Y so
//        the muzzle faces -Z (forward). Rifle/Shotgun/Sniper/P90/RayGun.
//   ZX = long axis on model-X, muzzle faces correctly at -90° Y. LMG + Pistol.
const Z0 = Math.PI;
const ZX = -Math.PI / 2;
export const WEAPON_MODELS: Partial<Record<WeaponId, ModelDef>> = {
  ar:       { file: 'Rifle.fbx',       length: 0.95, rot: [0, Z0, 0], pos: [0, 0.0, 0.16],  muzzleZ: -0.52 },
  smg:      { file: 'P90.fbx',         length: 0.80, rot: [0, Z0, 0], pos: [0, 0.0, 0.10],  muzzleZ: -0.40 },
  sniper:   { file: 'SniperRifle.fbx', length: 1.05, rot: [0, Z0, 0], pos: [0, 0.0, 0.26],  muzzleZ: -0.78 },
  shotgun:  { file: 'Shotgun.fbx',     length: 0.92, rot: [0, Z0, 0], pos: [0, 0.0, 0.20],  muzzleZ: -0.60 },
  marksman: { file: 'Rifle.fbx',       length: 1.00, rot: [0, Z0, 0], pos: [0, 0.0, 0.20],  muzzleZ: -0.68 },
  lmg:      { file: 'LMG.fbx',         length: 0.95, rot: [0, ZX, 0], pos: [0, -0.04, 0.10], muzzleZ: -0.70 },
  railgun:  { file: 'RayGun.fbx',      length: 0.78, rot: [0, Z0, 0], pos: [0, -0.08, 0.12], muzzleZ: -0.72 },
  burst:    { file: 'Rifle.fbx',       length: 0.88, rot: [0, Z0, 0], pos: [0, 0.0, 0.14],  muzzleZ: -0.50 },
  magnum:   { file: 'Pistol.fbx',      length: 0.52, rot: [0, ZX, 0], pos: [0, 0.0, 0.02],  muzzleZ: -0.26 },
  pistol:   { file: 'Pistol.fbx',      length: 0.42, rot: [0, ZX, 0], pos: [0, 0.0, 0.0],   muzzleZ: -0.20 },
};

const BASE = import.meta.env.BASE_URL || '/';
const MODEL_DIR = `${BASE}assets/models/weapons/`;

// Loader is created on first use (dynamic import keeps FBXLoader out of the
// initial bundle). null until the first load() call resolves the import.
let loaderPromise: Promise<{ load: (url: string) => Promise<THREE.Group> }> | null = null;

async function getLoader() {
  if (!loaderPromise) {
    loaderPromise = import('three/examples/jsm/loaders/FBXLoader.js').then((mod) => {
      const loader = new mod.FBXLoader();
      return {
        load: (url: string) =>
          new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, (g: THREE.Group) => resolve(g), undefined, reject);
          }),
      };
    });
  }
  return loaderPromise;
}

/** Parsed-model cache, keyed by file name. */
const cache = new Map<string, THREE.Group>();
/** In-flight loads, so concurrent requests for the same file share one fetch. */
const inflight = new Map<string, Promise<THREE.Group | null>>();

/**
 * Prepare a loaded FBX for use as a STATIC viewmodel:
 *   1. **De-rig.** These weapon FBXs export as `SkinnedMesh` with a skeleton.
 *      A plain `Object3D.clone()` doesn't rebind bones, so cloned skinned
 *      meshes collapse to a degenerate (invisible) shape. We don't animate the
 *      gun, so we replace each SkinnedMesh with a plain Mesh sharing the same
 *      geometry + material — no skeleton, clones perfectly, renders normally.
 *   2. **Flatten materials** to flat-shaded Lambert so the viewmodel's cosmetic
 *      hooks (tint / finish emissive / cloak opacity) work. Diffuse colour +
 *      texture are preserved.
 *
 * Returns a fresh Group containing the de-rigged meshes (bones discarded).
 */
function staticizeAndNormalizeMaterials(root: THREE.Object3D, file: string): THREE.Group {
  const indexPalette = MATERIAL_INDEX_COLORS[file];
  const convertMat = (m: THREE.Material, idx: number): THREE.MeshLambertMaterial => {
    const anyM = m as unknown as { color?: THREE.Color; map?: THREE.Texture | null; name?: string };
    // Colour priority: (1) name-derived (LightWood/Metal/Barrels…), (2) a
    // per-file index palette for models with generic material names (P90), then
    // (3) the FBX's own non-white diffuse, else (4) a neutral gunmetal fallback.
    const named = colorForMaterialName(anyM.name ?? '');
    const byIndex = indexPalette && indexPalette[idx] !== undefined ? new THREE.Color(indexPalette[idx]) : null;
    const baseColor = named ?? byIndex ?? (anyM.color && anyM.color.getHex() !== 0xffffff
      ? anyM.color.clone()
      : new THREE.Color(0x8a929c));   // neutral gunmetal fallback
    return new THREE.MeshLambertMaterial({
      color: baseColor,
      map: anyM.map ?? null,
      flatShading: true,
    });
  };

  const out = new THREE.Group();
  // Collect meshes first (mutating the tree mid-traverse is unsafe).
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) meshes.push(n as THREE.Mesh);
  });
  for (const src of meshes) {
    const mat = Array.isArray(src.material)
      ? src.material.map((m, i) => convertMat(m, i))
      : convertMat(src.material, 0);
    // Bake the mesh's world transform into a fresh geometry so we can drop the
    // bone hierarchy entirely and still keep each part in the right place.
    const geom = src.geometry.clone();
    geom.applyMatrix4(src.matrixWorld);
    const plain = new THREE.Mesh(geom, mat);
    plain.castShadow = false;
    plain.receiveShadow = false;
    plain.frustumCulled = false;   // small viewmodel parented to camera
    out.add(plain);
  }
  return out;
}

/**
 * Normalize a freshly-parsed FBX in place: recentre it on the origin and scale
 * its longest axis to `length`. We bake this onto the *meshes' own* transforms
 * by wrapping: measure the world bbox (which already includes any internal FBX
 * scale), then put a uniform scale + recentre offset on a wrapper group. The
 * cache stores this wrapper, so clones are correctly sized regardless of the
 * raw FBX units. Returns the wrapper.
 */
function normalizeToLength(parsed: THREE.Group, length: number): THREE.Group {
  // Reset the FBX root's own transform so its world bbox reflects pure geometry
  // (FBX roots often carry a baked rotation/scale we want to neutralize), then
  // measure in world space.
  parsed.position.set(0, 0, 0);
  parsed.rotation.set(0, 0, 0);
  parsed.scale.set(1, 1, 1);
  parsed.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(parsed);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const s = length / longest;

  // inner: recentre the model's bbox centre to the origin (in the model's own
  // post-internal-transform space) then uniform-scale. wrapper exposes a clean
  // origin for the caller's rotate/position. Order matters: scale the wrapper
  // so the recentre offset (in raw units) scales with it.
  const inner = new THREE.Group();
  inner.add(parsed);
  inner.position.copy(center).multiplyScalar(-1);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.scale.setScalar(s);
  return wrapper;
}

/**
 * Get a ready-to-add clone of the weapon's model, applying its orientation +
 * position (size is already baked in by normalizeToLength at load). Returns
 * null if there's no model def, or the file isn't loaded yet / failed (caller
 * falls back to the box builder). Kicks off the load on first miss; call again
 * after `onReady` fires to pick up the model.
 */
export function getWeaponModel(id: WeaponId): THREE.Group | null {
  const def = WEAPON_MODELS[id];
  if (!def) return null;
  const raw = cache.get(def.file);
  if (!raw) {
    void ensureLoaded(id);
    return null;
  }
  // Clone the raw parsed FBX, normalize to this weapon's target length (per-
  // weapon, since one file e.g. Rifle.fbx serves ar + marksman at different
  // sizes), then orient + position.
  const wrapper = normalizeToLength(raw.clone(true), def.length);
  wrapper.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
  wrapper.position.set(def.pos[0], def.pos[1], def.pos[2]);
  return wrapper;
}

/** Muzzle-Z for a weapon's model (group-local), or null if no model def. */
export function modelMuzzleZ(id: WeaponId): number | null {
  return WEAPON_MODELS[id]?.muzzleZ ?? null;
}

/** Listeners fired whenever a new model finishes loading (so the live
 *  viewmodel can rebuild to swap its box out for the real model). */
const readyListeners = new Set<(id: WeaponId) => void>();
export function onModelReady(cb: (id: WeaponId) => void) {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

/** Begin loading a weapon's model (idempotent). Resolves to the parsed group
 *  or null on failure. */
export async function ensureLoaded(id: WeaponId): Promise<THREE.Group | null> {
  const def = WEAPON_MODELS[id];
  if (!def) return null;
  if (cache.has(def.file)) return cache.get(def.file)!;
  if (inflight.has(def.file)) return inflight.get(def.file)!;

  const p = (async () => {
    try {
      const loader = await getLoader();
      const raw = await loader.load(`${MODEL_DIR}${def.file}`);
      // De-rig (SkinnedMesh → plain Mesh) + flatten materials. The result is a
      // clone-safe static group; cache THAT (not the raw rigged FBX).
      const staticGroup = staticizeAndNormalizeMaterials(raw, def.file);
      cache.set(def.file, staticGroup);
      readyListeners.forEach((cb) => cb(id));
      return staticGroup;
    } catch (e) {
      // Missing/corrupt model: log once, fall back to box geometry forever.
      console.warn(`[weapon-models] failed to load ${def.file}; using box fallback`, e);
      return null;
    } finally {
      inflight.delete(def.file);
    }
  })();
  inflight.set(def.file, p);
  return p;
}

/** Preload all weapon models (call after boot, off the critical path). */
export function preloadWeaponModels() {
  (Object.keys(WEAPON_MODELS) as WeaponId[]).forEach((id) => void ensureLoaded(id));
}
