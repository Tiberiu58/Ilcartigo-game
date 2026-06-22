/**
 * World — collision & gameplay geometry registry.
 *
 * Visual meshes live in the Three.js scene; collision is a parallel list of
 * AABBs for speed and determinism. Jump pads are special AABBs that don't
 * block movement but apply an upward velocity when the player overlaps them
 * while grounded.
 */

import * as THREE from 'three';
import type { Damageable } from '../entities/Damageable';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

interface JumpPad {
  aabb: AABB;
  boostVelocity: number;
}

export interface RayHit {
  point: THREE.Vector3;
  distance: number;
  target: Damageable | null;       // null = hit the static world
  isHeadshot: boolean;
}

interface TemporarySolid {
  aabb: AABB;
  mesh: THREE.Object3D;
  expiresAt: number;            // performance.now() ms
}

export class World {
  readonly scene: THREE.Scene;
  private solids: AABB[] = [];
  private jumpPads: JumpPad[] = [];
  private damageables: Damageable[] = [];
  private temporary: TemporarySolid[] = [];
  /** Meshes/lights/decorations added by maps. Tracked so clear() can drop
   *  exactly the map geometry without touching damageable groups (bots, etc). */
  private mapObjects: THREE.Object3D[] = [];

  // Scratch AABB for player overlap tests, reused per call.
  private _pMin = new THREE.Vector3();
  private _pMax = new THREE.Vector3();
  private _rayHit = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Drop all map geometry: solids, jump pads, temporaries, decorations, and
   * lighting. Damageables (player, bots) and their meshes are unaffected —
   * Game re-positions them after the new map is built.
   */
  clear() {
    // Drop any unexpired temporary solids (Engineer barriers) first — their
    // meshes are NOT in mapObjects, but they're in the scene tree.
    for (const t of this.temporary) {
      this.scene.remove(t.mesh);
      disposeMesh(t.mesh);
    }
    this.temporary.length = 0;

    for (const o of this.mapObjects) {
      this.scene.remove(o);
      disposeMesh(o);
    }
    this.mapObjects.length = 0;
    this.solids.length = 0;
    this.jumpPads.length = 0;
    this.scene.background = null;
    this.scene.fog = null;
  }

  /**
   * Register a non-collision decoration (light, billboard, fog setter, etc.)
   * so clear() can dispose it later. Maps should use this for anything they
   * add to the scene that isn't a solid box / jump pad.
   */
  addDecoration(o: THREE.Object3D) {
    this.scene.add(o);
    this.mapObjects.push(o);
  }

  /**
   * Add a solid box that auto-removes after `lifetimeSeconds`. Used by the
   * Engineer's Barrier ability. The mesh is parented to the scene and removed
   * when the solid expires.
   */
  addTemporarySolid(center: THREE.Vector3, size: THREE.Vector3, mesh: THREE.Object3D, lifetimeSeconds: number): AABB {
    const aabb = this.addSolidBox(center, size, mesh);
    this.temporary.push({
      aabb,
      mesh,
      expiresAt: performance.now() + lifetimeSeconds * 1000,
    });
    return aabb;
  }

  /** Tick: drop expired temporary solids + their meshes. Cheap; O(n) over ~few. */
  update() {
    if (this.temporary.length === 0) return;
    const now = performance.now();
    for (let i = this.temporary.length - 1; i >= 0; i--) {
      const t = this.temporary[i];
      if (now < t.expiresAt) continue;
      const idx = this.solids.indexOf(t.aabb);
      if (idx >= 0) this.solids.splice(idx, 1);
      this.scene.remove(t.mesh);
      disposeMesh(t.mesh);
      this.temporary.splice(i, 1);
    }
  }

  /**
   * Read-only view of the static collision solids. Used by the minimap to draw
   * the arena's top-down footprint. Callers must NOT mutate the returned array
   * or its AABBs.
   */
  get staticSolids(): readonly AABB[] {
    return this.solids;
  }

  /**
   * Jump-pad AABBs, freshly collected. Allocates — intended for infrequent use
   * (the minimap rebuilds its geometry cache only on map change).
   */
  collectJumpPadAABBs(): AABB[] {
    return this.jumpPads.map((p) => p.aabb);
  }

  registerDamageable(d: Damageable) {
    // Idempotent — never double-register the same id (TDM re-runs syncBotState
    // which can re-register an already-live bot; a duplicate would make every
    // ray hit it twice and double its damage).
    if (this.damageables.some((x) => x.id === d.id)) return;
    this.damageables.push(d);
  }

  unregisterDamageable(id: string) {
    const i = this.damageables.findIndex((d) => d.id === id);
    if (i >= 0) this.damageables.splice(i, 1);
  }

