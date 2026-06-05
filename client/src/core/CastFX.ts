/**
 * CastFX — short-lived visual effects spawned by abilities.
 *
 * Three effect shapes, one update loop:
 *   - flash(): point-light + additive sphere that fades in 0.25s
 *               (Phantom teleport endpoints, Vanguard dash start)
 *   - wave():  sphere that expands from `radius0` to `radius1` and fades over
 *              `duration` (Hunter pulse scan)
 *   - trail(): tube-shaped additive segment that fades in place
 *               (Vanguard dash motion trail)
 *
 * Implementation note: each effect is a single THREE.Mesh added to the scene
 * with a tracked TTL + animation function. We dispose the mesh and material
 * when TTL expires. This stays simple and predictable — no pooling complexity
 * because abilities cast at most once every 8s.
 */

import * as THREE from 'three';

interface FxEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  /** Per-frame updater. Receives normalized t ∈ [0, 1]. */
  tick(t: number, mesh: THREE.Mesh, material: THREE.MeshBasicMaterial): void;
}

export class CastFX {
  private scene: THREE.Scene;
  private active: FxEntry[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * A bright additive flash at a world point — small sphere that grows from
   * `radiusStart` to `radiusEnd` and fades. Ideal for teleport endpoints.
   */
  flash(pos: THREE.Vector3, color: number, radiusStart = 0.4, radiusEnd = 1.2, duration = 0.35) {
    const geom = new THREE.SphereGeometry(1, 12, 8);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(radiusStart);
    this.scene.add(mesh);
    this.active.push({
      mesh, material: mat, age: 0, duration,
      tick: (t, m, material) => {
        const r = radiusStart + (radiusEnd - radiusStart) * t;
        m.scale.setScalar(r);
        // Eased fade — bright early, fast falloff late.
        material.opacity = 0.9 * Math.pow(1 - t, 2);
      },
    });
  }

  /**
   * A radial wave that expands outward — used for Hunter Pulse scan. Uses a
   * sphere with backface culling disabled and additive blending; opacity peaks
   * at t≈0.3 and fades to 0.
   */
  wave(pos: THREE.Vector3, color: number, radiusStart: number, radiusEnd: number, duration: number) {
    const geom = new THREE.SphereGeometry(1, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.BackSide,                  // visible from inside the sphere too
      blending: THREE.AdditiveBlending,
      wireframe: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(radiusStart);
    this.scene.add(mesh);
    this.active.push({
      mesh, material: mat, age: 0, duration,
      tick: (t, m, material) => {
        const r = radiusStart + (radiusEnd - radiusStart) * t;
        m.scale.setScalar(r);
        // Bell-curve opacity: 0 → 0.35 → 0 across t=0..1.
        material.opacity = 0.35 * Math.sin(Math.PI * Math.min(1, t / 0.85));
      },
    });
  }

  /**
   * A line-of-tubes trail between two world points — used by Vanguard dash.
   * Geometry is a thin cylinder oriented along (b - a), additively blended.
   */
  trail(a: THREE.Vector3, b: THREE.Vector3, color: number, thickness = 0.18, duration = 0.4) {
    const length = a.distanceTo(b);
    if (length < 0.1) return;
    const geom = new THREE.CylinderGeometry(thickness, thickness, length, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    // Cylinder is Y-up by default. Position at midpoint and rotate to align
    // with (b - a).
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const dir = _SCRATCH.copy(b).sub(a).normalize();
    // Build a quaternion that rotates (0,1,0) to dir.
    const up = _UP;
    mesh.quaternion.setFromUnitVectors(up, dir);
    this.scene.add(mesh);
    this.active.push({
      mesh, material: mat, age: 0, duration,
      tick: (t, _m, material) => {
        material.opacity = 0.55 * (1 - t);
      },
    });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.age += dt;
      const t = e.age / e.duration;
      if (t >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.material.dispose();
        this.active.splice(i, 1);
        continue;
      }
      e.tick(t, e.mesh, e.material);
    }
  }
}

const _UP = new THREE.Vector3(0, 1, 0);
const _SCRATCH = new THREE.Vector3();
