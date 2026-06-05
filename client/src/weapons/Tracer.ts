/**
 * Tracer — short-lived line segment from muzzle → impact point.
 *
 * Tracers are pooled: we keep an array of reusable line meshes and recycle the
 * oldest when we run out. ~32 concurrent tracers is way more than the AR can
 * produce given its fire rate, but we want headroom for shotgun pellet bursts
 * in Phase 3.
 */

import * as THREE from 'three';

interface TracerEntry {
  line: THREE.Line;
  ttl: number;
  maxTtl: number;
}

export class TracerPool {
  private pool: TracerEntry[] = [];

  constructor(scene: THREE.Scene, size = 32) {
    for (let i = 0; i < size; i++) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xfff0a0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.pool.push({ line, ttl: 0, maxTtl: 0.08 });
    }
  }

  /**
   * Spawn a tracer between two world points; lifetime in seconds.
   * `color` lets shooters distinguish friend (warm yellow) from foe (red).
   */
  spawn(a: THREE.Vector3, b: THREE.Vector3, lifetime = 0.1, color = 0xfff0a0) {
    // Pick the oldest entry (smallest remaining TTL ≤ 0 preferred).
    let chosen: TracerEntry | null = null;
    for (const e of this.pool) {
      if (e.ttl <= 0) { chosen = e; break; }
    }
    if (!chosen) {
      chosen = this.pool[0];
      for (const e of this.pool) if (e.ttl < chosen.ttl) chosen = e;
    }

    const attr = chosen.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    attr.needsUpdate = true;
    chosen.ttl = lifetime;
    chosen.maxTtl = lifetime;
    chosen.line.visible = true;
    const mat = chosen.line.material as THREE.LineBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 1;
  }

  update(dt: number) {
    for (const e of this.pool) {
      if (e.ttl <= 0) continue;
      e.ttl -= dt;
      if (e.ttl <= 0) {
        e.line.visible = false;
        continue;
      }
      const mat = e.line.material as THREE.LineBasicMaterial;
      mat.opacity = e.ttl / e.maxTtl;
    }
  }
}
