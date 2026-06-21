/**
 * Nameplates — floating callsign + health bar above each bot (Krunker staple).
 *
 * One billboarded THREE.Sprite per bot, drawn from a pooled canvas (callsign on
 * top, a green→red HP bar under it). Sprites use `depthTest: true` so a wall
 * between you and a bot naturally occludes the plate — you can't read enemies
 * through geometry, which keeps it fair (no wallhack). Distance shrink comes for
 * free from perspective; we also fade + hide past a max range.
 *
 * Solo only: it reads `game.bots` directly (HP, team, callsign). MP remotes
 * don't broadcast HP, so nameplates there are a future, protocol-touching item.
 *
 * Cheap: the canvas is only redrawn when a bot's HP bucket or team changes; the
 * per-frame cost is just repositioning visible sprites.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Bot } from '../entities/Bot';

const MAX_DIST = 75;          // hide nameplates beyond this (world units)
const FADE_DIST = 60;         // start fading here
const HEAD_Y = 2.35;          // height above the bot's feet to float the plate

interface Plate {
  bot: Bot;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
  lastHpBucket: number;       // redraw trigger
  lastTeam: number;
  lastName: string;
}

export class Nameplates {
  private game: Game;
  private plates: Plate[] = [];
  private enabled = true;
  private _camPos = new THREE.Vector3();

  constructor(game: Game) {
    this.game = game;
    for (const bot of game.bots) this.plates.push(this.makePlate(bot));
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) for (const p of this.plates) p.sprite.visible = false;
  }

  private makePlate(bot: Bot): Plate {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,          // occluded by walls = fair
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.set(2.0, 0.625, 1);
    sprite.renderOrder = 996;
    this.game.scene.add(sprite);
    return { bot, sprite, canvas, ctx, texture, material, lastHpBucket: -1, lastTeam: -1, lastName: '' };
  }

  /** Called each frame from Game.onFrame (cheap). */
  update() {
    if (!this.enabled) return;
    this.game.camera.getWorldPosition(this._camPos);
    for (const p of this.plates) {
      const bot = p.bot;
      if (!bot.active || bot.health.dead) {
        if (p.sprite.visible) p.sprite.visible = false;
        continue;
      }
      const pos = bot.group.position;
      const dist = this._camPos.distanceTo(pos);
      if (dist > MAX_DIST) {
        if (p.sprite.visible) p.sprite.visible = false;
        continue;
      }

      // Redraw the canvas only when the visible content changes.
      const hp = bot.health.current;
      const bucket = Math.ceil(hp);
      if (bucket !== p.lastHpBucket || bot.team !== p.lastTeam || bot.name !== p.lastName) {
        p.lastHpBucket = bucket;
        p.lastTeam = bot.team;
        p.lastName = bot.name;
        drawPlate(p.ctx, p.canvas, bot.name, hp / bot.health.max, this.game.mode === 'tdm' ? bot.team : -1);
        p.texture.needsUpdate = true;
      }

      p.sprite.position.set(pos.x, pos.y + HEAD_Y, pos.z);
      // Fade with distance so far plates don't clutter.
      p.material.opacity = dist > FADE_DIST ? 1 - (dist - FADE_DIST) / (MAX_DIST - FADE_DIST) : 1;
      p.sprite.visible = true;
    }
  }
}

/** Render "callsign + HP bar" into the canvas. teamTint: -1 = FFA (neutral),
 *  0 = BLUE ally, 1 = RED enemy. */
function drawPlate(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  name: string,
  hpFrac: number,
  teamTint: number,
) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Callsign — team-tinted in TDM, light neutral in FFA.
  const nameColor = teamTint === 0 ? '#9cc0ff' : teamTint === 1 ? '#ffa49e' : '#eef1f6';
  ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(name, w / 2, 24);
  ctx.fillStyle = nameColor;
  ctx.fillText(name, w / 2, 24);

  // HP bar — rounded track + green→amber→red fill by fraction.
  const barW = 180;
  const barH = 14;
  const x = (w - barW) / 2;
  const y = 50;
  const frac = Math.max(0, Math.min(1, hpFrac));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  roundRect(ctx, x - 2, y - 2, barW + 4, barH + 4, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  roundRect(ctx, x, y, barW, barH, 4);
  ctx.fill();
  ctx.fillStyle = frac > 0.5 ? '#36e08a' : frac > 0.25 ? '#f5c542' : '#ff5a52';
  roundRect(ctx, x, y, barW * frac, barH, 4);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