  /** Add a solid box that blocks movement. Returns its AABB so callers can keep a ref. */
  addSolidBox(center: THREE.Vector3, size: THREE.Vector3, mesh?: THREE.Object3D): AABB {
    const half = size.clone().multiplyScalar(0.5);
    const aabb: AABB = {
      min: center.clone().sub(half),
      max: center.clone().add(half),
    };
    this.solids.push(aabb);
    if (mesh) {
      this.scene.add(mesh);
      this.mapObjects.push(mesh);
    }
    return aabb;
  }

  /**
   * Remove a previously-registered solid AABB by reference. Used by the MP
   * Barrier sync when the server's RemoveSolid event arrives. Mesh removal
   * is the caller's responsibility (and won't be tracked via clear() since
   * this is for runtime solids, not map geometry).
   */
  removeSolidByRef(aabb: AABB): boolean {
    const i = this.solids.indexOf(aabb);
    if (i < 0) return false;
    this.solids.splice(i, 1);
    return true;
  }

  addJumpPad(center: THREE.Vector3, size: THREE.Vector3, boost: number, mesh?: THREE.Object3D) {
    const half = size.clone().multiplyScalar(0.5);
    this.jumpPads.push({
      aabb: { min: center.clone().sub(half), max: center.clone().add(half) },
      boostVelocity: boost,
    });
    if (mesh) {
      this.scene.add(mesh);
      this.mapObjects.push(mesh);
    }
  }

  /**
   * First solid AABB overlapping the given player extents.
   *
   * Player position is FEET-anchored: the AABB spans from `pos.y` upward by
   * `2 * half.y`. This keeps crouch a top-of-capsule shrink and avoids the
   * "crouching pushes you through the floor" bug.
   */
  firstOverlap(pos: THREE.Vector3, half: THREE.Vector3): AABB | null {
    this._pMin.set(pos.x - half.x, pos.y, pos.z - half.z);
    this._pMax.set(pos.x + half.x, pos.y + half.y * 2, pos.z + half.z);
    for (const b of this.solids) {
      if (
        this._pMin.x < b.max.x && this._pMax.x > b.min.x &&
        this._pMin.y < b.max.y && this._pMax.y > b.min.y &&
        this._pMin.z < b.max.z && this._pMax.z > b.min.z
      ) {
        return b;
      }
    }
    return null;
  }

