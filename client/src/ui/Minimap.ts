/**
 * Minimap — top-down tactical radar (Krunker-style), drawn to a small canvas.
 *
 * Pure client-side, zero protocol impact. Reads geometry from the live World
 * and actor positions the game already knows about:
 *   - static solids  → faint arena footprint (walls, buildings, cover)
 *   - jump pads      → yellow ticks
 *   - local player   → a heading arrow at screen-projected position
 *   - enemies        → red dots (solo bots / MP remotes), hiding cloaked + dead
 *
 * Orientation is north-up (fixed): +X is right, +Z is down, so a player facing
 * -Z reads as pointing up. The whole arena is fit into the square with aspect
 * preserved, so shapes stay correct on non-square maps (Industrial is 100×80).
 *
 * The geometry cache (blocks + pads + bounds) is rebuilt only when the map id
 * changes; per-frame work is just clearing + redrawing dots, which is cheap.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { AABB } from '../core/World';

const _AIM = new THREE.Vector3();

/** Logical (CSS) size of the minimap square, in px. */
const SIZE = 168;
/** Inner padding so walls aren't flush to the canvas edge, in px. */
const PAD = 10;
/** Solids whose top is at/below this height are floor/decor — skip them. */
const FLOOR_MAX_Y = 0.4;
/** Redraw cadence (ms). 25 Hz is smooth enough for a radar and saves cycles. */
const REDRAW_INTERVAL = 40;

interface Rect { x: number; z: number; w: number; h: number; tall: boolean; }

export class Minimap {
  private game: Game;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  /** User toggle (persisted by main.ts). When false the canvas is hidden. */
  enabled = true;

  // Geometry cache — rebuilt on map change.
  private cachedMapId: string | null = null;
  private blocks: Rect[] = [];
  private pads: { x: number; z: number }[] = [];
  private centerWX = 0;
  private centerWZ = 0;
  private scale = 1;

  private lastDraw = 0;

  constructor(game: Game, canvas: HTMLCanvasElement) {
    this.game = game;
    this.canvas = canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * this.dpr;
    canvas.height = SIZE * this.dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap: 2D context unavailable');
    this.ctx = ctx;
    this.ctx.scale(this.dpr, this.dpr);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.canvas.classList.toggle('hidden', !on);
  }

  /** Rebuild the projected geometry from the current World + map bounds. */
  private rebuild() {
    const world = this.game.world;
    const solids = world.staticSolids;

    // Compute bounds from ALL solids (the ground box gives the full extent).
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of solids) {
      if (b.min.x < minX) minX = b.min.x;
      if (b.max.x > maxX) maxX = b.max.x;
      if (b.min.z < minZ) minZ = b.min.z;
      if (b.max.z > maxZ) maxZ = b.max.z;
    }
    if (!isFinite(minX)) { minX = -45; maxX = 45; minZ = -45; maxZ = 45; }

