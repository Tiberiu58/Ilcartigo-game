import { PLAYER_CONFIG, TELEPORT_CONFIG, WEAPON_CONFIG, getWeaponDefinition } from "../config.js"
import {
  canOccupyPosition,
  computeTeleportMarkerTarget,
  getGroundInfoAt,
  getLookDirection,
  getPlayerShootOrigin,
  getSpawnPoint,
  raycastWalls,
  validateTeleportTarget,
} from "../shared/arena.js"
import { createPlayerState, getPlayerSnapshot, MULTIPLAYER_CONFIG, respawnPlayerState } from "../shared/gameRules.js"
import { raySphereIntersection } from "../shared/math.js"
import { MESSAGE_TYPES, serializeMessage } from "../shared/protocol.js"
import { stepPlayerSimulation } from "../shared/playerSimulation.js"

const DEBUG_SHOOTING = false
const PLAYER_HITBOX_RADIUS = PLAYER_CONFIG.radius + 0.34

export class Match {
  constructor(roomId, roomManager) {
    this.roomId = roomId
    this.roomManager = roomManager
    this.players = new Map()
    this.hostId = ""
    this.started = false
    this.lastTickAt = performance.now()
    this.accumulator = 0
    this.simulationInterval = 1000 / MULTIPLAYER_CONFIG.simulationRate
    this.snapshotAccumulator = 0
    this.snapshotInterval = 1000 / MULTIPLAYER_CONFIG.snapshotRate
  }

  addPlayer(client) {
    const state = createPlayerState(client.id, this.players.size)
    state.roomId = this.roomId
    client.roomId = this.roomId
    client.inputState = this.createNeutralInputState()
    client.playerState = state
    this.players.set(client.id, client)
    if (!this.hostId) {
      this.hostId = client.id
    }

    client.send(MESSAGE_TYPES.ROOM_JOINED, {
      roomId: this.roomId,
      playerId: client.id,
      hostId: this.hostId,
      started: this.started,
      player: getPlayerSnapshot(state),
      players: this.getSnapshots(),
    })

    this.broadcastRoomState()
  }

  removePlayer(clientId) {
    const client = this.players.get(clientId)
    if (!client) {
      return
    }

    this.players.delete(clientId)
    if (this.hostId === clientId) {
      this.hostId = this.players.size > 0 ? [...this.players.keys()][0] : ""
    }
    this.broadcast(MESSAGE_TYPES.PLAYER_LEFT, { roomId: this.roomId, playerId: clientId })
    this.broadcastRoomState()

    if (this.players.size === 0) {
      this.roomManager.deleteRoom(this.roomId)
    }
  }

  createNeutralInputState() {
    return {
      forward: 0,
      right: 0,
      sprinting: false,
      jumpHeld: false,
      jumpPressed: false,
      yaw: 0,
      pitch: 0,
      weaponId: null,
    }
  }

  handleMessage(client, message) {
    switch (message.type) {
      case MESSAGE_TYPES.INPUT:
        this.handleInput(client, message)
        break
      case MESSAGE_TYPES.FIRE:
        this.handleFire(client, message)
        break
      case MESSAGE_TYPES.RELOAD:
        this.handleReload(client)
        break
      case MESSAGE_TYPES.SWITCH_WEAPON:
        this.handleWeaponSwitch(client, message.weaponId)
        break
      case MESSAGE_TYPES.TELEPORT_PLACE:
        this.handleTeleportPlace(client)
        break
      case MESSAGE_TYPES.TELEPORT_USE:
        this.handleTeleportUse(client)
        break
      case MESSAGE_TYPES.LEAVE_ROOM:
        this.removePlayer(client.id)
        break
      case MESSAGE_TYPES.START_MATCH:
        this.handleStartMatch(client)
        break
      default:
        break
    }
  }

  handleStartMatch(client) {
    if (client.id !== this.hostId) {
      client.send(MESSAGE_TYPES.ERROR, { message: "Only the host can start the match." })
      return
    }

    if (this.started) {
      client.send(MESSAGE_TYPES.ERROR, { message: "Match already started." })
      return
    }

    this.started = true
    for (const roomClient of this.players.values()) {
      if (!roomClient.playerState) {
        continue
      }
      respawnPlayerState(roomClient.playerState, this.getPlayerIndex(roomClient.id))
      roomClient.inputState = this.createNeutralInputState()
    }

    console.log(`[match ${this.roomId}] host ${client.id} started match with ${this.players.size} players`)
    this.broadcastRoomState()
    this.broadcast(MESSAGE_TYPES.SNAPSHOT, {
      roomId: this.roomId,
      players: this.getSnapshots(),
    })
  }

