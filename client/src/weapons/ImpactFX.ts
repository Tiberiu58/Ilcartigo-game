/**
 * ImpactFX — pooled bullet-impact sparks/puffs at hit points.
 *
 * Every shot that lands spawns a quick additive burst at the impact: a warm
 * dust puff on world geometry, a red spark on flesh (player/bot hits). This is
 * the moment-to-moment "my bullets are connecting with the world" feedback that
 * Krunker leans on heavily and ILCARTIGO was missing — tracers showed the path
 * but nothing happened where they landed.
 *
 * Pooled like TracerPool (impacts fire on every shot, so per-impact mesh
 * allocation would churn GC). A fixed ring of THREE.Sprites shares one soft
 * radial texture; each impact recycles 2–3 sprites for a small burst. All
 * additive + depthWrite off so they read as light, never z-fight the wall.
 */

import * as THREE from 'three';

interface SpriteEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  ttl: number;
  maxTtl: number;
  baseScale: number;
  vx: number; vy: number; vz: number;   // small drift so sparks scatter
}

/** Warm dust for world hits; hot red-orange for flesh. */
const WORLD_COLOR = 0xffd9a0;
const FLESH_COLOR = 0xff5a4a;

export class ImpactFX {
  private pool: SpriteEntry[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, size = 36) {
    const tex = makeSparkTexture();
    for (let i = 0; i < size; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: WORLD_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.frustumCulled = false;
      scene.add(sprite);
      this.pool.push({ sprite, material: mat, ttl: 0, maxTtl: 0.18, baseScale: 0.3, vx: 0, vy: 0, vz: 0 });
    }
  }

  /**
   * Spawn an impact burst at a world point. `flesh` switches colour + size.
   * `count` sprites scatter from the point with a little drift.
   */
  spawn(point: THREE.Vector3, flesh: boolean, count = flesh ? 3 : 2) {
    const color = flesh ? FLESH_COLOR : WORLD_COLOR;
    for (let i = 0; i < count; i++) {
      const e = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      e.sprite.position.set(point.x, point.y, point.z);
      const ttl = flesh ? 0.22 : 0.16;
      e.ttl = ttl;
      e.maxTtl = ttl;
      e.baseScale = flesh ? 0.42 : 0.3;
      // Scatter velocity — small for the central puff (i=0), wider for sparks.
      const spread = i === 0 ? 0.4 : 2.6;
      e.vx = (Math.random() - 0.5) * spread;
      e.vy = (Math.random() - 0.5) * spread + (flesh ? 0.6 : 0.3);
      e.vz = (Math.random() - 0.5) * spread;
      e.material.color.setHex(color);
      e.material.opacity = 1;
      e.sprite.scale.setScalar(e.baseScale);
      e.sprite.visible = true;
    }
  }

  update(dt: number) {
    for (const e of this.pool) {
      if (e.ttl <= 0) continue;
      e.ttl -= dt;
      if (e.ttl <= 0) {
        e.sprite.visible = false;
        e.material.opacity = 0;
        continue;
      }
      const t = e.ttl / e.maxTtl;            // 1 → 0
      e.material.opacity = t;
      // Grow slightly as it fades; drift along scatter velocity.
      e.sprite.scale.setScalar(e.baseScale * (1.4 - 0.4 * t));
      e.sprite.position.x += e.vx * dt;
      e.sprite.position.y += e.vy * dt;
      e.sprite.position.z += e.vz * dt;
    }
  }
}

/** One soft radial-gradient texture shared by every spark sprite. */
function makeSparkTexture(): THREE.Texture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
