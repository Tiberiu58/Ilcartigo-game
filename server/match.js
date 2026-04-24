import { ENEMY_CONFIG, PLAYER_CONFIG, TELEPORT_CONFIG, getWeaponDefinition } from "../config.js"
import {
  canOccupyPosition,
  computeTeleportMarkerTarget,
  getGroundInfoAt,
  getLookDirection,
  getPlayerShootOrigin,
  getSpawnPoint,
  validateTeleportTarget,
} from "../shared/arena.js"
import { createPlayerState, getPlayerSnapshot, MULTIPLAYER_CONFIG, respawnPlayerState } from "../shared/gameRules.js"
import { raySphereIntersection } from "../shared/math.js"
import { MESSAGE_TYPES, serializeMessage } from "../shared/protocol.js"
import { stepPlayerSimulation } from "../shared/playerSimulation.js"

export class Match {
  constructor(roomId, roomManager) {
    this.roomId = roomId
    this.roomManager = roomManager
    this.players = new Map()
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

    client.send(MESSAGE_TYPES.ROOM_JOINED, {
      roomId: this.roomId,
      playerId: client.id,
      player: getPlayerSnapshot(state),
      players: this.getSnapshots(),
    })

    this.broadcast(MESSAGE_TYPES.PLAYER_JOINED, {
      roomId: this.roomId,
      player: getPlayerSnapshot(state),
    }, client.id)
  }

  removePlayer(clientId) {
    const client = this.players.get(clientId)
    if (!client) {
      return
    }

    this.players.delete(clientId)
    this.broadcast(MESSAGE_TYPES.PLAYER_LEFT, { roomId: this.roomId, playerId: clientId })

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
        this.handleFire(client)
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
      default:
        break
    }
  }

  handleInput(client, message) {
    if (!client.playerState) {
      return
    }

    client.inputState = {
      forward: Number(message.forward) || 0,
      right: Number(message.right) || 0,
      sprinting: Boolean(message.sprinting),
      jumpHeld: Boolean(message.jumpHeld),
      yaw: Number(message.yaw) || 0,
      pitch: Number(message.pitch) || 0,
      weaponId: typeof message.weaponId === "string" ? message.weaponId : null,
    }
  }

  handleWeaponSwitch(client, weaponId) {
    if (!client.playerState || !weaponId) {
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

  handleReload(client) {
    const state = client.playerState
    if (!state || !state.alive) {
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

  handleFire(client) {
    const state = client.playerState
    if (!state || !state.alive) {
      return
    }

    const definition = getWeaponDefinition(state.weapon.weaponId)
    if (state.weapon.reloadEndAt > 0 || state.weapon.cooldown > 0 || state.weapon.clipAmmo <= 0) {
      return
    }

    state.weapon.clipAmmo -= 1
    state.weapon.cooldown = definition.stats.fireRate
    state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }

    const origin = getPlayerShootOrigin(state)
    const direction = getLookDirection(state.yaw, state.pitch)
    let bestClient = null
    let bestDistance = definition.stats.range

    for (const target of this.players.values()) {
      if (target.id === client.id || !target.playerState?.alive) {
        continue
      }

      const targetCenter = {
        x: target.playerState.position.x,
        y: target.playerState.position.y + PLAYER_CONFIG.eyeHeight * 0.55,
        z: target.playerState.position.z,
      }
      const hitDistance = raySphereIntersection(
        origin,
        direction,
        targetCenter,
        PLAYER_CONFIG.radius + 0.28,
        bestDistance
      )

      if (hitDistance < bestDistance) {
        bestDistance = hitDistance
        bestClient = target
      }
    }

    if (!bestClient) {
      return
    }

    bestClient.playerState.health = Math.max(0, bestClient.playerState.health - definition.stats.damage)
    this.broadcast(MESSAGE_TYPES.DAMAGE, {
      roomId: this.roomId,
      attackerId: client.id,
      victimId: bestClient.id,
      amount: definition.stats.damage,
      health: bestClient.playerState.health,
    })

    if (bestClient.playerState.health <= 0) {
      bestClient.playerState.alive = false
      bestClient.playerState.respawnAt = MULTIPLAYER_CONFIG.respawnDelay
      this.broadcast(MESSAGE_TYPES.DEATH, {
        roomId: this.roomId,
        attackerId: client.id,
        victimId: bestClient.id,
        respawnDelay: MULTIPLAYER_CONFIG.respawnDelay,
      })
    }
  }

  handleTeleportPlace(client) {
    const state = client.playerState
    if (!state || !state.alive || state.weapon.reloadEndAt > 0) {
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
    if (!state || !state.alive || !state.teleportMarker) {
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
      state.position.y = getGroundInfoAt(state.position.x, state.position.z, state.position.y).height
      state.weaponInventory[state.weapon.weaponId] = { ...state.weapon }

      if (!canOccupyPosition(state.position.x, state.position.z, PLAYER_CONFIG.radius, state.position.y)) {
        const respawn = getSpawnPoint(this.getRespawnIndex(client.id))
        state.position.x = respawn.x
        state.position.y = respawn.y
        state.position.z = respawn.z
        state.velocity.x = 0
        state.velocity.y = 0
        state.velocity.z = 0
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

  broadcast(type, payload, excludeId = null) {
    for (const client of this.players.values()) {
      if (client.id === excludeId) {
        continue
      }
      client.send(type, payload)
    }
  }
}