  getPlayerIndex(clientId) {
    return [...this.players.keys()].findIndex((id) => id === clientId)
  }

  handleInput(client, message) {
    if (!this.started || !client.playerState) {
      return
    }

    client.inputState = {
      forward: Number(message.forward) || 0,
      right: Number(message.right) || 0,
      sprinting: Boolean(message.sprinting),
      jumpHeld: Boolean(message.jumpHeld),
      jumpPressed: Boolean(message.jumpPressed),
      yaw: Number(message.yaw) || 0,
      pitch: Number(message.pitch) || 0,
      weaponId: typeof message.weaponId === "string" ? message.weaponId : null,
    }
  }

  handleWeaponSwitch(client, weaponId) {
    if (!this.started || !client.playerState || !weaponId) {
      return
    }

    const definition = getWeaponDefinition(weaponId)
    if (definition.id !== client.playerState.weapon.weaponId) {
      client.playerState.weaponInventory[client.playerState.weapon.weaponId] = {
        ...client.playerState.weapon,
      }
      client.playerState.weapon = {
        ...(client.playerState.weaponInventory[definition.id] || {
          weaponId: definition.id,
          clipAmmo: definition.stats.clipSize,
          reserveAmmo: definition.stats.reserveAmmo,
          cooldown: 0,
          reloadEndAt: 0,
        }),
      }
    }
  }

  getWeaponStats(weaponId) {
    const definition = getWeaponDefinition(weaponId)
    return {
      ...WEAPON_CONFIG,
      ...definition.stats,
      fireInterval: definition.stats.fireRate ?? WEAPON_CONFIG.fireInterval,
    }
  }

