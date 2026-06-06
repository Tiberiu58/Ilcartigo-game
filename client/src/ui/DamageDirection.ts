/**
 * DamageDirection — CoD/Krunker-style directional damage indicators.
 *
 * When the local player takes damage, a red curved arc flashes around the
 * crosshair pointing toward the attacker. The arc's rotation is the attacker's
 * bearing relative to where the camera is facing (0° = dead ahead / top of
 * screen, +90° = to your right, ±180° = behind you).
 *
 * Pure DOM + bus-driven, mirroring HUD/DamageNumbers/Announcer. Resolves the
 * attacker's world position through `Game.actorWorldPos`, which unifies solo
 * bots and MP remotes. If the attacker can't be resolved (left the match, or a
 * fall/suicide with no attacker) we simply skip — no indicator.
 *
 * A small pool of arc elements is reused; rapid fire from one direction keeps
 * refreshing a single arc rather than stacking, while shots from two directions
 * show two arcs at once. Silent — no audio coupling (HUD owns the hit flash/SFX).
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

/** How long an arc stays lit before it begins to fade (ms). */
const ARC_HOLD_MS = 850;
/** Two hits whose bearings are within this many degrees re-use the same arc. */
const MERGE_DEGREES = 30;
/** Pool size — max simultaneous distinct directions shown. */
const POOL = 6;

interface Arc {
  el: HTMLElement;
  /** Last bearing shown (deg) — used to merge nearby hits. */
  angle: number;
  /** performance.now() when this arc was last refreshed (0 = idle). */
  litAt: number;
  timer: number | null;
}

export class DamageDirection {
  private game: Game;
  private root: HTMLElement;
  private arcs: Arc[] = [];
  private _attacker = new THREE.Vector3();

  constructor(game: Game) {
    this.game = game;
    this.root = document.getElementById('damage-dir')!;

    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'ddir';
      el.innerHTML = '<div class="ddir-arc"></div>';
      this.root.appendChild(el);
      this.arcs.push({ el, angle: 0, litAt: 0, timer: null });
    }

    game.bus.on('damage', (e) => {
      // Only when WE'RE the one taking the hit, and not self-inflicted.
      if (!game.isLocalPlayer(e.targetId)) return;
      if (game.isLocalPlayer(e.attackerId)) return;
      if (!game.actorWorldPos(e.attackerId, this._attacker)) return;
      this.flash(this.bearingTo(this._attacker));
    });
  }

  /** Bearing (degrees) of a world point relative to the camera's facing. */
  private bearingTo(target: THREE.Vector3): number {
    const cam = this.game.camera.position;
    const dx = target.x - cam.x;
    const dz = target.z - cam.z;
    const yaw = this.game.camera.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // Camera forward = (-sin, -cos); right = (cos, -sin). Project the delta.
    const f = dx * -sin + dz * -cos;
    const r = dx * cos + dz * -sin;
    // atan2(right, forward): 0 = ahead, + = to the right (clockwise).
    return (Math.atan2(r, f) * 180) / Math.PI;
  }

  private flash(angleDeg: number) {
    const now = performance.now();
    // Prefer an already-lit arc pointing roughly the same way (continuous fire).
    let target = this.arcs.find(
      (a) => a.litAt > 0 && Math.abs(angularDelta(a.angle, angleDeg)) <= MERGE_DEGREES,
    );
    // Otherwise the oldest idle arc, else the oldest lit one (recycle).
    if (!target) {
      target = this.arcs.find((a) => a.litAt === 0);
    }
    if (!target) {
      target = this.arcs.reduce((a, b) => (a.litAt <= b.litAt ? a : b));
    }

    target.angle = angleDeg;
    target.litAt = now;
    target.el.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
    // Restart the show/fade: remove, reflow, re-add.
    target.el.classList.remove('show');
    void target.el.offsetWidth;
    target.el.classList.add('show');

    if (target.timer !== null) window.clearTimeout(target.timer);
    target.timer = window.setTimeout(() => {
      target!.el.classList.remove('show');
      target!.litAt = 0;
      target!.timer = null;
    }, ARC_HOLD_MS);
  }
}

/** Smallest signed difference between two angles (degrees), in [-180, 180]. */
function angularDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
