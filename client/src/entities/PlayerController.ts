/**
 * PlayerController — CS:GO-flavored kinematic movement, rewritten from scratch.
 *
 * Design goals (from user spec):
 *   - Crisp, *not* arcadey. 7 m/s base run, asymmetric backward (~85%) and
 *     strafe (~95%) caps. Walk (Ctrl) = 5 m/s. Crouch (Shift) = 3 m/s.
 *   - Counter-strafe: releasing a held direction while pressing the opposite
 *     snaps that axis to zero — same frame — so peeks are sharp.
 *   - High accel, high friction → reach max in ~0.1s, full stop in ~0.15s.
 *   - Light bhop: holding Space and landing within the bhop window skips the
 *     landing-friction tick, but a hard speed ceiling (RUN_SPEED × 1.15)
 *     prevents the snowball you get in Quake/Source.
 *   - Light air control: 30° steering nudge per jump, no speed gain.
 *   - Slide kept but trivial — Shift while sprinting flips a 0.8s frictionless
 *     state. No 1.15× boost stacking, no compounding launch.
 *   - Step-up onto small ledges retained (CS has this).
 *
 * Public surface is preserved so the rest of the engine doesn't need updates:
 *   pos, vel, state, speed, eyePos, aimDir, applyRecoil, speedMultiplier,
 *   setPosition, teleportTo, addHorizontalImpulse, stanceAccuracyPenalty.
 *
 * Position is FEET-anchored (collision AABB extends upward by 2*half.y).
 */

import * as THREE from 'three';
import { Input } from '../core/Input';
import { World } from '../core/World';

// ─── Speeds (m/s) ────────────────────────────────────────────────────────────
// +20% bump from the initial CS-tuned values per user feedback. Ratios between
// run/strafe/back kept proportional so the asymmetry feel doesn't change.
const RUN_SPEED        = 8.4;      // baseline forward run (was 7.0)
const STRAFE_SPEED     = 7.98;     // ~95% of run
const BACK_SPEED       = 7.14;     // ~85% of run
const WALK_SPEED       = 6.0;      // Ctrl modifier (currently unbound — reserved)
const CROUCH_SPEED     = 3.6;      // ~43% of run — still a real slow-down
const SLIDE_BOOST_CAP  = 10.8;     // top of an unboosted slide (proportional)
const BHOP_HARD_CAP    = RUN_SPEED * 1.15;  // 9.66 — caps chained-jump speed-gain

// ─── Tuning ──────────────────────────────────────────────────────────────────
const GROUND_ACCEL     = 90;       // very snappy — reach max in ~RUN_SPEED/90 ≈ 78ms
const FRICTION         = 12;       // strong — CS-style decel
const STOP_SPEED       = 2.0;      // friction acts as if speed ≥ this → snappy stop
const AIR_ACCEL        = 14;       // light air control
const AIR_MAX_NUDGE    = 1.8;      // wishSpeed cap in air — no speed gain possible
const GRAVITY          = 22;
const JUMP_VELOCITY    = 7.0;      // ~1.3m hop (slightly lower than before)
const BHOP_WINDOW      = 0.11;     // 110ms — forgiving but not "always bhop"
// Footstep cadence: emit one footstep per this many metres of grounded travel.
// At run speed (~9 u/s) that's ~2.6 steps/sec — a natural jog. Below this
// horizontal speed we treat the player as standing (no steps).
const FOOTSTEP_STRIDE      = 3.4;
const FOOTSTEP_MIN_SPEED   = 1.8;  // u/s — slower than this = not "walking"

// ─── Capsule ─────────────────────────────────────────────────────────────────
const PLAYER_HALF_EXTENT        = new THREE.Vector3(0.35, 0.9, 0.35);
const PLAYER_HALF_EXTENT_CROUCH = new THREE.Vector3(0.35, 0.6, 0.35);
const EYE_HEIGHT_STAND  = 1.65;
const EYE_HEIGHT_CROUCH = 1.05;
const STEP_HEIGHT       = 0.55;
const PITCH_LIMIT       = Math.PI / 2 - 0.01;

