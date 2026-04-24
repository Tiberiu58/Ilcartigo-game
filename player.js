import { BABYLON } from "./babylon.js"
import { PLAYER_CONFIG } from "./config.js"
import { clamp, damp, length2D, moveTowards, normalize2D } from "./utils.js"

export class PlayerController {
  constructor(scene, input, level) {
    this.scene = scene
    this.input = input
    this.level = level

    this.camera = new BABYLON.UniversalCamera(
      "playerCamera",
      new BABYLON.Vector3(0, PLAYER_CONFIG.eyeHeight, 0),
      scene
    )
    this.camera.inputs.clear()
    this.camera.minZ = 0.05
    this.camera.fov = BABYLON.Tools.ToRadians(72)

    this.position = new BABYLON.Vector3()
    this.velocity = new BABYLON.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.grounded = true
    this.health = PLAYER_CONFIG.maxHealth
    this.bobPhase = 0
    this.bob = 0
    this.visualBob = 0
    this.visualBobSide = 0
    this.landingImpact = 0
    this.viewKickPitch = 0
    this.viewKickYaw = 0
    this.viewRoll = 0
    this.moveAmount = 0
    this.sprinting = false
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
    this.horizontalDelta = new BABYLON.Vector3()
    this.centerPosition = new BABYLON.Vector3()
    this.shootOrigin = new BABYLON.Vector3()
    this.groundNormal = new BABYLON.Vector3(0, 1, 0)
    this.projectedMove = new BABYLON.Vector3()
  }

  reset(spawn) {
    this.position.copyFrom(spawn)
    this.velocity.set(0, 0, 0)
    this.yaw = 0
    this.pitch = 0
    this.health = PLAYER_CONFIG.maxHealth
    this.grounded = true
    this.bobPhase = 0
    this.bob = 0
    this.visualBob = 0
    this.visualBobSide = 0
    this.landingImpact = 0
    this.viewKickPitch = 0
    this.viewKickYaw = 0
    this.viewRoll = 0
    this.moveAmount = 0
    this.sprinting = false
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
    this.groundNormal.set(0, 1, 0)
    this.updateCamera()
  }

  update(dt) {
    const look = this.input.consumeLookDelta()
    const lookX = clamp(look.x, -PLAYER_CONFIG.maxLookDeltaPerFrame, PLAYER_CONFIG.maxLookDeltaPerFrame)
    const lookY = clamp(look.y, -PLAYER_CONFIG.maxLookDeltaPerFrame, PLAYER_CONFIG.maxLookDeltaPerFrame)

    // Pointer-lock aim stays immediate, but very large single-frame spikes are
    // clamped so focus changes do not yank the camera.
    this.yaw += lookX * PLAYER_CONFIG.mouseSensitivity
    const lookDirection = PLAYER_CONFIG.invertLookY ? -1 : 1
    this.pitch = clamp(
      this.pitch + lookY * PLAYER_CONFIG.mouseSensitivity * lookDirection,
      -PLAYER_CONFIG.maxPitch,
      PLAYER_CONFIG.maxPitch
    )

    const axes = this.input.getMoveAxes()
    const inputVector = normalize2D(axes.right, axes.forward)
    const hasMovementInput = axes.right !== 0 || axes.forward !== 0
    const moveSpeed = this.input.isSprinting() && hasMovementInput
      ? PLAYER_CONFIG.sprintSpeed
      : PLAYER_CONFIG.walkSpeed

    this.sprinting = moveSpeed === PLAYER_CONFIG.sprintSpeed

    if (this.input.consumeJumpPressed()) {
      this.jumpBufferTimer = PLAYER_CONFIG.jumpBufferTime
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt)
    }

    // A small jump buffer plus coyote time keeps jumps feeling clean without
    // making movement heavy or forgiving in a sloppy way.
    this.coyoteTimer = this.grounded
      ? PLAYER_CONFIG.coyoteTime
      : Math.max(0, this.coyoteTimer - dt)

    // Movement is custom instead of using Babylon's built-in camera inputs so
    // jump, sprint, friction, and wall sliding stay predictable.
    const forwardX = Math.sin(this.yaw)
    const forwardZ = Math.cos(this.yaw)
    const rightX = forwardZ
    const rightZ = -forwardX
    const targetX = hasMovementInput
      ? (forwardX * inputVector.z + rightX * inputVector.x) * moveSpeed
      : 0
    const targetZ = hasMovementInput
      ? (forwardZ * inputVector.z + rightZ * inputVector.x) * moveSpeed
      : 0

