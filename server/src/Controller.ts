/**
 * Server-side movement controller — THREE-free port of the client's PlayerController.
 *
 * Must produce identical results to the client controller for prediction
 * reconciliation to work without constant snap-corrections. If you change
 * one, change the other (until we get a shared module set up).
 *
 * State: feet position, velocity, yaw (look angle), grounded flag, slide
 * timers, bhop timing. NO camera, NO viewmodel, NO rendering anything.
 *
 * One step is `update(dt, input)` where input describes WASD/jump/crouch +
 * desired yaw/pitch.
 */

import type { SolidAABB } from './MapCollision.js';

// ─── Speeds & physics (mirror PlayerController.ts exactly) ──────────────────
const RUN_SPEED        = 8.4;
const STRAFE_SPEED     = 7.98;
const BACK_SPEED       = 7.14;
const CROUCH_SPEED     = 3.6;
const SLIDE_BOOST_CAP  = 10.8;
const BHOP_HARD_CAP    = RUN_SPEED * 1.15;

const GROUND_ACCEL     = 90;
const FRICTION         = 12;
const STOP_SPEED       = 2.0;
const AIR_ACCEL        = 14;
const AIR_MAX_NUDGE    = 1.8;
const GRAVITY          = 22;
const JUMP_VELOCITY    = 7.0;
const BHOP_WINDOW      = 0.11;

const HALF_X = 0.35, HALF_Z = 0.35;
const HALF_Y_STAND  = 0.9;
const HALF_Y_CROUCH = 0.6;
const STEP_HEIGHT   = 0.55;

const SLIDE_MIN_SPEED = 6.0;
const SLIDE_DURATION  = 0.7;

export interface PlayerInput {
  fwd: number;        // -1, 0, +1
  str: number;
  jump: boolean;
  crouch: boolean;
  yaw: number;
  pitch: number;
}

export class ServerController {
  // Position is feet-anchored.
  position: [number, number, number] = [0, 0.5, 0];
  velocity: [number, number, number] = [0, 0, 0];
  yaw = 0;
  pitch = 0;
  /** Surge ability multiplier — applied to wishSpeed on ground. 1.0 default. */
  speedMultiplier = 1.0;

  grounded = false;
  isCrouching = false;
  isSliding = false;
  private slideTime = 0;
  private slideTriggerConsumed = false;
  private timeSinceJumpPressed = Infinity;
  private timeSinceLanded = Infinity;

  // Counter-strafe last-frame input.
  private lastFwd = 0;
  private lastStrafe = 0;

  /**
   * Provider lets the Room swap solids between ticks (Engineer Barriers add
   * solids; expiry removes them). Cheap — called only inside overlap checks.
   */
  private getSolids: () => readonly SolidAABB[];

  constructor(getSolids: () => readonly SolidAABB[], spawnPos: [number, number, number]) {
    this.getSolids = getSolids;
    this.position = [...spawnPos] as [number, number, number];
  }

