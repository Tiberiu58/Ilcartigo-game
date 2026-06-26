/**
 * CharacterModel — lazy loader + per-instance factory for the rigged player
 * character (used for *remote* multiplayer players; bots keep the box figure).
 *
 * Unlike the static weapon models (which we de-rig), the character is fully
 * rigged with 18 animation clips, so we MUST preserve the skeleton:
 *   - The FBX is loaded + cached ONCE.
 *   - Each remote player gets its own clone via `SkeletonUtils.clone` (a plain
 *     Object3D.clone does NOT rebind bones → the mesh collapses), wrapped in a
 *     normalizing group (recentre on feet + scale to player height) plus its
 *     own `AnimationMixer` + named clip actions (Idle / Run / Death / Jump).
 *
 * Non-blocking: FBXLoader + SkeletonUtils are dynamically imported (own chunk).
 * Until the model is ready (or if it fails), the caller keeps the box figure.
 */

import * as THREE from 'three';

/** The animation clips we drive (suffix-matched against the FBX's verbose
 *  `CharacterArmature|…|Idle` names). */
export type CharClip = 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Death';

const BASE = import.meta.env.BASE_URL || '/';
const MODEL_URL = `${BASE}assets/models/character/CubeMan.fbx`;

/** Target world height (metres) of the character's longest (vertical) axis. */
const TARGET_HEIGHT = 1.9;

interface LoadedChar {
  /** The raw parsed FBX root (rigged, with .animations). Cloned per instance. */
  root: THREE.Group;
  /** Uniform scale that maps native units → TARGET_HEIGHT. */
  scale: number;
  /** Clip name (full FBX name) keyed by our short CharClip id. */
  clipByName: Map<CharClip, THREE.AnimationClip>;
}

let loaded: LoadedChar | null = null;
let loadPromise: Promise<LoadedChar | null> | null = null;
const readyListeners = new Set<() => void>();

export function onCharacterReady(cb: () => void): () => void {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

/** Match a short clip id to the FBX's verbose clip name (suffix after the last `|`). */
function pickClip(clips: THREE.AnimationClip[], id: CharClip): THREE.AnimationClip | null {
  const want = id.toLowerCase();
  // Prefer an exact suffix match; fall back to substring.
  let exact: THREE.AnimationClip | null = null;
  let partial: THREE.AnimationClip | null = null;
  for (const c of clips) {
    const tail = (c.name.split('|').pop() ?? c.name).toLowerCase();
    if (tail === want) exact = c;
    else if (!partial && tail.includes(want)) partial = c;
  }
  return exact ?? partial;
}

/** Begin loading the character model (idempotent). */
export async function ensureCharacterLoaded(): Promise<LoadedChar | null> {
  if (loaded) return loaded;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const fbxMod = await import('three/examples/jsm/loaders/FBXLoader.js');
      const loader = new fbxMod.FBXLoader();
      const root = await new Promise<THREE.Group>((res, rej) =>
        loader.load(MODEL_URL, (g) => res(g), undefined, rej),
      );

      // Measure native height → scale to TARGET_HEIGHT.
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const nativeH = Math.max(size.x, size.y, size.z) || 1;
      const scale = TARGET_HEIGHT / nativeH;

      // Lighten the model's materials so it reads in the game's flat lighting,
      // and stop shadow work we don't need.
      root.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
      });

      const clipByName = new Map<CharClip, THREE.AnimationClip>();
      for (const id of ['Idle', 'Walk', 'Run', 'Jump', 'Death'] as CharClip[]) {
        const clip = pickClip(root.animations ?? [], id);
        if (clip) clipByName.set(id, clip);
      }

      loaded = { root, scale, clipByName };
      readyListeners.forEach((cb) => cb());
      return loaded;
    } catch (e) {
      console.warn('[character] failed to load CubeMan.fbx; remote players keep box figure', e);
      return null;
    }
  })();
  return loadPromise;
}

/** Preload (call off the critical boot path). */
export function preloadCharacter() {
  void ensureCharacterLoaded();
}

export interface CharacterInstance {
  /** Group to add to the RemotePlayer's group (already scaled + feet-centred). */
  group: THREE.Group;
  /** Step the animation. */
  update(dt: number): void;
  /** Cross-fade to a clip (Idle/Run/Death/Jump). No-op if already playing it. */
  play(clip: CharClip): void;
  /** Set overall opacity (cloak). */
  setOpacity(o: number): void;
  dispose(): void;
}

/**
 * Build a fresh animated instance of the character, or null if the model isn't
 * loaded yet. The returned group is scaled to player height and sits with its
 * feet at the group origin (so RemotePlayer can position it like the box).
 */
export async function createCharacterInstance(): Promise<CharacterInstance | null> {
  const lc = loaded ?? (await ensureCharacterLoaded());
  if (!lc) return null;

  // SkeletonUtils.clone deep-clones the rig with bones correctly rebound.
  const skelUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const clone = skelUtils.clone(lc.root) as THREE.Group;

  // Wrap: scale to height, and shift so the model's feet sit at y=0.
  clone.scale.setScalar(lc.scale);
  const box = new THREE.Box3().setFromObject(clone);
  clone.position.y -= box.min.y;   // drop feet to origin

  const group = new THREE.Group();
  group.add(clone);

  const mixer = new THREE.AnimationMixer(clone);
  const actions = new Map<CharClip, THREE.AnimationAction>();
  for (const [id, clip] of lc.clipByName) {
    actions.set(id, mixer.clipAction(clip));
  }

  let current: CharClip | null = null;
  const materials: THREE.Material[] = [];
  clone.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh) {
      const arr = Array.isArray(m.material) ? m.material : [m.material];
      arr.forEach((mm) => { mm.transparent = true; materials.push(mm); });
    }
  });

  const inst: CharacterInstance = {
    group,
    update: (dt) => mixer.update(dt),
    play: (clip) => {
      if (current === clip) return;
      const next = actions.get(clip);
      if (!next) return;
      const prev = current ? actions.get(current) : null;
      next.reset();
      next.enabled = true;
      // Death plays once + holds the last frame; locomotion loops.
      if (clip === 'Death' || clip === 'Jump') {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
      }
      next.fadeIn(0.18);
      next.play();
      if (prev && prev !== next) prev.fadeOut(0.18);
      current = clip;
    },
    setOpacity: (o) => { for (const m of materials) m.opacity = o; },
    dispose: () => { mixer.stopAllAction(); mixer.uncacheRoot(clone); },
  };
  // Start idling.
  inst.play('Idle');
  return inst;
}
