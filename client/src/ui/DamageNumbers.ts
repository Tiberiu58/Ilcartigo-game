/**
 * DamageNumbers — Krunker-style floating damage feedback.
 *
 * Behavior (per user spec):
 *   - One summed number per trigger pull, NOT one per pellet. A 9-pellet
 *     shotgun blast that lands 5 pellets on a bot shows a single "60" tick,
 *     not nine small ones.
 *   - Floats upward + fades over ~0.8s.
 *   - Headshot hits tinted red and marked with "HS" suffix.
 *   - Anchored at the hit point in world space — renders as a billboarded
 *     sprite so it always faces the camera.
 *
 * Implementation:
 *   - Each damage tick is rendered via a CanvasTexture into a THREE.Sprite.
 *     Sprites are cheap and always face the camera by definition.
 *   - We pool the sprites + canvases so per-shot allocation is bounded.
 *   - Per-trigger aggregation: damage events from the same (attacker, target,
 *     weapon, *frame*) are summed into a pending entry; on the next frame we
 *     flush it as a single sprite. This is the cheapest way to coalesce
 *     pellet damage without rewiring the Weapon pipeline.
 *
 *  We only react to player-attacker events. Bot-on-bot damage is silent.
 */

import * as THREE from 'three';
import type { DamageEvent } from '../core/events';
import type { Game } from '../core/Game';

interface SpriteEntry {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  ttl: number;
  basePos: THREE.Vector3;          // initial spawn position; sprite drifts up from here
}

interface PendingAgg {
  targetId: string;
  weaponId: string;
  totalDamage: number;
  isHeadshot: boolean;             // true if ANY pellet was a headshot
  hitPoint: THREE.Vector3;         // first pellet's hit point — close enough
}

const POOL_SIZE = 16;
const TTL = 0.85;
const DRIFT_UP = 1.1;              // world units the number floats over its life

export class DamageNumbers {
  private scene: THREE.Scene;
  private pool: SpriteEntry[] = [];
  private camera: THREE.PerspectiveCamera;
  private game: Game;

  // Aggregate per-frame so multi-pellet hits coalesce. Key = `${targetId}|${weaponId}`.
  // Flushed at the top of each `update()` call.
  private pending = new Map<string, PendingAgg>();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, game: Game) {
    this.game = game;
    const bus = game.bus;
    this.scene = scene;
    this.camera = camera;
    for (let i = 0; i < POOL_SIZE; i++) this.pool.push(this.makeEntry());

    // Subscribe to damage events; we only care about damage dealt BY the player.
    bus.on('damage', (e) => this.onDamage(e));
  }

  private makeEntry(): SpriteEntry {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,            // always render on top so corpses don't occlude numbers
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    // 256 × 96 canvas → 1.6 × 0.6 world units feels right at default FOV.
    sprite.scale.set(1.6, 0.6, 1);
    sprite.renderOrder = 998;
    this.scene.add(sprite);
    return { sprite, canvas, ctx, texture, material, ttl: 0, basePos: new THREE.Vector3() };
  }

  private onDamage(e: DamageEvent) {
    // Show numbers when YOU are involved as attacker or target. Skip strictly
    // third-party hits (other-player vs other-player) per user spec. Works in
    // both solo and MP — Game.isLocalPlayer handles the id form.
    const youAttacking = this.game.isLocalPlayer(e.attackerId);
    const youTaking    = this.game.isLocalPlayer(e.targetId);
    if (!youAttacking && !youTaking) return;

    const key = `${e.targetId}|${e.weaponId}`;
    const cur = this.pending.get(key);
    if (cur) {
      cur.totalDamage += e.amount;
      cur.isHeadshot ||= e.isHeadshot;
    } else {
      this.pending.set(key, {
        targetId: e.targetId,
        weaponId: e.weaponId,
        totalDamage: e.amount,
        isHeadshot: e.isHeadshot,
        hitPoint: e.hitPoint.clone(),
      });
    }
  }

  update(dt: number) {
    // Flush all pending aggregates as new sprites. We're a frame late from the
    // hit (intended — that's how the aggregation works), which players don't
    // notice because the number takes ~0.85s to fade anyway.
    if (this.pending.size > 0) {
      for (const agg of this.pending.values()) this.spawn(agg);
      this.pending.clear();
    }

    // Advance every active sprite.
    for (const e of this.pool) {
      if (e.ttl <= 0) continue;
      e.ttl -= dt;
      const t = 1 - e.ttl / TTL;        // 0..1 over lifetime
      e.sprite.position.set(
        e.basePos.x,
        e.basePos.y + DRIFT_UP * easeOutCubic(t),
        e.basePos.z,
      );
      // Fade out in the last 40% of life.
      const fadeT = Math.max(0, (t - 0.6) / 0.4);
      e.material.opacity = 1 - fadeT;
      if (e.ttl <= 0) {
        e.sprite.visible = false;
      }
    }
  }

  private spawn(agg: PendingAgg) {
    // Pick the oldest slot; pool is FIFO-ish so we just take the lowest ttl.
    let chosen = this.pool[0];
    for (const e of this.pool) if (e.ttl < chosen.ttl) chosen = e;

    const dmgText = String(Math.round(agg.totalDamage));
    const headshot = agg.isHeadshot;
    drawNumber(chosen.ctx, chosen.canvas, dmgText, headshot);
    chosen.texture.needsUpdate = true;
    chosen.basePos.copy(agg.hitPoint);
    // Lift the spawn point slightly so the number doesn't clip into the model.
    chosen.basePos.y += 0.3;
    chosen.sprite.position.copy(chosen.basePos);
    chosen.sprite.visible = true;
    chosen.material.opacity = 1;
    chosen.ttl = TTL;
    void this.camera;
  }
}

/** Renders the damage text into the canvas. White-with-outline for body,
 *  red-with-outline for headshot, plus an "HS" suffix. */
function drawNumber(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, text: string, headshot: boolean) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const display = headshot ? `${text} HS` : text;
  const color = headshot ? '#ff4a4a' : '#ffffff';

  ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Thick black outline for legibility against any backdrop.
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(display, w / 2, h / 2);

  ctx.fillStyle = color;
  ctx.fillText(display, w / 2, h / 2);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
