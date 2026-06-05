/**
 * Pulse — Hunter's wallhack reveal.
 *
 * For 3 seconds, every living bot is highlighted with a silhouette mesh that
 * renders *through walls* (depthTest=false, renderOrder=999). The silhouette
 * is a slightly-larger transparent cyan box parented to each bot's group; we
 * fade it in on trigger and out on expiry by tweening opacity.
 *
 * Cheap: no shader work, no per-bot raycast. Reads cleanly because the
 * silhouette is solid color and always-on-top.
 */

import * as THREE from 'three';
import { Ability, type AbilityContext } from '../types';
import type { Bot } from '../../entities/Bot';

const DURATION = 3.0;
const FADE_TIME = 0.15;

interface Silhouette {
  bot: Bot;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class Pulse extends Ability {
  readonly id = 'pulse' as const;
  readonly displayName = 'Pulse';
  readonly baseCooldown = 22;

  /** Set externally by the runner so we have something to highlight. */
  bots: Bot[] = [];

  private silhouettes: Silhouette[] = [];

  protected onTrigger(ctx: AbilityContext): void {
    this.isActive = true;
    this.silhouettes = [];

    // Radial scan wave from player position — magenta sphere expanding outward.
    // Reads as a "ping" — even if no enemies are visible, you see the wave go.
    const playerPos = _SCRATCH.set(
      ctx.player.pos.x,
      ctx.player.pos.y + 1.5,
      ctx.player.pos.z,
    );
    ctx.fx.wave(playerPos, 0xff5a7e, 0.5, 30, 0.4);

    for (const bot of this.bots) {
      if (bot.health.dead) continue;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff5a7e,
        transparent: true,
        opacity: 0,
        depthTest: false,           // always render — even when behind walls
        depthWrite: false,
      });
      // Slightly larger than the bot's body so it haloes the silhouette.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.0, 1.05), mat);
      mesh.renderOrder = 999;       // draw last so it sits on top
      mesh.position.y = 0.9;        // matches bot body center
      bot.group.add(mesh);
      this.silhouettes.push({ bot, mesh, material: mat });
    }

    ctx.bus.emit('screenShake', { intensity: 0.015, duration: 0.1 });
  }

  protected onActiveTick(_dt: number, ctx: AbilityContext): void {
    const t = this.activeTime;
    // Triangle fade: in over FADE_TIME, hold, out over FADE_TIME.
    let alpha: number;
    if (t < FADE_TIME) alpha = (t / FADE_TIME) * 0.45;
    else if (t > DURATION - FADE_TIME) alpha = ((DURATION - t) / FADE_TIME) * 0.45;
    else alpha = 0.45;

    for (const s of this.silhouettes) {
      // If the bot died mid-pulse, fade its silhouette too.
      if (s.bot.health.dead) s.material.opacity = 0;
      else s.material.opacity = Math.max(0, alpha);
    }

    if (t >= DURATION) this.cancelActive(ctx);
  }

  protected onActiveEnd(_ctx: AbilityContext): void {
    for (const s of this.silhouettes) {
      s.bot.group.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.material.dispose();
    }
    this.silhouettes = [];
  }
}

const _SCRATCH = new THREE.Vector3();