  /**
   * Hitscan: cast a ray and return the closest hit (world solid OR damageable).
   *
   * Slab algorithm — for each axis we compute the parametric `t` range
   * `[tNear, tFar]` over which the ray is inside the box's two slabs; if the
   * intersection of all three axis ranges is empty (`tEnter > tExit`), miss.
   * Otherwise the smaller, non-negative `tEnter` is the hit distance.
   *
   * Skip-id lets the shooter ignore their own body so muzzle-clipped shots
   * don't self-hit.
   */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDistance: number,
    skipId: string | null,
    /** TDM friendly-fire: when set, damageables on this team are skipped so
     *  bullets pass through teammates (Krunker convention). Undefined = FFA. */
    friendlyTeam?: number,
  ): RayHit | null {
    let bestT = maxDistance;
    let bestTarget: Damageable | null = null;
    let bestIsHead = false;

    // Inverse direction is reused — precompute once per cast.
    const invX = 1 / (dir.x || 1e-12);
    const invY = 1 / (dir.y || 1e-12);
    const invZ = 1 / (dir.z || 1e-12);

    const test = (b: AABB): number => {
      const t1 = (b.min.x - origin.x) * invX;
      const t2 = (b.max.x - origin.x) * invX;
      const t3 = (b.min.y - origin.y) * invY;
      const t4 = (b.max.y - origin.y) * invY;
      const t5 = (b.min.z - origin.z) * invZ;
      const t6 = (b.max.z - origin.z) * invZ;
      const tEnter = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
      const tExit  = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
      // Miss if box is behind us, or ranges don't intersect.
      if (tExit < 0 || tEnter > tExit) return Infinity;
      return tEnter < 0 ? 0 : tEnter; // origin-inside-box → t=0
    };

    // Static world.
    for (const b of this.solids) {
      const t = test(b);
      if (t < bestT) {
        bestT = t;
        bestTarget = null;
        bestIsHead = false;
      }
    }

    // Damageables: head first (so it wins ties), then body.
    for (const d of this.damageables) {
      if (d.id === skipId || d.health.dead) continue;
      if (friendlyTeam !== undefined && d.team === friendlyTeam) continue;
      const head = d.headAABB();
      if (head) {
        const t = test(head);
        if (t < bestT) {
          bestT = t;
          bestTarget = d;
          bestIsHead = true;
        }
      }
      const body = d.bodyAABB();
      const t = test(body);
      if (t < bestT) {
        bestT = t;
        bestTarget = d;
        bestIsHead = false;
      }
    }

    if (bestT >= maxDistance) return null;
    this._rayHit.set(
      origin.x + dir.x * bestT,
      origin.y + dir.y * bestT,
      origin.z + dir.z * bestT,
    );
    return {
      point: this._rayHit.clone(),
      distance: bestT,
      target: bestTarget,
      isHeadshot: bestIsHead,
    };
  }

  /**
   * Piercing raycast — used by the Railgun. Finds the nearest static wall along
   * the ray, then returns EVERY damageable in front of that wall (sorted near→
   * far), each with its nearest-face distance + headshot flag. The shot passes
   * through enemies but stops at world geometry, so a lined-up row can all be
   * hit by one beam. Skips the shooter + dead + same-team (TDM) damageables.
   */
  raycastPierce(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDistance: number,
    skipId: string | null,
    friendlyTeam?: number,
  ): { wallDistance: number; wallPoint: THREE.Vector3 | null; hits: Array<{ target: Damageable; distance: number; isHeadshot: boolean }> } {
    const invX = 1 / (dir.x || 1e-12);
    const invY = 1 / (dir.y || 1e-12);
    const invZ = 1 / (dir.z || 1e-12);
    const test = (b: AABB): number => {
      const t1 = (b.min.x - origin.x) * invX;
      const t2 = (b.max.x - origin.x) * invX;
      const t3 = (b.min.y - origin.y) * invY;
      const t4 = (b.max.y - origin.y) * invY;
      const t5 = (b.min.z - origin.z) * invZ;
      const t6 = (b.max.z - origin.z) * invZ;
      const tEnter = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
      const tExit  = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
      if (tExit < 0 || tEnter > tExit) return Infinity;
      return tEnter < 0 ? 0 : tEnter;
    };

    // Nearest wall = where the beam stops.
    let wallT = maxDistance;
    for (const b of this.solids) {
      const t = test(b);
      if (t < wallT) wallT = t;
    }

    const hits: Array<{ target: Damageable; distance: number; isHeadshot: boolean }> = [];
    for (const d of this.damageables) {
      if (d.id === skipId || d.health.dead) continue;
      if (friendlyTeam !== undefined && d.team === friendlyTeam) continue;
      let bestT = Infinity;
      let isHead = false;
      const head = d.headAABB();
      if (head) {
        const t = test(head);
        if (t < bestT) { bestT = t; isHead = true; }
      }
      const bodyT = test(d.bodyAABB());
      if (bodyT < bestT) { bestT = bodyT; isHead = false; }
      if (bestT < wallT && bestT < maxDistance) {
        hits.push({ target: d, distance: bestT, isHeadshot: isHead });
      }
    }
    hits.sort((a, b) => a.distance - b.distance);

    const wallPoint = wallT < maxDistance
      ? new THREE.Vector3(origin.x + dir.x * wallT, origin.y + dir.y * wallT, origin.z + dir.z * wallT)
      : null;
    return { wallDistance: wallT, wallPoint, hits };
  }

  /**
   * Line-of-sight: does an unobstructed straight line exist between A and B,
   * ignoring damageables (we only care about static cover). Used by bot AI.
   *
   * Slab test parameterized over the segment, so a hit only counts when
   * `tEnter ∈ [0, 1]`. We treat zero-component dirs as 1e-12 to avoid NaN.
   */
  hasLineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-6) return true;
    const invX = 1 / (dx || 1e-12);
    const invY = 1 / (dy || 1e-12);
    const invZ = 1 / (dz || 1e-12);
    for (const box of this.solids) {
      const t1 = (box.min.x - a.x) * invX;
      const t2 = (box.max.x - a.x) * invX;
      const t3 = (box.min.y - a.y) * invY;
      const t4 = (box.max.y - a.y) * invY;
      const t5 = (box.min.z - a.z) * invZ;
      const t6 = (box.max.z - a.z) * invZ;
      const tEnter = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
      const tExit  = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
      if (tExit >= 0 && tEnter <= tExit && tEnter <= 1) return false;
    }
    return true;
  }

  /** Returns boost velocity (positive y) if standing on a jump pad, else 0. */
  getJumpPadBoostAt(pos: THREE.Vector3, half: THREE.Vector3): number {
    // 0.05 m skin under the feet so a pad activates while grounded on it.
    this._pMin.set(pos.x - half.x, pos.y - 0.05, pos.z - half.z);
    this._pMax.set(pos.x + half.x, pos.y + half.y * 2, pos.z + half.z);
    for (const p of this.jumpPads) {
      const b = p.aabb;
      if (
        this._pMin.x < b.max.x && this._pMax.x > b.min.x &&
        this._pMin.y < b.max.y && this._pMax.y > b.min.y &&
        this._pMin.z < b.max.z && this._pMax.z > b.min.z
      ) {
        return p.boostVelocity;
      }
    }
    return 0;
  }
}

function disposeMesh(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}