// ─── Slide ───────────────────────────────────────────────────────────────────
const SLIDE_MIN_SPEED   = 6.0;     // need this much momentum to slide
const SLIDE_DURATION    = 0.7;     // shorter than before — keep it minor

// ─── Mouse ───────────────────────────────────────────────────────────────────
const SENS_SCALE        = 0.0022;  // raw movementX → radians

export type PlayerState = 'ground' | 'air' | 'slide' | 'crouch' | 'walk';

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  private input: Input;
  private world: World;

  // Authoritative state.
  private position = new THREE.Vector3(0, 0.5, 0);
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = false;

  // Stance flags.
  private isCrouching = false;
  private isWalking = false;
  private isSliding = false;
  private slideTime = 0;
  private slideTriggerConsumed = false;

  // Bhop timing.
  private timeSinceJumpPressed = Infinity;
  private timeSinceLanded = Infinity;

  // Per-frame audio event latches. Set when the action happens, cleared by
  // the consumer (Game.tick polls these to fire one-shot SFX). Edge-triggered
  // so we can't miss or duplicate a sound regardless of frame timing.
  private audioJumped = false;
  private audioLanded = false;
  private audioJumpPad = false;
  // Footstep cadence: accumulate horizontal distance travelled while grounded
  // and moving; every FOOTSTEP_STRIDE metres we latch a footstep. Crouch-walk
  // takes a longer stride (quieter, slower gait).
  private footstepAccum = 0;
  private audioFootstep = false;

  // Counter-strafe edge tracking — remembers last frame's input so we can detect
  // "released A while D is now pressed" and zero the A axis instantly.
  private lastFwd = 0;
  private lastStrafe = 0;

  // Per-frame derived intent.
  private _wishLocalFwd = 0;     // -1 / 0 / +1 (S / none / W)
  private _wishLocalStrafe = 0;  // -1 / 0 / +1 (A / none / D)
  private _wishDirWorld = new THREE.Vector3();

  // Scratch.
  private _camForward = new THREE.Vector3();
  private _camRight = new THREE.Vector3();

  /** Movement-speed multiplier (Rush "Surge" ability). Multiplies the active speed cap. */
  speedMultiplier = 1.0;
  /** Powerup speed buff (Adrenaline pickup). Stacks multiplicatively WITH
   *  speedMultiplier so a Surge + speed-pad combo compounds and neither resets
   *  the other. Defaults to 1.0 (no-op). */
  buffSpeedMultiplier = 1.0;
  /** FOV nudge from abilities (e.g. Surge +8). Game adds this to baseFov when computing target FOV. */
  abilityFovOffset = 0;

  constructor(camera: THREE.PerspectiveCamera, input: Input, world: World) {
    this.camera = camera;
    this.input = input;
    this.world = world;
  }

  // ── Public getters / mutators ──────────────────────────────────────────────

  setPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.timeSinceLanded = Infinity;
    this.timeSinceJumpPressed = Infinity;
    this.isSliding = false;
    this.slideTriggerConsumed = false;
  }

  teleportTo(target: THREE.Vector3) {
    this.position.copy(target);
    this.velocity.set(0, 0, 0);
  }

  addHorizontalImpulse(direction: THREE.Vector3, magnitude: number) {
    this.velocity.x += direction.x * magnitude;
    this.velocity.z += direction.z * magnitude;
  }

  get state(): PlayerState {
    if (this.isSliding) return 'slide';
    if (!this.grounded) return 'air';
    if (this.isCrouching) return 'crouch';
    if (this.isWalking) return 'walk';
    return 'ground';
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get pos(): THREE.Vector3 {
    return this.position;
  }

  get vel(): THREE.Vector3 {
    return this.velocity;
  }

  /**
   * Per-frame audio edge consumers. Each returns true once on the frame the
   * action happened, then resets to false. Game.tick polls these to fire the
   * matching SFX without coupling PlayerController to the AudioManager.
   */
  consumeJumpedEdge(): boolean { const v = this.audioJumped; this.audioJumped = false; return v; }
  consumeLandedEdge(): boolean { const v = this.audioLanded; this.audioLanded = false; return v; }
  consumeJumpPadEdge(): boolean { const v = this.audioJumpPad; this.audioJumpPad = false; return v; }
  consumeFootstepEdge(): boolean { const v = this.audioFootstep; this.audioFootstep = false; return v; }

  eyePos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.camera.position);
  }

  aimDir(out: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cosPitch;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cosPitch;
    return out;
  }

  applyRecoil(pitchKick: number, yawKick: number) {
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + pitchKick));
    this.yaw += yawKick;
  }

  /**
   * Stance/movement accuracy multiplier for the Weapon. 1.0 = baseline tuning,
   * <1 = tighter (crouched / walking), >1 = wider (running / airborne).
   *
   * Crouched stationary: 0.40×. Crouched moving: 0.40 → 0.70. Walking: 0.65×.
   * Standing stationary: 1.0×. Running max: 2.0×. Sliding: 2.5×. Air: 3.0×.
   */
  stanceAccuracyPenalty(): number {
    if (!this.grounded) return 3.0;
    if (this.isSliding) return 2.5;
    const hSpeed = this.speed;
    if (this.isCrouching) {
      const t = Math.min(1, hSpeed / CROUCH_SPEED);
      return 0.40 + 0.30 * t;
    }
    if (this.isWalking) return 0.65;
    const t = Math.min(1, hSpeed / RUN_SPEED);
    return 1.0 + 1.0 * t;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(dt: number) {
    this.applyMouseLook();
    this.updateTimers(dt);

    // Read intent.
    const fwd    = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
    const strafe = (this.input.isDown('right')   ? 1 : 0) - (this.input.isDown('left')  ? 1 : 0);
    const wantsCrouch = this.input.isDown('crouch');
    const wantsWalk   = this.input.isDown('walk') && !wantsCrouch;
    const wantsJump   = this.input.isDown('jump');

    if (!wantsCrouch) this.slideTriggerConsumed = false;

    // Build camera-yaw basis.
    this._camForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._camRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // ─── Counter-strafe ─────────────────────────────────────────────────────
    // If the player held a direction last frame and is now pressing the
    // opposite, snap that axis of velocity to zero. CS:GO's defining trick for
    // sharp peeks. Only applied on the ground (in air it'd feel awful).
    if (this.grounded) {
      if (fwd !== this.lastFwd && fwd !== 0 && this.lastFwd !== 0 && Math.sign(fwd) !== Math.sign(this.lastFwd)) {
        // Zero out the forward-axis component of velocity in camera space.
        this.zeroAxisInCameraFrame(this._camForward);
      }
      if (strafe !== this.lastStrafe && strafe !== 0 && this.lastStrafe !== 0 && Math.sign(strafe) !== Math.sign(this.lastStrafe)) {
        this.zeroAxisInCameraFrame(this._camRight);
      }
    }
    this.lastFwd = fwd;
    this.lastStrafe = strafe;

    // ─── Build wishDir (world space) ────────────────────────────────────────
    this._wishLocalFwd = fwd;
    this._wishLocalStrafe = strafe;
    this._wishDirWorld.set(0, 0, 0);
    if (fwd > 0) this._wishDirWorld.add(this._camForward);
    else if (fwd < 0) this._wishDirWorld.sub(this._camForward);
    if (strafe > 0) this._wishDirWorld.add(this._camRight);
    else if (strafe < 0) this._wishDirWorld.sub(this._camRight);
    const hasInput = this._wishDirWorld.lengthSq() > 0;
    if (hasInput) this._wishDirWorld.normalize();

    // ─── Slide initiation ───────────────────────────────────────────────────
    // Shift while running fast → frictionless slide for SLIDE_DURATION.
    // No initial impulse, no boost stacking (fixed the launch bug for good).
    if (
      this.grounded && wantsCrouch && !this.isSliding && !this.slideTriggerConsumed &&
      this.speed >= SLIDE_MIN_SPEED
    ) {
      this.isSliding = true;
      this.slideTime = 0;
      this.slideTriggerConsumed = true;
    }
    if (this.isSliding) {
      this.slideTime += dt;
      if (this.slideTime >= SLIDE_DURATION || !wantsCrouch || !this.grounded || this.speed < SLIDE_MIN_SPEED * 0.6) {
        this.isSliding = false;
      }
    }
    this.isCrouching = wantsCrouch && !this.isSliding;
    this.isWalking = wantsWalk;

    // ─── Track jump press for bhop window ───────────────────────────────────
    if (wantsJump && this.timeSinceJumpPressed > BHOP_WINDOW) this.timeSinceJumpPressed = 0;
    else if (!wantsJump) this.timeSinceJumpPressed = Infinity;

    // ─── Ground vs air movement ─────────────────────────────────────────────
    if (this.grounded) {
      const isBhopFrame = this.timeSinceLanded < BHOP_WINDOW && wantsJump;

      // Friction: skipped on bhop frames (CS-style speed preservation), and
      // suspended while sliding.
      if (!isBhopFrame && !this.isSliding) {
        this.applyFriction(dt);
      }

      // Pick wishSpeed by stance + input direction.
      const wishSpeed = this.computeGroundWishSpeed();
      if (hasInput && wishSpeed > 0) {
        this.accelerate(this._wishDirWorld, wishSpeed * this.speedMultiplier * this.buffSpeedMultiplier, GROUND_ACCEL, dt);
      }

      // Jump.
      if (wantsJump && this.timeSinceJumpPressed <= BHOP_WINDOW) {
        this.velocity.y = JUMP_VELOCITY;
        this.grounded = false;
        this.timeSinceLanded = Infinity;
        this.audioJumped = true;
        // On bhop frames, clamp horizontal speed to BHOP_HARD_CAP so chained
        // hops can't snowball past CS's "1 free hop" budget.
        if (isBhopFrame) this.clampHorizontalSpeed(BHOP_HARD_CAP);
      }
    } else {
      // Air: gravity + light steering. No speed gain possible (wishSpeed tiny).
      this.velocity.y -= GRAVITY * dt;
      if (hasInput) {
        this.accelerate(this._wishDirWorld, AIR_MAX_NUDGE, AIR_ACCEL, dt);
      }
    }

    // Always-on safety: even bugs can't fling us off the map.
    this.clampHorizontalSpeed(BHOP_HARD_CAP * 1.5);

    // ─── Integrate position with collision ──────────────────────────────────
    this.moveWithCollision(dt);

    // ─── Camera follow ──────────────────────────────────────────────────────
    const targetEye = this.isCrouching || this.isSliding ? EYE_HEIGHT_CROUCH : EYE_HEIGHT_STAND;
    const cam = this.camera.position;
    cam.x = this.position.x;
    cam.z = this.position.z;
    cam.y += (this.position.y + targetEye - cam.y) * Math.min(1, dt * 18);
  }

  // ── Movement helpers ───────────────────────────────────────────────────────

  private updateTimers(dt: number) {
    this.timeSinceJumpPressed += dt;
    this.timeSinceLanded += dt;
  }

  private applyMouseLook() {
    const { dx, dy } = this.input.consumeMouseDelta();
    const scale = SENS_SCALE * this.input.sensitivity * this.input.zoomSensitivityScale;
    this.yaw -= dx * scale;
    this.pitch -= dy * scale;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  /**
   * Compute wishSpeed from current input direction + stance.
   *
   * Asymmetric per-axis caps:
   *   pure W → RUN, pure A/D → STRAFE, pure S → BACK.
   * Diagonals get an elliptical blend so W+D is ~6.85 and S+D is ~6.30.
   *
   * Stance overrides: slide / crouch / walk apply a fixed cap regardless of
   * direction, which is how CS handles it.
   */
  private computeGroundWishSpeed(): number {
    if (this.isSliding) {
      return SLIDE_BOOST_CAP;
    }
    if (this.isCrouching) {
      return CROUCH_SPEED;
    }
    if (this.isWalking) {
      return WALK_SPEED;
    }

    const fwd = this._wishLocalFwd;
    const strafe = this._wishLocalStrafe;
    if (fwd === 0 && strafe === 0) return 0;

    const fwdCap = fwd > 0 ? RUN_SPEED : BACK_SPEED;
    // Elliptical wishSpeed: evaluate (cos² × strafeCap² + sin² × fwdCap²) on
    // the *unit* direction in local axes.
    const len2 = fwd * fwd + strafe * strafe;
    const len  = Math.sqrt(len2);
    const ufwd = fwd / len;
    const ustr = strafe / len;
    return Math.sqrt((ustr * STRAFE_SPEED) ** 2 + (ufwd * fwdCap) ** 2);
  }

  /**
   * CS-style friction: subtract `friction × max(speed, STOP_SPEED) × dt` from
   * speed. The max() makes friction "feel" snappy at low speeds — instead of
   * an asymptotic crawl to zero, you actually stop.
   */
  private applyFriction(dt: number) {
    const speed = this.speed;
    if (speed < 1e-4) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }
    const control = Math.max(speed, STOP_SPEED);
    const drop = control * FRICTION * dt;
    const newSpeed = Math.max(0, speed - drop) / speed;
    this.velocity.x *= newSpeed;
    this.velocity.z *= newSpeed;
  }

  /**
   * Classic accelerate(): project velocity onto wishDir, add only enough
   * speed to reach wishSpeed (capped by accel × dt). The asymmetry between
   * GROUND_ACCEL (90, very high) and AIR_ACCEL (14, very low) is what
   * differentiates the two phases.
   */
  private accelerate(wishDir: THREE.Vector3, wishSpeed: number, accel: number, dt: number) {
    if (wishDir.lengthSq() === 0) return;
    const currentSpeed = this.velocity.x * wishDir.x + this.velocity.z * wishDir.z;
    const addSpeed = wishSpeed - currentSpeed;
    if (addSpeed <= 0) return;
    let accelSpeed = accel * dt * wishSpeed;
    if (accelSpeed > addSpeed) accelSpeed = addSpeed;
    this.velocity.x += wishDir.x * accelSpeed;
    this.velocity.z += wishDir.z * accelSpeed;
  }

  private clampHorizontalSpeed(cap: number) {
    const h = this.speed;
    if (h > cap) {
      const k = cap / h;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }
  }

  /**
   * Zero the component of horizontal velocity along the given camera-frame
   * axis. Used by counter-strafe: if `axis = camRight`, this kills the
   * left/right component of motion in one shot.
   */
  private zeroAxisInCameraFrame(axis: THREE.Vector3) {
    const dot = this.velocity.x * axis.x + this.velocity.z * axis.z;
    this.velocity.x -= axis.x * dot;
    this.velocity.z -= axis.z * dot;
  }

  // ── Collision (unchanged from prior implementation, retained for parity) ───

  /**
   * Swept-AABB movement with auto step-up. See prior commit history for the
   * detailed derivation — the algorithm is the standard "try flat, on block
   * retry lifted, drop back down" pattern from Source/Quake.
   */
  private moveWithCollision(dt: number) {
    const half = this.isCrouching || this.isSliding ? PLAYER_HALF_EXTENT_CROUCH : PLAYER_HALF_EXTENT;
    const wasGrounded = this.grounded;

    const startX = this.position.x;
    const startZ = this.position.z;
    const startVX = this.velocity.x;
    const startVZ = this.velocity.z;
    const dx = startVX * dt;
    const dz = startVZ * dt;

    this.position.x += dx;
    this.resolveAxisCollision(half, 'x');
    const blockedX = this.velocity.x === 0 && Math.abs(dx) > 1e-6;
    this.position.z += dz;
    this.resolveAxisCollision(half, 'z');
    const blockedZ = this.velocity.z === 0 && Math.abs(dz) > 1e-6;

    if (wasGrounded && (blockedX || blockedZ)) {
      const flatEndX = this.position.x;
      const flatEndZ = this.position.z;
      this.position.x = startX;
      this.position.z = startZ;
      this.position.y += STEP_HEIGHT;
      if (this.world.firstOverlap(this.position, half) !== null) {
        this.position.y -= STEP_HEIGHT;
        this.position.x = flatEndX;
        this.position.z = flatEndZ;
      } else {
        this.velocity.x = startVX;
        this.velocity.z = startVZ;
        this.position.x += dx;
        this.resolveAxisCollision(half, 'x');
        this.position.z += dz;
        this.resolveAxisCollision(half, 'z');
        const dropFrom = this.position.y;
        this.position.y -= STEP_HEIGHT + 0.02;
        this.resolveAxisCollision(half, 'y');
        if (this.position.y < dropFrom - STEP_HEIGHT - 0.02) {
          this.position.y = dropFrom - STEP_HEIGHT - 0.02;
        }
      }
    }

    this.position.y += this.velocity.y * dt;
    this.grounded = false;
    this.resolveAxisCollision(half, 'y');

    if (this.grounded) {
      const pad = this.world.getJumpPadBoostAt(this.position, half);
      if (pad > 0) {
        this.velocity.y = pad;
        this.grounded = false;
        this.audioJumpPad = true;
      }
    }

    if (this.grounded && !wasGrounded) {
      this.timeSinceLanded = 0;
      this.audioLanded = true;
      // Landing counts as a footfall; reset stride so the next step is a full
      // stride away (avoids an immediate double step on landing).
      this.footstepAccum = 0;
    }

    // Footstep cadence — accumulate ground distance while moving; latch a
    // footstep each full stride. Airborne or near-stationary = no steps.
    const hSpeed = this.speed;
    if (this.grounded && hSpeed >= FOOTSTEP_MIN_SPEED) {
      // Crouch-walking lengthens the stride (slower, quieter gait).
      const stride = this.isCrouching ? FOOTSTEP_STRIDE * 1.5 : FOOTSTEP_STRIDE;
      this.footstepAccum += hSpeed * dt;
      if (this.footstepAccum >= stride) {
        this.footstepAccum -= stride;
        this.audioFootstep = true;
      }
    } else {
      // Bleed the accumulator down when stopped so a stop-start doesn't fire
      // instantly, but don't fully zero (keeps cadence natural on micro-pauses).
      this.footstepAccum = Math.max(0, this.footstepAccum - hSpeed * dt);
    }
  }

  private resolveAxisCollision(half: THREE.Vector3, axis: 'x' | 'y' | 'z') {
    const aabb = this.world.firstOverlap(this.position, half);
    if (!aabb) return;

    let playerMin: number;
    let playerMax: number;
    if (axis === 'y') {
      playerMin = this.position.y;
      playerMax = this.position.y + half.y * 2;
    } else {
      playerMin = this.position[axis] - half[axis];
      playerMax = this.position[axis] + half[axis];
    }
    const boxMin = aabb.min[axis];
    const boxMax = aabb.max[axis];

    const overlapNeg = playerMax - boxMin;
    const overlapPos = boxMax - playerMin;

    if (overlapNeg < overlapPos) {
      this.position[axis] -= overlapNeg;
      if (axis === 'y' && this.velocity.y > 0) this.velocity.y = 0;
      else if (axis !== 'y') this.velocity[axis] = 0;
    } else {
      this.position[axis] += overlapPos;
      if (axis === 'y') {
        if (this.velocity.y < 0) this.grounded = true;
        this.velocity.y = 0;
      } else {
        this.velocity[axis] = 0;
      }
    }
  }
}
