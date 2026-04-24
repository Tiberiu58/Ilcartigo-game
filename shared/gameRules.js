import {
  LOADOUT_CONFIG,
  MULTIPLAYER_CONFIG,
  PLAYER_CONFIG,
  getWeaponDefinition,
} from "../config.js"
import { getSpawnPoint } from "./arena.js"
import { createSimulationState } from "./playerSimulation.js"

export { MULTIPLAYER_CONFIG }

export function createWeaponState(weaponId = LOADOUT_CONFIG.defaultPrimaryWeaponId) {
  const definition = getWeaponDefinition(weaponId)
  return {
    weaponId: definition.id,
    clipAmmo: definition.stats.clipSize,
    reserveAmmo: definition.stats.reserveAmmo,
    cooldown: 0,
    reloadEndAt: 0,
  }
}

export function createPlayerState(id, spawnIndex = 0) {
  const weaponInventory = Object.fromEntries(
    LOADOUT_CONFIG.primaryWeaponIds.map((weaponId) => [weaponId, createWeaponState(weaponId)])
  )
  const spawn = getSpawnPoint(spawnIndex)
  return {
    id,
    roomId: null,
    ...createSimulationState(spawn),
    health: PLAYER_CONFIG.maxHealth,
    alive: true,
    respawnAt: 0,
    weaponInventory,
    weapon: { ...weaponInventory[LOADOUT_CONFIG.defaultPrimaryWeaponId] },
    teleportMarker: null,
    teleportCooldown: 0,
  }
}

export function respawnPlayerState(state, spawnIndex) {
  const spawn = getSpawnPoint(spawnIndex)
  const simulation = createSimulationState(spawn)
  state.position = simulation.position
  state.velocity = simulation.velocity
  state.yaw = simulation.yaw
  state.pitch = simulation.pitch
  state.grounded = simulation.grounded
  state.coyoteTimer = simulation.coyoteTimer
  state.jumpHeldLast = simulation.jumpHeldLast
  state.health = PLAYER_CONFIG.maxHealth
  state.alive = true
  state.respawnAt = 0
  state.weaponInventory = Object.fromEntries(
    LOADOUT_CONFIG.primaryWeaponIds.map((weaponId) => [weaponId, createWeaponState(weaponId)])
  )
  state.teleportMarker = null
  state.teleportCooldown = 0
  state.weapon = { ...state.weaponInventory[state.weapon.weaponId] }
  return state
}

export function getPlayerSnapshot(state) {
  return {
    id: state.id,
    roomId: state.roomId,
    position: {
      x: state.position.x,
      y: state.position.y,
      z: state.position.z,
    },
    velocity: {
      x: state.velocity.x,
      y: state.velocity.y,
      z: state.velocity.z,
    },
    yaw: state.yaw,
    pitch: state.pitch,
    weaponId: state.weapon.weaponId,
    clipAmmo: state.weapon.clipAmmo,
    reserveAmmo: state.weapon.reserveAmmo,
    reloadRemaining: Math.max(0, state.weapon.reloadEndAt),
    health: state.health,
    alive: state.alive,
    respawnAt: state.respawnAt,
    teleportMarker: state.teleportMarker,
    teleportCooldown: state.teleportCooldown || 0,
  }
}
