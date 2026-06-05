/**
 * RemotePlayer — visual + interpolation for a non-local player.
 *
 * We render remote players with a deliberate ~100ms delay so the interpolation
 * between snapshot frames is smooth (no extrapolation guessing). The buffer
 * stores the last few snapshots; each render frame we find the two snapshots
 * straddling `now - INTERP_DELAY_MS` and lerp between them.
 *
 * Mesh is the same low-poly box-figure style as Bot, but the body is
 * cyan-ish so you can tell remote players from bots in mixed scenarios.
 */

import * as THREE from 'three';
import type { PlayerSnapshot } from './Protocol';
import { findSkin } from '../account/Cosmetics';

const INTERP_DELAY_MS = 100;
const BUFFER_MS = 1000;       // keep 1s of history
// Footstep stride for remote players (slightly longer than local so distant
// players don't sound like they're sprinting; tuned by ear-ish).
const REMOTE_FOOTSTEP_STRIDE = 3.4;

const BODY_HALF = new THREE.Vector3(0.35, 0.9, 0.35);
const HEAD_OFFSET = 1.55;
const HEAD_SIZE = 0.28;

interface BufferedSnap {
  t: number;          // wall-clock ms when this snap arrived (we apply our own clock)
  pos: [number, number, number];
  yaw: number;
}

export class RemotePlayer {
  readonly id: string;
  readonly group: THREE.Group;
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private buffer: BufferedSnap[] = [];

  /** Mutable state read by HUD / damage numbers / cloak check. */
  hp = 100;
  kills = 0;
  cloaked = false;
  classId = 'vanguard';
  weaponId = 'ar';
  skinId = '';

  // Footstep cadence (mirrors PlayerController): accumulate interpolated
  // horizontal travel and latch a footstep each stride. Consumed by
  // MultiplayerSession, which plays it spatially.
  private footstepAccum = 0;
  private footstepLatch = false;
  private lastFsX = 0;
  private lastFsZ = 0;
  private fsInit = false;

  constructor(id: string, scene: THREE.Scene) {
    this.id = id;
    this.group = new THREE.Group();

    this.body = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_HALF.x * 2, BODY_HALF.y * 2, BODY_HALF.z * 2),
      new THREE.MeshLambertMaterial({ color: 0x4a8db4, flatShading: true, transparent: true, opacity: 1 }),
    );
    this.body.position.y = BODY_HALF.y;
    this.group.add(this.body);

    this.head = new THREE.Mesh(
      new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE),
      new THREE.MeshLambertMaterial({ color: 0x2f5a73, flatShading: true, transparent: true, opacity: 1 }),
    );
    this.head.position.y = HEAD_OFFSET + HEAD_SIZE / 2;
    this.group.add(this.head);

    // Eye band so facing reads from across the map.
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.05, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
    );
    eye.position.set(0, HEAD_OFFSET + HEAD_SIZE / 2, -HEAD_SIZE / 2 - 0.01);
    this.group.add(eye);

    scene.add(this.group);
  }

  /** Buffer a snapshot from the server. */
  ingest(snap: PlayerSnapshot, arrivalTimeMs: number) {
    this.hp = snap.hp;
    this.kills = snap.kills;
    this.cloaked = snap.cloaked;
    this.classId = snap.classId;
    this.weaponId = snap.weaponId;
    // If the player's skin changed since last snapshot, recolor materials.
    if (snap.skinId && snap.skinId !== this.skinId) {
      this.applySkin(snap.skinId);
    }
    this.buffer.push({ t: arrivalTimeMs, pos: [...snap.pos] as [number, number, number], yaw: snap.yaw });
    const cutoff = arrivalTimeMs - BUFFER_MS;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) this.buffer.shift();
  }

  /** Recolor body + head meshes per the skin definition. */
  private applySkin(skinId: string) {
    const cfg = findSkin(skinId);
    if (!cfg) return;
    this.skinId = skinId;
    const bodyMat = this.body.material as THREE.MeshLambertMaterial;
    const headMat = this.head.material as THREE.MeshLambertMaterial;
    bodyMat.color.setHex(cfg.bodyColor);
    headMat.color.setHex(cfg.headColor);
  }

  /** Apply interpolated transform at `nowMs`. Called once per render frame. */
  render(nowMs: number) {
    const target = nowMs - INTERP_DELAY_MS;
    const b = this.buffer;
    if (b.length === 0) return;

    // If our buffer is too sparse to interpolate, snap to the latest.
    if (target <= b[0].t) {
      this.applyTransform(b[0].pos, b[0].yaw);
    } else if (target >= b[b.length - 1].t) {
      this.applyTransform(b[b.length - 1].pos, b[b.length - 1].yaw);
    } else {
      // Find the pair straddling `target`.
      for (let i = 1; i < b.length; i++) {
        if (b[i].t >= target) {
          const a = b[i - 1];
          const c = b[i];
          const span = c.t - a.t;
          const k = span > 0 ? (target - a.t) / span : 0;
          this.applyTransform(
            [
              a.pos[0] + (c.pos[0] - a.pos[0]) * k,
              a.pos[1] + (c.pos[1] - a.pos[1]) * k,
              a.pos[2] + (c.pos[2] - a.pos[2]) * k,
            ],
            shortestYawLerp(a.yaw, c.yaw, k),
          );
          break;
        }
      }
    }

    // Cloak opacity — drop when cloaked.
    const targetOpacity = this.cloaked ? 0.25 : 1.0;
    const bodyMat = this.body.material as THREE.MeshLambertMaterial;
    const headMat = this.head.material as THREE.MeshLambertMaterial;
    if (Math.abs(bodyMat.opacity - targetOpacity) > 0.01) {
      bodyMat.opacity += (targetOpacity - bodyMat.opacity) * 0.2;
      headMat.opacity = bodyMat.opacity;
    }

    // Footstep cadence from interpolated horizontal travel. Cloaked players
    // make no footsteps (stealth is the whole point of Ghost's cloak).
    const px = this.group.position.x;
    const pz = this.group.position.z;
    if (!this.fsInit) {
      this.lastFsX = px; this.lastFsZ = pz; this.fsInit = true;
    } else if (!this.cloaked) {
      const d = Math.hypot(px - this.lastFsX, pz - this.lastFsZ);
      // Ignore teleport-sized jumps (Blink/Dash) so they don't machine-gun steps.
      if (d > 0 && d < 2.0) {
        this.footstepAccum += d;
        if (this.footstepAccum >= REMOTE_FOOTSTEP_STRIDE) {
          this.footstepAccum -= REMOTE_FOOTSTEP_STRIDE;
          this.footstepLatch = true;
        }
      }
    }
    this.lastFsX = px;
    this.lastFsZ = pz;
  }

  /** Returns true once when this remote should emit a footstep, with the world
   *  position to play it at. Polled by MultiplayerSession each frame. */
  consumeFootstep(out: THREE.Vector3): boolean {
    if (!this.footstepLatch) return false;
    this.footstepLatch = false;
    out.copy(this.group.position);
    return true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    this.head.geometry.dispose();
    (this.head.material as THREE.Material).dispose();
  }

  private applyTransform(pos: [number, number, number], yaw: number) {
    this.group.position.set(pos[0], pos[1], pos[2]);
    this.group.rotation.y = yaw;
  }
}

/** Lerp between two yaw angles using the shorter arc. */
function shortestYawLerp(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}