    const groundInfoBeforeMove = this.level.getGroundInfoAt(this.position.x, this.position.z, this.position.y)
    this.groundNormal.copyFrom(groundInfoBeforeMove.normal)
    const slopeAdjustedTarget = this.projectGroundMovement(targetX, targetZ, groundInfoBeforeMove)
    const slopeTargetX = slopeAdjustedTarget.x
    const slopeTargetZ = slopeAdjustedTarget.z

    if (this.grounded) {
      this.applyGroundMovement(slopeTargetX, slopeTargetZ, hasMovementInput, dt)
    } else {
      this.applyAirMovement(targetX, targetZ, hasMovementInput, dt)
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.jump()
    }

    let gravityMultiplier = 1
    if (this.velocity.y < 0) {
      gravityMultiplier = PLAYER_CONFIG.fallGravityMultiplier
    } else if (this.velocity.y > 0 && !this.input.isJumpHeld()) {
      gravityMultiplier = PLAYER_CONFIG.lowJumpGravityMultiplier
    }

    this.velocity.y -= PLAYER_CONFIG.gravity * gravityMultiplier * dt

    this.horizontalDelta.set(this.velocity.x * dt, 0, this.velocity.z * dt)
    const moved = this.level.moveCircle(
      this.position,
      this.horizontalDelta,
      PLAYER_CONFIG.radius - PLAYER_CONFIG.collisionInset,
      { stepSize: PLAYER_CONFIG.collisionStep }
    )
    this.position.x = moved.x
    this.position.z = moved.z

    this.position.y += this.velocity.y * dt

    const maxFeetY = this.level.wallHeight - PLAYER_CONFIG.height
    if (this.position.y > maxFeetY) {
      this.position.y = maxFeetY
      this.velocity.y = Math.min(0, this.velocity.y)
    }

    const groundInfo = this.level.getGroundInfoAt(this.position.x, this.position.z, this.position.y)
    const groundHeight = groundInfo.height
    const canSnapToGround = groundInfo.walkable
      && this.velocity.y <= 0
      && this.position.y <= groundHeight + PLAYER_CONFIG.groundSnapDistance

    if (canSnapToGround) {
      if (!this.grounded && this.velocity.y < -2) {
        this.landingImpact = clamp(
          Math.abs(this.velocity.y) * 0.0018,
          0,
          PLAYER_CONFIG.landingImpactAmount
        )
      }

      this.position.y = groundHeight
      this.velocity.y = 0
      this.grounded = true
      this.groundNormal.copyFrom(groundInfo.normal)
      this.coyoteTimer = PLAYER_CONFIG.coyoteTime
    } else {
      this.grounded = false
      this.groundNormal.set(0, 1, 0)
    }

    const horizontalSpeed = length2D(this.velocity.x, this.velocity.z)
    this.moveAmount = clamp(horizontalSpeed / PLAYER_CONFIG.sprintSpeed, 0, 1)

    if (this.grounded && horizontalSpeed > 0.2) {
      const sprintMultiplier = this.sprinting ? 1.2 : 1
      this.bobPhase += dt * PLAYER_CONFIG.bobSpeed * sprintMultiplier * (0.75 + this.moveAmount)
      this.bob = Math.sin(this.bobPhase) * PLAYER_CONFIG.bobAmount * this.moveAmount
    } else {
      this.bob = damp(this.bob, 0, PLAYER_CONFIG.bobSmoothing, dt)
    }

    this.visualBob = damp(this.visualBob, this.bob, PLAYER_CONFIG.bobSmoothing, dt)
    this.visualBobSide = damp(
      this.visualBobSide,
      Math.sin(this.bobPhase * 0.5) * PLAYER_CONFIG.bobSideAmount * this.moveAmount,
      PLAYER_CONFIG.bobSmoothing,
      dt
    )
    this.landingImpact = damp(this.landingImpact, 0, PLAYER_CONFIG.landingImpactSmoothing, dt)
    this.viewKickPitch = damp(this.viewKickPitch, 0, 18, dt)
    this.viewKickYaw = damp(this.viewKickYaw, 0, 14, dt)
    this.viewRoll = damp(this.viewRoll, 0, 12, dt)