  /** Step the simulation by `dt` seconds applying the given input. */
  step(dt: number, input: PlayerInput) {
    this.yaw = input.yaw;
    this.pitch = input.pitch;
    this.timeSinceJumpPressed += dt;
    this.timeSinceLanded += dt;

    const fwd = input.fwd;
    const strafe = input.str;
    const wantsCrouch = input.crouch;
    const wantsJump = input.jump;

    if (!wantsCrouch) this.slideTriggerConsumed = false;

    // Camera-yaw basis.
    const cfx = -Math.sin(this.yaw);
    const cfz = -Math.cos(this.yaw);
    const crx =  Math.cos(this.yaw);
    const crz = -Math.sin(this.yaw);

    // Counter-strafe: zero the changed-direction axis component on the ground.
    if (this.grounded) {
      if (fwd !== this.lastFwd && fwd !== 0 && this.lastFwd !== 0 && Math.sign(fwd) !== Math.sign(this.lastFwd)) {
        this.zeroAxis(cfx, cfz);
      }
      if (strafe !== this.lastStrafe && strafe !== 0 && this.lastStrafe !== 0 && Math.sign(strafe) !== Math.sign(this.lastStrafe)) {
        this.zeroAxis(crx, crz);
      }
    }
    this.lastFwd = fwd;
    this.lastStrafe = strafe;

    // wishDir + wishSpeed
    let wx = 0, wz = 0;
    if (fwd > 0) { wx += cfx; wz += cfz; }
    else if (fwd < 0) { wx -= cfx; wz -= cfz; }
    if (strafe > 0) { wx += crx; wz += crz; }
    else if (strafe < 0) { wx -= crx; wz -= crz; }
    const wLen = Math.hypot(wx, wz);
    const hasInput = wLen > 1e-6;
    if (hasInput) { wx /= wLen; wz /= wLen; }

    // Slide initiation
    const hSpeed = Math.hypot(this.velocity[0], this.velocity[2]);
    if (this.grounded && wantsCrouch && !this.isSliding && !this.slideTriggerConsumed && hSpeed >= SLIDE_MIN_SPEED) {
      this.isSliding = true;
      this.slideTime = 0;
      this.slideTriggerConsumed = true;
    }
    if (this.isSliding) {
      this.slideTime += dt;
      if (this.slideTime >= SLIDE_DURATION || !wantsCrouch || !this.grounded || hSpeed < SLIDE_MIN_SPEED * 0.6) {
        this.isSliding = false;
      }
    }
    this.isCrouching = wantsCrouch && !this.isSliding;

    // Track jump press
    if (wantsJump && this.timeSinceJumpPressed > BHOP_WINDOW) this.timeSinceJumpPressed = 0;
    else if (!wantsJump) this.timeSinceJumpPressed = Infinity;

    if (this.grounded) {
      const isBhopFrame = this.timeSinceLanded < BHOP_WINDOW && wantsJump;
      if (!isBhopFrame && !this.isSliding) this.applyFriction(dt);

      // Per-direction wishSpeed
      let wishSpeed = 0;
      if (this.isSliding) wishSpeed = SLIDE_BOOST_CAP;
      else if (this.isCrouching) wishSpeed = CROUCH_SPEED;
      else if (hasInput) {
        const fwdCap = fwd > 0 ? RUN_SPEED : BACK_SPEED;
        const len2 = fwd * fwd + strafe * strafe;
        const len = Math.sqrt(len2);
        const ufwd = fwd / len;
        const ustr = strafe / len;
        wishSpeed = Math.sqrt((ustr * STRAFE_SPEED) ** 2 + (ufwd * fwdCap) ** 2);
      }
      if (hasInput && wishSpeed > 0) this.accelerate(wx, wz, wishSpeed * this.speedMultiplier, GROUND_ACCEL, dt);

      if (wantsJump && this.timeSinceJumpPressed <= BHOP_WINDOW) {
        this.velocity[1] = JUMP_VELOCITY;
        this.grounded = false;
        this.timeSinceLanded = Infinity;
        if (isBhopFrame) this.clampHorizontal(BHOP_HARD_CAP);
      }
    } else {
      this.velocity[1] -= GRAVITY * dt;
      if (hasInput) this.accelerate(wx, wz, AIR_MAX_NUDGE, AIR_ACCEL, dt);
    }

    this.clampHorizontal(BHOP_HARD_CAP * 1.5);

    this.integrateAndCollide(dt);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private zeroAxis(ax: number, az: number) {
    const dot = this.velocity[0] * ax + this.velocity[2] * az;
    this.velocity[0] -= ax * dot;
    this.velocity[2] -= az * dot;
  }

  private applyFriction(dt: number) {
    const speed = Math.hypot(this.velocity[0], this.velocity[2]);
    if (speed < 1e-4) { this.velocity[0] = 0; this.velocity[2] = 0; return; }
    const control = Math.max(speed, STOP_SPEED);
    const drop = control * FRICTION * dt;
    const k = Math.max(0, speed - drop) / speed;
    this.velocity[0] *= k;
    this.velocity[2] *= k;
  }

  private accelerate(wx: number, wz: number, wishSpeed: number, accel: number, dt: number) {
    const currentSpeed = this.velocity[0] * wx + this.velocity[2] * wz;
    const addSpeed = wishSpeed - currentSpeed;
    if (addSpeed <= 0) return;
    let acc = accel * dt * wishSpeed;
    if (acc > addSpeed) acc = addSpeed;
    this.velocity[0] += wx * acc;
    this.velocity[2] += wz * acc;
  }

  private clampHorizontal(cap: number) {
    const h = Math.hypot(this.velocity[0], this.velocity[2]);
    if (h > cap) {
      const k = cap / h;
      this.velocity[0] *= k;
      this.velocity[2] *= k;
    }
  }

  private integrateAndCollide(dt: number) {
    const halfY = (this.isCrouching || this.isSliding) ? HALF_Y_CROUCH : HALF_Y_STAND;
    const wasGrounded = this.grounded;

    const startX = this.position[0];
    const startZ = this.position[2];
    const startVX = this.velocity[0];
    const startVZ = this.velocity[2];
    const dx = startVX * dt;
    const dz = startVZ * dt;

    // X
    this.position[0] += dx;
    this.resolveAxis(0, halfY);
    const blockedX = this.velocity[0] === 0 && Math.abs(dx) > 1e-6;
    // Z
    this.position[2] += dz;
    this.resolveAxis(2, halfY);
    const blockedZ = this.velocity[2] === 0 && Math.abs(dz) > 1e-6;

    // Step-up
    if (wasGrounded && (blockedX || blockedZ)) {
      const flatEndX = this.position[0];
      const flatEndZ = this.position[2];
      this.position[0] = startX;
      this.position[2] = startZ;
      this.position[1] += STEP_HEIGHT;
      if (this.overlapsAny(halfY) !== null) {
        this.position[1] -= STEP_HEIGHT;
        this.position[0] = flatEndX;
        this.position[2] = flatEndZ;
      } else {
        this.velocity[0] = startVX;
        this.velocity[2] = startVZ;
        this.position[0] += dx;
        this.resolveAxis(0, halfY);
        this.position[2] += dz;
        this.resolveAxis(2, halfY);
        const dropFrom = this.position[1];
        this.position[1] -= STEP_HEIGHT + 0.02;
        this.resolveAxis(1, halfY);
        if (this.position[1] < dropFrom - STEP_HEIGHT - 0.02) {
          this.position[1] = dropFrom - STEP_HEIGHT - 0.02;
        }
      }
    }

    // Y
    this.position[1] += this.velocity[1] * dt;
    this.grounded = false;
    this.resolveAxis(1, halfY);

    if (this.grounded && !wasGrounded) this.timeSinceLanded = 0;
  }

  /** Find first solid overlapping current player AABB. */
  private overlapsAny(halfY: number): SolidAABB | null {
    const pMinX = this.position[0] - HALF_X;
    const pMinY = this.position[1];
    const pMinZ = this.position[2] - HALF_Z;
    const pMaxX = this.position[0] + HALF_X;
    const pMaxY = this.position[1] + halfY * 2;
    const pMaxZ = this.position[2] + HALF_Z;
    for (const b of this.getSolids()) {
      if (pMinX < b[3] && pMaxX > b[0] &&
          pMinY < b[4] && pMaxY > b[1] &&
          pMinZ < b[5] && pMaxZ > b[2]) {
        return b;
      }
    }
    return null;
  }

  /** Push player out along axis to resolve any current overlap. */
  private resolveAxis(axis: 0 | 1 | 2, halfY: number) {
    const aabb = this.overlapsAny(halfY);
    if (!aabb) return;
    let pMin: number, pMax: number;
    if (axis === 1) {
      pMin = this.position[1];
      pMax = this.position[1] + halfY * 2;
    } else if (axis === 0) {
      pMin = this.position[0] - HALF_X;
      pMax = this.position[0] + HALF_X;
    } else {
      pMin = this.position[2] - HALF_Z;
      pMax = this.position[2] + HALF_Z;
    }
    const bMin = aabb[axis];
    const bMax = aabb[axis + 3];

    const overlapNeg = pMax - bMin;
    const overlapPos = bMax - pMin;

    if (overlapNeg < overlapPos) {
      this.position[axis] -= overlapNeg;
      if (axis === 1 && this.velocity[1] > 0) this.velocity[1] = 0;
      else if (axis !== 1) this.velocity[axis] = 0;
    } else {
      this.position[axis] += overlapPos;
      if (axis === 1) {
        if (this.velocity[1] < 0) this.grounded = true;
        this.velocity[1] = 0;
      } else {
        this.velocity[axis] = 0;
      }
    }
  }
}
