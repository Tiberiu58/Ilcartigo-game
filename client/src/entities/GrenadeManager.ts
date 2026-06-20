/**
 * GrenadeManager — a simple thrown frag grenade (solo only).
 *
 * Throw on G: the grenade arcs under gravity, settles on the first solid/ground
 * it touches, and detonates on a short fuse — an area-of-effect burst that damages
 * bots within radius (line-of-sight gated, linear falloff to the edge). Like the
 * melee knife it's **solo only** (no protocol; MP damage is server-authoritative)
 * and reuses the damage/kill bus so killfeed, XP, announcer and screen-shake all
 * work (`weaponId 'grenade'`, harmless to mastery).
 *
 * Self-damage is intentionally omitted — friendly for PvE and avoids the "naded
 * my own feet" frustration; teammates in TDM are skipped (friendly fire off).
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

const GRAVITY = -24;
const THROW_SPEED = 24;
const THROW_UP = 5.5;
const FUSE = 1.4;            // seconds from throw to detonation
const RADIUS = 6.5;          // blast radius (world units)
const MAX_DAMAGE = 95;       // damage at the centre, linear falloff to 0 at edge
const GRENADE_HALF = new THREE.Vector3(0.16, 0.16, 0.16);
const POOL = 4;

interface Nade {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
  settled: boolean;
  active: boolean;
}

export class GrenadeManager {
  private game: Game;
  private nades: Nade[] = [];
  private _c = new THREE.Vector3();   // scratch: target centre
  private _n = new THREE.Vector3();   // scratch: next position

  constructor(game: Game) {
    this.game = game;
    const geom = new THREE.SphereGeometry(0.16, 10, 8);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: 0x2c3a2c, emissive: 0x143a14, emissiveIntensity: 0.5 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      game.scene.add(mesh);
      this.nades.push({ mesh, vel: new THREE.Vector3(), fuse: 0, settled: false, active: false });
    }
  }

  /** Throw a grenade from `origin` along `dir` (already normalized). */
  throw(origin: THREE.Vector3, dir: THREE.Vector3) {
    const n = this.nades.find((x) => !x.active);
    if (!n) return;
    n.active = true;
    n.settled = false;
    n.fuse = FUSE;
    n.mesh.position.copy(origin).addScaledVector(dir, 0.5);
    n.vel.copy(dir).multiplyScalar(THROW_SPEED);
    n.vel.y += THROW_UP;
    n.mesh.visible = true;
  }

  update(dt: number) {
    for (const n of this.nades) {
      if (!n.active) continue;
      n.fuse -= dt;
      if (n.fuse <= 0) { this.explode(n); continue; }

      if (!n.settled) {
        n.vel.y += GRAVITY * dt;
        this._n.copy(n.mesh.position).addScaledVector(n.vel, dt);
        // Settle on ground or first solid contact.
        if (this._n.y <= 0.16) {
          this._n.y = 0.16;
          n.settled = true;
          n.vel.set(0, 0, 0);
        } else if (this.game.world.firstOverlap(this._n, GRENADE_HALF) !== null) {
          n.settled = true;
          n.vel.set(0, 0, 0);
        } else {
          n.mesh.position.copy(this._n);
          n.mesh.rotation.x += dt * 8;
          n.mesh.rotation.z += dt * 6;
        }
      }
    }
  }

  private explode(n: Nade) {
    n.active = false;
    n.mesh.visible = false;
    const pos = n.mesh.position;

    // FX — bright burst + expanding shockwave ring + spark.
    this.game.castFX.flash(pos, 0xffa030, 0.6, 4.2, 0.4);
    this.game.castFX.wave(pos, 0xff8020, 0.6, RADIUS, 0.45);
    this.game.impacts.spawn(pos, false);
    this.game.audio.play('grenade_explode');
    // A little shake if the player is close.
    const eye = this._n; this.game.player.eyePos(eye);
    const distToPlayer = eye.distanceTo(pos);
    if (distToPlayer < RADIUS * 2) this.game.applyShake(0.08 * (1 - distToPlayer / (RADIUS * 2)), 7);

    // Area damage to bots (LoS-gated, linear falloff). Teammates skipped in TDM.
    const myTeam = this.game.playerActor.team;
    for (const bot of this.game.bots) {
      if (!bot.active || bot.health.dead) continue;
      if (this.game.mode === 'tdm' && bot.team === myTeam) continue;
      this._c.copy(bot.group.position); this._c.y += 1.0;
      const d = pos.distanceTo(this._c);
      if (d > RADIUS) continue;
      if (!this.game.world.hasLineOfSight(pos, this._c)) continue;
      const dmg = MAX_DAMAGE * (1 - d / RADIUS);
      const killed = bot.health.takeDamage(dmg);
      this.game.bus.emit('damage', {
        attackerId: 'player', targetId: bot.id, amount: dmg,
        isHeadshot: false, hitPoint: this._c.clone(), weaponId: 'grenade',
      });
      if (killed) {
        this.game.bus.emit('kill', {
          attackerId: 'player', targetId: bot.id, weaponId: 'grenade',
          isHeadshot: false, hitPoint: this._c.clone(),
        });
      }
    }
  }
}
