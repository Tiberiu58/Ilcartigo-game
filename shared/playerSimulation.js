import { PLAYER_CONFIG } from "../config.js"
import { getGroundInfoAt, moveCircle } from "./arena.js"
import { clamp, dot3, length2D, moveTowards, normalize2D, scale3, subtract3 } from "./math.js"

function projectGroundMovement(targetX, targetZ, groundInfo) {
  if (!groundInfo.walkable || groundInfo.normal.y >= 0.999) {
    return { x: targetX, z: targetZ }
  }

  const projectedMove = { x: targetX, y: 0, z: targetZ }
  const normalDot = dot3(projectedMove, groundInfo.normal)
  const correction = scale3(groundInfo.normal, normalDot)
  const result = subtract3(projectedMove, correction)
  return { x: result.x, z: result.z }
}

function approachHorizontalVelocity(state, targetX, targetZ, acceleration, dt) {
  const deltaX = targetX - state.velocity.x
  const deltaZ = targetZ - state.velocity.z
  const deltaLength = length2D(deltaX, deltaZ)

  if (deltaLength < 0.0001) {
    state.velocity.x = targetX
    state.velocity.z = targetZ
    return
  }

  const maxStep = acceleration * dt
  const scale = Math.min(1, maxStep / deltaLength)
  state.velocity.x += deltaX * scale
  state.velocity.z += deltaZ * scale

  if (targetX === 0) {
    state.velocity.x = moveTowards(state.velocity.x, 0, PLAYER_CONFIG.groundDeceleration * dt)
  }

  if (targetZ === 0) {
    state.velocity.z = moveTowards(state.velocity.z, 0, PLAYER_CONFIG.groundDeceleration * dt)
  }
}

function applyGroundMovement(state, targetX, targetZ, hasMovementInput, dt) {
  const targetDot = state.velocity.x * targetX + state.velocity.z * targetZ
  const acceleration = !hasMovementInput
    ? PLAYER_CONFIG.groundDeceleration
    : targetDot < 0
      ? PLAYER_CONFIG.groundTurnAcceleration
      : PLAYER_CONFIG.groundAcceleration

  approachHorizontalVelocity(state, targetX, targetZ, acceleration, dt)
}

function applyAirMovement(state, targetX, targetZ, hasMovementInput, dt) {
  if (!hasMovementInput) {
    return
  }

  const wishDirection = normalize2D(targetX, targetZ)
  const currentSpeedAlongWish = state.velocity.x * wishDirection.x + state.velocity.z * wishDirection.z
  const addSpeed = PLAYER_CONFIG.airMoveSpeed - currentSpeedAlongWish

  if (addSpeed > 0) {
    const accelerationStep = Math.min(addSpeed, PLAYER_CONFIG.airAcceleration * dt)
    state.velocity.x += wishDirection.x * accelerationStep
    state.velocity.z += wishDirection.z * accelerationStep
  }

  const horizontalSpeed = length2D(state.velocity.x, state.velocity.z)
  if (horizontalSpeed > 0.001) {
    const desiredX = wishDirection.x * horizontalSpeed
    const desiredZ = wishDirection.z * horizontalSpeed
    const steerAmount = Math.min(1, PLAYER_CONFIG.airControl * dt)
    state.velocity.x += (desiredX - state.velocity.x) * steerAmount
    state.velocity.z += (desiredZ - state.velocity.z) * steerAmount
  }

  const cappedSpeed = length2D(state.velocity.x, state.velocity.z)
  if (cappedSpeed > PLAYER_CONFIG.airSpeedCap) {
    const scale = PLAYER_CONFIG.airSpeedCap / cappedSpeed
    state.velocity.x *= scale
    state.velocity.z *= scale
  }
}

export function createSimulationState(spawn) {
  return {
    position: { x: spawn.x, y: spawn.y, z: spawn.z },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeldLast: false,
  }
}

export function stepPlayerSimulation(state, input, dt) {
  state.yaw = input.yaw
  state.pitch = input.pitch

  const axes = normalize2D(input.right, input.forward)
  const hasMovementInput = input.right !== 0 || input.forward !== 0
  const moveSpeed = input.sprinting && hasMovementInput ? PLAYER_CONFIG.sprintSpeed : PLAYER_CONFIG.walkSpeed
  const jumpPressed = Boolean(input.jumpPressed || (input.jumpHeld && !state.jumpHeldLast))
  state.jumpHeldLast = Boolean(input.jumpHeld)

  if (jumpPressed) {
    state.jumpBufferTimer = PLAYER_CONFIG.jumpBufferTime
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt)
  }

  state.coyoteTimer = state.grounded
    ? PLAYER_CONFIG.coyoteTime
    : Math.max(0, state.coyoteTimer - dt)

  const forwardX = Math.sin(state.yaw)
  const forwardZ = Math.cos(state.yaw)
  const rightX = forwardZ
  const rightZ = -forwardX
  const targetX = hasMovementInput
    ? (forwardX * axes.z + rightX * axes.x) * moveSpeed
    : 0
  const targetZ = hasMovementInput
    ? (forwardZ * axes.z + rightZ * axes.x) * moveSpeed
    : 0

  const groundInfoBeforeMove = getGroundInfoAt(state.position.x, state.position.z, state.position.y)
  const slopeAdjustedTarget = projectGroundMovement(targetX, targetZ, groundInfoBeforeMove)

  if (state.grounded) {
    applyGroundMovement(state, slopeAdjustedTarget.x, slopeAdjustedTarget.z, hasMovementInput, dt)
  } else {
    applyAirMovement(state, targetX, targetZ, hasMovementInput, dt)
  }

  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.velocity.y = PLAYER_CONFIG.jumpSpeed
    state.grounded = false
    state.coyoteTimer = 0
    state.jumpBufferTimer = 0
  }

  let gravityMultiplier = 1
  if (state.velocity.y < 0) {
    gravityMultiplier = PLAYER_CONFIG.fallGravityMultiplier
  } else if (state.velocity.y > 0 && !input.jumpHeld) {
    gravityMultiplier = PLAYER_CONFIG.lowJumpGravityMultiplier
  }

  state.velocity.y -= PLAYER_CONFIG.gravity * gravityMultiplier * dt

  const moved = moveCircle(
    state.position,
    { x: state.velocity.x * dt, y: 0, z: state.velocity.z * dt },
    PLAYER_CONFIG.radius - PLAYER_CONFIG.collisionInset,
    { stepSize: PLAYER_CONFIG.collisionStep }
  )
  state.position.x = moved.x
  state.position.z = moved.z
  state.position.y += state.velocity.y * dt

  const maxFeetY = 5.4 - PLAYER_CONFIG.height
  if (state.position.y > maxFeetY) {
    state.position.y = maxFeetY
    state.velocity.y = Math.min(0, state.velocity.y)
  }

  const groundInfo = getGroundInfoAt(state.position.x, state.position.z, state.position.y)
  const groundHeight = groundInfo.height
  const canSnapToGround = groundInfo.walkable
    && state.velocity.y <= 0
    && state.position.y <= groundHeight + PLAYER_CONFIG.groundSnapDistance

  if (canSnapToGround) {
    state.position.y = groundHeight
    state.velocity.y = 0
    state.grounded = true
    state.coyoteTimer = PLAYER_CONFIG.coyoteTime
  } else {
    state.grounded = false
  }

  state.pitch = clamp(state.pitch, -PLAYER_CONFIG.maxPitch, PLAYER_CONFIG.maxPitch)
  return state
}