    this.updateCamera()
  }

  applyGroundMovement(targetX, targetZ, hasMovementInput, dt) {
    const targetDot = this.velocity.x * targetX + this.velocity.z * targetZ
    const acceleration = !hasMovementInput
      ? PLAYER_CONFIG.groundDeceleration
      : targetDot < 0
        ? PLAYER_CONFIG.groundTurnAcceleration
        : PLAYER_CONFIG.groundAcceleration

    this.approachHorizontalVelocity(targetX, targetZ, acceleration, dt)
  }

  projectGroundMovement(targetX, targetZ, groundInfo) {
    if (!groundInfo.walkable || groundInfo.normal.y >= 0.999) {
      return { x: targetX, z: targetZ }
    }

    this.projectedMove.set(targetX, 0, targetZ)
    const normalDot = BABYLON.Vector3.Dot(this.projectedMove, groundInfo.normal)
    this.projectedMove.subtractInPlace(groundInfo.normal.scale(normalDot))

    return {
      x: this.projectedMove.x,
      z: this.projectedMove.z,
    }
  }

  applyAirMovement(targetX, targetZ, hasMovementInput, dt) {
    if (!hasMovementInput) {
      return
    }

    const wishDirection = normalize2D(targetX, targetZ)
    const currentSpeedAlongWish = this.velocity.x * wishDirection.x + this.velocity.z * wishDirection.z
    const addSpeed = PLAYER_CONFIG.airMoveSpeed - currentSpeedAlongWish

    if (addSpeed > 0) {
      const accelerationStep = Math.min(addSpeed, PLAYER_CONFIG.airAcceleration * dt)
      this.velocity.x += wishDirection.x * accelerationStep
      this.velocity.z += wishDirection.z * accelerationStep
    }

    // Air steering is intentionally limited so you can shape jumps without
    // erasing momentum every frame.
    const horizontalSpeed = length2D(this.velocity.x, this.velocity.z)
    if (horizontalSpeed > 0.001) {
      const desiredX = wishDirection.x * horizontalSpeed
      const desiredZ = wishDirection.z * horizontalSpeed
      const steerAmount = Math.min(1, PLAYER_CONFIG.airControl * dt)

      this.velocity.x += (desiredX - this.velocity.x) * steerAmount
      this.velocity.z += (desiredZ - this.velocity.z) * steerAmount
    }

    const cappedSpeed = length2D(this.velocity.x, this.velocity.z)
    if (cappedSpeed > PLAYER_CONFIG.airSpeedCap) {
      const scale = PLAYER_CONFIG.airSpeedCap / cappedSpeed
      this.velocity.x *= scale
      this.velocity.z *= scale
    }
  }

  approachHorizontalVelocity(targetX, targetZ, acceleration, dt) {
    const deltaX = targetX - this.velocity.x
    const deltaZ = targetZ - this.velocity.z
    const deltaLength = length2D(deltaX, deltaZ)

    if (deltaLength < 0.0001) {
      this.velocity.x = targetX
      this.velocity.z = targetZ
      return
    }

    const maxStep = acceleration * dt
    const scale = Math.min(1, maxStep / deltaLength)
    this.velocity.x += deltaX * scale
    this.velocity.z += deltaZ * scale

    if (targetX === 0) {
      this.velocity.x = moveTowards(this.velocity.x, 0, PLAYER_CONFIG.groundDeceleration * dt)
    }

    if (targetZ === 0) {
      this.velocity.z = moveTowards(this.velocity.z, 0, PLAYER_CONFIG.groundDeceleration * dt)
    }
  }

  jump() {
    this.velocity.y = PLAYER_CONFIG.jumpSpeed
    this.grounded = false
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
  }

  teleportTo(x, z) {
    this.position.x = x
    this.position.z = z
    const groundInfo = this.level.getGroundInfoAt(x, z, this.level.wallHeight)
    this.position.y = groundInfo.height
    this.velocity.set(0, 0, 0)
    this.grounded = true
    this.groundNormal.copyFrom(groundInfo.normal)
    this.coyoteTimer = PLAYER_CONFIG.coyoteTime
    this.jumpBufferTimer = 0
    this.landingImpact = 0
    this.visualBob = 0
    this.visualBobSide = 0
    this.moveAmount = 0
    this.updateCamera()
  }

  updateCamera() {
    this.camera.position.copyFromFloats(
      this.position.x + this.visualBobSide,
      this.position.y + PLAYER_CONFIG.eyeHeight + this.visualBob - this.landingImpact,
      this.position.z
    )
    this.camera.rotation.copyFromFloats(
      this.pitch + this.viewKickPitch - this.landingImpact * 0.35,
      this.yaw + this.viewKickYaw,
      this.viewRoll
    )
  }

  addViewKick(pitchKick, yawKick) {
    this.viewKickPitch += pitchKick
    this.viewKickYaw += yawKick
  }

  applyDamage(amount) {
    this.health = Math.max(0, this.health - amount)
    this.viewKickPitch += 0.02
    this.viewRoll += (Math.random() - 0.5) * 0.06
  }

  setHealth(value) {
    this.health = clamp(value, 0, PLAYER_CONFIG.maxHealth)
  }

  reconcileAuthoritativeState(snapshot, dt) {
    if (!snapshot) {
      return
    }

    this.setHealth(snapshot.health)

    const positionError = Math.hypot(
      snapshot.position.x - this.position.x,
      snapshot.position.y - this.position.y,
      snapshot.position.z - this.position.z
    )

    if (positionError > 2.2) {
      this.position.x = snapshot.position.x
      this.position.y = snapshot.position.y
      this.position.z = snapshot.position.z
    } else {
      this.position.x = damp(this.position.x, snapshot.position.x, 18, dt)
      this.position.y = damp(this.position.y, snapshot.position.y, 18, dt)
      this.position.z = damp(this.position.z, snapshot.position.z, 18, dt)
    }

    this.velocity.x = snapshot.velocity.x
    this.velocity.y = snapshot.velocity.y
    this.velocity.z = snapshot.velocity.z
    this.grounded = snapshot.alive ? this.grounded : false
    this.yaw = snapshot.yaw
    this.pitch = snapshot.pitch
    this.updateCamera()
  }

  getHealth() {
    return Math.ceil(this.health)
  }

  isDead() {
    return this.health <= 0
  }

  isGrounded() {
    return this.grounded
  }

  isSprinting() {
    return this.sprinting
  }

  isAirborne() {
    return !this.grounded
  }

  getLocalMovement() {
    const forwardX = Math.sin(this.yaw)
    const forwardZ = Math.cos(this.yaw)
    const rightX = forwardZ
    const rightZ = -forwardX

    return {
      forward: this.velocity.x * forwardX + this.velocity.z * forwardZ,
      strafe: this.velocity.x * rightX + this.velocity.z * rightZ,
    }
  }

  getMaxMoveSpeed() {
    return this.sprinting ? PLAYER_CONFIG.sprintSpeed : PLAYER_CONFIG.walkSpeed
  }

  getMoveAmount() {
    return this.moveAmount
  }

  getViewBob() {
    return {
      x: this.visualBobSide / Math.max(PLAYER_CONFIG.bobSideAmount, 0.0001),
      y: this.visualBob - this.landingImpact,
    }
  }

  getShootOrigin() {
    this.shootOrigin.copyFrom(this.camera.position)
    return this.shootOrigin
  }

  getCenterPosition() {
    this.centerPosition.set(
      this.position.x,
      this.position.y + PLAYER_CONFIG.eyeHeight * 0.7,
      this.position.z
    )
    return this.centerPosition
  }

  getShootDirection(spread) {
    // Spread is applied in camera space so shots still track with mouse feel.
    const forward = this.camera.getForwardRay(1).direction
    const right = BABYLON.Vector3.Cross(forward, BABYLON.Axis.Y).normalize()
    const up = BABYLON.Vector3.Cross(right, forward).normalize()
    const spreadX = (Math.random() - 0.5) * spread * 2
    const spreadY = (Math.random() - 0.5) * spread * 2

    return forward
      .add(right.scale(spreadX))
      .add(up.scale(spreadY))
      .normalize()
  }

  getLookDirection() {
    return this.camera.getForwardRay(1).direction
  }
}