    this.centerWX = (minX + maxX) / 2;
    this.centerWZ = (minZ + maxZ) / 2;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxZ - minZ);
    this.scale = (SIZE - 2 * PAD) / Math.max(worldW, worldH);

    // Drawable blocks: skip floor/ground (top at/below FLOOR_MAX_Y). Tall
    // boxes (walls, buildings) read brighter than low cover.
    this.blocks = [];
    for (const b of solids) {
      if (b.max.y <= FLOOR_MAX_Y) continue;
      this.blocks.push({
        x: b.min.x, z: b.min.z,
        w: b.max.x - b.min.x, h: b.max.z - b.min.z,
        tall: (b.max.y - b.min.y) >= 3,
      });
    }

    this.pads = world.collectJumpPadAABBs().map((a: AABB) => ({
      x: (a.min.x + a.max.x) / 2,
      z: (a.min.z + a.max.z) / 2,
    }));

    this.cachedMapId = this.game.currentMapId;
  }

  private toX(wx: number): number {
    return SIZE / 2 + (wx - this.centerWX) * this.scale;
  }
  private toY(wz: number): number {
    return SIZE / 2 + (wz - this.centerWZ) * this.scale;
  }

  /** Called once per frame. Throttled internally. */
  tick() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastDraw < REDRAW_INTERVAL) return;
    this.lastDraw = now;

    if (this.cachedMapId !== this.game.currentMapId) this.rebuild();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background panel (rounded) + clip so geometry never spills the frame.
    ctx.save();
    roundRect(ctx, 0.5, 0.5, SIZE - 1, SIZE - 1, 10);
    ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
    ctx.fill();
    ctx.clip();

    // Static geometry.
    for (const b of this.blocks) {
      const x = this.toX(b.x);
      const y = this.toY(b.z);
      const w = Math.max(1.2, b.w * this.scale);
      const h = Math.max(1.2, b.h * this.scale);
      ctx.fillStyle = b.tall ? 'rgba(150, 168, 190, 0.5)' : 'rgba(120, 134, 152, 0.32)';
      ctx.fillRect(x, y, w, h);
    }

    // Jump pads — small yellow squares.
    ctx.fillStyle = '#f5d442';
    for (const p of this.pads) {
      ctx.fillRect(this.toX(p.x) - 2, this.toY(p.z) - 2, 4, 4);
    }

    // Health pickups — green crosses (dimmed while on respawn cooldown).
    this.game.pickups.forEachPad((wx, wz, available) => {
      const x = this.toX(wx);
      const y = this.toY(wz);
      ctx.fillStyle = available ? '#36e08a' : 'rgba(54, 224, 138, 0.28)';
      ctx.fillRect(x - 3, y - 1, 6, 2);
      ctx.fillRect(x - 1, y - 3, 2, 6);
    });

    // Arena power-ups — diamond markers in the buff colour (dimmed on cooldown).
    this.game.powerups.forEachPad((wx, wz, type, available) => {
      const x = this.toX(wx);
      const y = this.toY(wz);
      const base = type === 'damage' ? [255, 59, 84] : type === 'haste' ? [255, 194, 58] : [58, 214, 255];
      ctx.fillStyle = available
        ? `rgb(${base[0]}, ${base[1]}, ${base[2]})`
        : `rgba(${base[0]}, ${base[1]}, ${base[2]}, 0.3)`;
      ctx.beginPath();
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    });

    // Hardpoint capture zone — a control-coloured circle (only during KOTH).
    const zone = this.game.hardpoint?.activeZone();
    if (zone) {
      const zx = this.toX(zone.x);
      const zy = this.toY(zone.z);
      const zr = Math.max(5, 4.2 * this.scale);
      const col = zone.control === 'player' ? '74, 214, 255'
        : zone.control === 'enemy' ? '255, 74, 68'
        : zone.control === 'contested' ? '255, 210, 58'
        : '191, 207, 224';
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col}, 0.18)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgb(${col})`;
      ctx.stroke();
    }

    // Enemies — red dots. Solo bots, or MP remotes (skip cloaked + dead).
    ctx.fillStyle = '#ff5a5a';
    if (this.game.mp) {
      this.game.mp.forEachRemoteBlip((wx, wz, cloaked, dead) => {
        if (cloaked || dead) return;
        dot(ctx, this.toX(wx), this.toY(wz), 3);
      });
    } else {
      const tdm = this.game.mode === 'tdm';
      for (const bot of this.game.bots) {
        if (!bot.active || bot.health.dead) continue;
        // In TDM, colour by team (allies blue, enemies red); FFA = all red.
        ctx.fillStyle = tdm
          ? (bot.team === this.game.playerActor.team ? '#5a9cff' : '#ff5a5a')
          : '#ff5a5a';
        const pos = bot.group.position;
        dot(ctx, this.toX(pos.x), this.toY(pos.z), 3);
      }
    }

    // Local player — heading arrow. Heading from horizontal aim direction:
    // facing -Z (north) → arrow points up. atan2(x, -z) maps that to a CSS
    // rotation (clockwise) so +X rotates the arrow to the right.
    const p = this.game.player.pos;
    const ax = this.game.player.aimDir(_AIM).x;
    const az = _AIM.z;
    const ang = Math.atan2(ax, -az);
    const px = this.toX(p.x);
    const py = this.toY(p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fillStyle = '#4ce0c0';
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Border on top (outside the clip so it stays crisp).
    roundRect(ctx, 0.5, 0.5, SIZE - 1, SIZE - 1, 10);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(180, 200, 220, 0.28)';
    ctx.stroke();
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
