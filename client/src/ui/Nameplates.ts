/**
 * Nameplates — floating name + health bar above enemies (combat readability).
 *
 * A Krunker staple: you can see at a glance who you're fighting and how close
 * they are to dying. Rendered as world-space billboarded sprites (same proven
 * pattern as DamageNumbers) so they always face the camera and are occluded by
 * walls (depthTest on) — no wallhack, you only read the health of enemies you
 * can actually see.
 *
 * Covers both SOLO (bots, off `Game.bots`) and MP (remote players, via
 * `MultiplayerSession.forEachRemote`) — dead and cloaked enemies show no plate.
 * It needs no hooks into Bot.ts and only a zero-alloc visitor on the MP session.
 *
 * Self-contained + pooled: a fixed sprite pool, canvas textures redrawn only
 * when an enemy's HP/name actually changes, so per-frame cost is just positioning.
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
  /** Plates placed this frame — shared between the bot loop and the remote visitor. */
  private _used = 0;

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

  /** Per-frame: position + draw a plate over each living, visible enemy. */
  update() {
    const camPos = this.game.camera.position;
    this._used = 0;

    if (this.game.mp) {
      // MP: plate every visible (alive, uncloaked) remote player.
      this.game.mp.forEachRemote((id, x, y, z, hp, cloaked) => {
        if (this._used >= this.pool.length) return;
        if (hp <= 0 || cloaked) return;
        if (this.placePlate(this._used, x, y, z, shortId(id), hp, 100, camPos)) this._used++;
      });
    } else {
      // Solo: plate every active, living bot.
      for (const b of this.game.bots) {
        if (this._used >= this.pool.length) break;
        if (!b.active || b.health.dead) continue;
        const bp = b.group.position;
        if (this.placePlate(this._used, bp.x, bp.y, bp.z, plateName(b), b.health.current, b.health.max, camPos)) {
          this._used++;
        }
      }
    }

    // Hide any plates not used this frame.
    for (let i = this._used; i < this.pool.length; i++) this.pool[i].sprite.visible = false;
  }

  /** Draw + position one plate. Returns false (no slot consumed) if culled by
   *  distance, so callers only advance the slot index when a plate is shown. */
  private placePlate(slot: number, x: number, y: number, z: number, name: string, hp: number, max: number, camPos: THREE.Vector3): boolean {
    const dist = this._v.set(x, y + PLATE_Y, z).distanceTo(camPos);
    if (dist > MAX_DIST) return false;
    const plate = this.pool[slot];
    if (plate.lastName !== name || plate.lastHp !== hp) {
      drawPlate(plate.ctx, name, hp, max);
      plate.texture.needsUpdate = true;
      plate.lastName = name;
      plate.lastHp = hp;
    }
    plate.sprite.position.set(x, y + PLATE_Y, z);
    plate.material.opacity = dist > FADE_START
      ? Math.max(0, 1 - (dist - FADE_START) / (MAX_DIST - FADE_START))
      : 1;
    plate.sprite.visible = true;
    return true;
  }
}

/** Short, readable label for a remote player id (socket ids are long). */
function shortId(id: string): string {
  return id.slice(0, 6);
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