  handleReload(client) {
    const state = client.playerState
    if (!this.started || !state || !state.alive) {
      return
    }

    const definition = getWeaponDefinition(state.weapon.weaponId)
    if (state.weapon.reloadEndAt > 0) {
      return
    }

    if (state.weapon.clipAmmo >= definition.stats.clipSize || state.weapon.reserveAmmo <= 0) {
      return
    }

    state.weapon.reloadEndAt = definition.stats.reloadTime
    state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }
  }

  completeReloads(dt) {
    for (const client of this.players.values()) {
      const state = client.playerState
      if (!state || !state.alive || state.weapon.reloadEndAt <= 0) {
        continue
      }

      state.weapon.reloadEndAt = Math.max(0, state.weapon.reloadEndAt - dt)
      if (state.weapon.reloadEndAt === 0) {
        const definition = getWeaponDefinition(state.weapon.weaponId)
        const needed = definition.stats.clipSize - state.weapon.clipAmmo
        const amount = Math.min(needed, state.weapon.reserveAmmo)
        state.weapon.clipAmmo += amount
        state.weapon.reserveAmmo -= amount
      }

      state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }
    }
  }

  handleFire(client, message = {}) {
    const state = client.playerState
    if (!this.started || !state || !state.alive) {
      this.logShot("rejected", { shooterId: client.id, reason: "match not started or shooter dead" })
      return
    }

    const stats = this.getWeaponStats(state.weapon.weaponId)
    if (state.weapon.reloadEndAt > 0 || state.weapon.cooldown > 0 || state.weapon.clipAmmo <= 0) {
      this.logShot("rejected", { shooterId: client.id, reason: "weapon unavailable" })
      return
    }

    state.weapon.clipAmmo -= 1
    state.weapon.cooldown = stats.fireInterval
    state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }

    if (Number.isFinite(message.yaw)) {
      state.yaw = Number(message.yaw)
    }
    if (Number.isFinite(message.pitch)) {
      state.pitch = Math.max(-PLAYER_CONFIG.maxPitch, Math.min(PLAYER_CONFIG.maxPitch, Number(message.pitch)))
    }

    const origin = getPlayerShootOrigin(state)
    const direction = getLookDirection(state.yaw, state.pitch)

    // Server-owned hitscan order:
    // 1. Find the nearest wall along the shot.
    // 2. Test every other alive player's virtual capsule only up to that wall distance.
    // This makes walls block bullets while still allowing players in open line of sight to be hit.
    const wallDistance = raycastWalls(origin, direction, stats.range)
    let bestClient = null
    let bestDistance = wallDistance

    this.logShot("fired", {
      shooterId: client.id,
      weaponId: state.weapon.weaponId,
      origin,
      direction,
      wallDistance,
      range: stats.range,
    })

    for (const target of this.players.values()) {
      if (target.id === client.id || !target.playerState?.alive) {
        continue
      }

      const hitDistance = this.raycastPlayerCapsule(origin, direction, target.playerState, bestDistance)

      if (hitDistance < bestDistance) {
        bestDistance = hitDistance
        bestClient = target
      }
    }

    if (!bestClient) {
      this.logShot("miss", {
        shooterId: client.id,
        blockedByWall: wallDistance < stats.range,
        wallDistance,
      })
      return
    }

    bestClient.playerState.health = Math.max(0, bestClient.playerState.health - stats.damage)
    this.logShot("hit", {
      shooterId: client.id,
      victimId: bestClient.id,
      distance: bestDistance,
      damage: stats.damage,
      health: bestClient.playerState.health,
    })
    this.broadcast(MESSAGE_TYPES.DAMAGE, {
      roomId: this.roomId,
      attackerId: client.id,
      victimId: bestClient.id,
      amount: stats.damage,
      health: bestClient.playerState.health,
    })

    if (bestClient.playerState.health <= 0) {
      bestClient.playerState.alive = false
      bestClient.playerState.respawnAt = MULTIPLAYER_CONFIG.respawnDelay
      bestClient.playerState.teleportMarker = null
      this.logShot("death", {
        shooterId: client.id,
        victimId: bestClient.id,
        respawnDelay: MULTIPLAYER_CONFIG.respawnDelay,
      })
      this.broadcast(MESSAGE_TYPES.DEATH, {
        roomId: this.roomId,
        attackerId: client.id,
        victimId: bestClient.id,
        respawnDelay: MULTIPLAYER_CONFIG.respawnDelay,
      })
    }

    this.broadcast(MESSAGE_TYPES.SNAPSHOT, {
      roomId: this.roomId,
      players: this.getSnapshots(),
    })
  }

  raycastPlayerCapsule(origin, direction, targetState, maxDistance) {
    if (!targetState?.alive || maxDistance <= 0) {
      return Infinity
    }

    // Lightweight capsule approximation: three overlapping spheres from torso to head.
    // The server uses this virtual hitbox instead of trusting client-side Babylon meshes.
    const sampleHeights = [
      PLAYER_CONFIG.eyeHeight * 0.25,
      PLAYER_CONFIG.eyeHeight * 0.62,
      PLAYER_CONFIG.eyeHeight * 0.95,
    ]
    let bestDistance = Infinity

    for (const height of sampleHeights) {
      const hitDistance = raySphereIntersection(
        origin,
        direction,
        {
          x: targetState.position.x,
          y: targetState.position.y + height,
          z: targetState.position.z,
        },
        PLAYER_HITBOX_RADIUS,
        maxDistance
      )

      if (hitDistance < bestDistance) {
        bestDistance = hitDistance
      }
    }

    return bestDistance
  }

  logShot(event, details = {}) {
    if (!DEBUG_SHOOTING) {
      return
    }

    console.log(`[match ${this.roomId}] shot:${event}`, details)
  }

  handleTeleportPlace(client) {
    const state = client.playerState
    if (!this.started || !state || !state.alive || state.weapon.reloadEndAt > 0) {
      return
    }

    if (state.teleportCooldown > 0) {
      return
    }

    const targetInfo = computeTeleportMarkerTarget(state)
    if (!targetInfo.valid) {
      return
    }

    state.teleportMarker = { x: targetInfo.x, z: targetInfo.z }
  }

  handleTeleportUse(client) {
    const state = client.playerState
    if (!this.started || !state || !state.alive || !state.teleportMarker) {
      return
    }

    if (state.teleportCooldown > 0) {
      return
    }

    const radius = PLAYER_CONFIG.radius + TELEPORT_CONFIG.clearancePadding
    const origin = {
      x: state.position.x,
      y: state.position.y + PLAYER_CONFIG.eyeHeight,
      z: state.position.z,
    }
    const target = { x: state.teleportMarker.x, z: state.teleportMarker.z }
    if (!validateTeleportTarget(origin, target, radius)) {
      state.teleportMarker = null
      return
    }

    state.position.x = target.x
    state.position.z = target.z
    state.position.y = getGroundInfoAt(target.x, target.z, 5.4).height
    state.velocity.x = 0
    state.velocity.y = 0
    state.velocity.z = 0
    state.grounded = true
    state.coyoteTimer = PLAYER_CONFIG.coyoteTime
    state.teleportMarker = null
    state.teleportCooldown = TELEPORT_CONFIG.cooldown
    state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }
  }

  tick(now = performance.now()) {
    if (!this.started) {
      return
    }

    const elapsed = now - this.lastTickAt
    this.lastTickAt = now
    this.accumulator += elapsed
    this.snapshotAccumulator += elapsed

    while (this.accumulator >= this.simulationInterval) {
      const dt = this.simulationInterval / 1000
      this.accumulator -= this.simulationInterval
      this.step(dt)
    }

    if (this.snapshotAccumulator >= this.snapshotInterval) {
      this.snapshotAccumulator = 0
      this.broadcast(MESSAGE_TYPES.SNAPSHOT, {
        roomId: this.roomId,
        players: this.getSnapshots(),
      })
    }
  }

  step(dt) {
    this.completeReloads(dt)

    for (const client of this.players.values()) {
      const state = client.playerState
      if (!state) {
        continue
      }

      state.weapon.cooldown = Math.max(0, state.weapon.cooldown - dt)
      state.teleportCooldown = Math.max(0, (state.teleportCooldown || 0) - dt)

      if (!state.alive) {
        if (state.respawnAt > 0) {
          state.respawnAt = Math.max(0, state.respawnAt - dt)
          if (state.respawnAt === 0) {
            respawnPlayerState(state, this.getRespawnIndex(client.id))
            this.logShot("respawn", {
              playerId: client.id,
              position: state.position,
              health: state.health,
            })
            this.broadcast(MESSAGE_TYPES.RESPAWN, {
              roomId: this.roomId,
              player: getPlayerSnapshot(state),
            })
          }
        }
        continue
      }

      if (client.inputState.weaponId) {
        this.handleWeaponSwitch(client, client.inputState.weaponId)
      }

      stepPlayerSimulation(state, client.inputState, dt)
      client.inputState.jumpPressed = false
      state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }

      if (!canOccupyPosition(state.position.x, state.position.z, PLAYER_CONFIG.radius, state.position.y)) {
        const fallback = state.lastSafePosition || getSpawnPoint(this.getRespawnIndex(client.id))
        console.warn(
          `[match ${this.roomId}] invalid occupancy for ${client.id} at `
          + `(${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)}) `
          + `-> rolling back to (${fallback.x.toFixed(2)}, ${fallback.y.toFixed(2)}, ${fallback.z.toFixed(2)})`
        )
        state.position.x = fallback.x
        state.position.y = fallback.y
        state.position.z = fallback.z
        state.velocity.x = 0
        state.velocity.y = 0
        state.velocity.z = 0
      } else {
        state.lastSafePosition = {
          x: state.position.x,
          y: state.position.y,
          z: state.position.z,
        }
      }
    }
  }

  getRespawnIndex(id) {
    const ids = [...this.players.keys()].sort()
    return Math.max(0, ids.indexOf(id))
  }

  getSnapshots() {
    return [...this.players.values()].map((client) => getPlayerSnapshot(client.playerState))
  }

  broadcastRoomState() {
    this.broadcast(MESSAGE_TYPES.ROOM_STATE, {
      roomId: this.roomId,
      hostId: this.hostId,
      started: this.started,
      players: this.getSnapshots(),
    })
  }

  broadcast(type, payload, excludeId = null) {
    for (const client of this.players.values()) {
      if (client.id === excludeId) {
        continue
      }
      client.send(type, payload)
    }
  }
}
