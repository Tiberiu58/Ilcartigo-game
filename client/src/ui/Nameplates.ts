/**
 * Nameplates — floating name + health bar above enemies (combat readability).
 *
 * A Krunker staple: you can see at a glance who you're fighting and how close
 * they are to dying. Rendered as world-space billboarded sprites (same proven
 * pattern as DamageNumbers) so they always face the camera and are occluded by
 * walls (depthTest on) — no wallhack, you only read the health of enemies you
 * can actually see.
 *
 * Scope v1: SOLO bots only. It pulls live state straight off `Game.bots` each
 * frame, so it needs no hooks into Bot.ts and adds nothing in MP (where
 * `game.bots` are inactive). Remote-player plates can layer on later by feeding
 * this the same draw/position calls from snapshot data.
 *
 * Self-contained + pooled: a fixed sprite pool, canvas textures redrawn only
 * when a bot's HP actually changes, so per-frame cost is just positioning.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Bot } from '../entities/Bot';

interface Plate {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  /** Last (name, hp) drawn — skip redraw when unchanged. */
  lastName: string;
  lastHp: number;
}

const POOL_SIZE = 8;
const PLATE_Y = 2.18;       // world units above the bot's feet
const MAX_DIST = 75;        // beyond this, hide the plate
const FADE_START = 58;      // begin fading opacity past this distance
const CANVAS_W = 256;
const CANVAS_H = 72;

export class Nameplates {
  private scene: THREE.Scene;
  private game: Game;
  private pool: Plate[] = [];
  private _v = new THREE.Vector3();

  constructor(scene: THREE.Scene, game: Game) {
    this.scene = scene;
    this.game = game;
    for (let i = 0; i < POOL_SIZE; i++) this.pool.push(this.makePlate());
  }

  private makePlate(): Plate {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,          // walls occlude the plate — no wallhack
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.set(1.5, 0.42, 1);
    sprite.renderOrder = 990;
    this.scene.add(sprite);
    return { sprite, canvas, ctx, texture, material, lastName: '', lastHp: -1 };
  }

  /** Per-frame: position + draw a plate over each living, active bot. */
  update() {
    // No plates in MP (bots inactive there) — hide everything and bail.
    if (this.game.mp) {
      for (const p of this.pool) p.sprite.visible = false;
      return;
    }

    const camPos = this.game.camera.position;
    let used = 0;
    for (const b of this.game.bots) {
      if (used >= this.pool.length) break;
      if (!b.active || b.health.dead) continue;

      const bp = b.group.position;
      const dist = this._v.set(bp.x, bp.y + PLATE_Y, bp.z).distanceTo(camPos);
      if (dist > MAX_DIST) continue;

      const plate = this.pool[used++];
      const name = plateName(b);
      const hp = b.health.current;
      if (plate.lastName !== name || plate.lastHp !== hp) {
        drawPlate(plate.ctx, name, hp, b.health.max);
        plate.texture.needsUpdate = true;
        plate.lastName = name;
        plate.lastHp = hp;
      }
      plate.sprite.position.set(bp.x, bp.y + PLATE_Y, bp.z);
      plate.material.opacity = dist > FADE_START
        ? Math.max(0, 1 - (dist - FADE_START) / (MAX_DIST - FADE_START))
        : 1;
      plate.sprite.visible = true;
    }

    // Hide any plates not used this frame.
    for (let i = used; i < this.pool.length; i++) this.pool[i].sprite.visible = false;
  }
}

/** Short label for a bot — capitalised difficulty (e.g. "Predictor"). */
function plateName(b: Bot): string {
  const d = b.difficulty;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** HP bar colour by remaining fraction: green → amber → red. */
function hpColor(frac: number): string {
  if (frac > 0.6) return '#54d66a';
  if (frac > 0.3) return '#ffd24a';
  return '#ff5a5a';
}

function drawPlate(ctx: CanvasRenderingContext2D, name: string, hp: number, max: number) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;

  // Name.
  ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(name, CANVAS_W / 2, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, CANVAS_W / 2, 20);

  // Health bar.
  const barW = 200;
  const barH = 16;
  const x = (CANVAS_W - barW) / 2;
  const y = 44;
  // Track.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 4);
  ctx.fill();
  // Fill.
  ctx.fillStyle = hpColor(frac);
  roundRect(ctx, x, y, Math.max(2, barW * frac), barH, 3);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
