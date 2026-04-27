import { PLAYER_CONFIG, TELEPORT_CONFIG, WORLD_CONFIG } from "../config.js"
import { clamp } from "./math.js"

const map = WORLD_CONFIG.map
const cellSize = WORLD_CONFIG.cellSize
const wallHeight = WORLD_CONFIG.wallHeight
const floorY = WORLD_CONFIG.floorY
const width = map[0].length
const depth = map.length
const maxStepHeight = 1.1
const maxWalkableSlopeCos = Math.cos((PLAYER_CONFIG.maxWalkableSlopeAngle * Math.PI) / 180)

const rampStartX = cellSize * 1.3
const rampEndX = cellSize * 8.0
const rampCenterZ = cellSize * 7.5
const rampWidth = cellSize * 3.2
const platformHeight = 1.8

const platformMinX = rampEndX
const platformMaxX = cellSize * 12.2
const platformMinZ = cellSize * 5.5
const platformMaxZ = cellSize * 9.5

const towerBounds = {
  minX: cellSize * 10.5 - cellSize * 0.6,
  maxX: cellSize * 10.5 + cellSize * 0.6,
  minZ: cellSize * 7.5 - cellSize * 0.6,
  maxZ: cellSize * 7.5 + cellSize * 0.6,
}

const structureColliders = [
  {
    type: "ramp",
    minX: rampStartX,
    maxX: rampEndX,
    minZ: rampCenterZ - rampWidth * 0.5 + 0.15,
    maxZ: rampCenterZ + rampWidth * 0.5 - 0.15,
    startY: floorY,
    endY: platformHeight,
  },
  {
    type: "box",
    minX: platformMinX,
    maxX: platformMaxX,
    minZ: platformMinZ,
    maxZ: platformMaxZ,
    topY: platformHeight,
  },
  {
    type: "box",
    minX: towerBounds.minX,
    maxX: towerBounds.maxX,
    minZ: towerBounds.minZ,
    maxZ: towerBounds.maxZ,
    topY: floorY + platformHeight + 3.1,
  },
]

const walkSurfaces = [
  {
    type: "ramp",
    minX: rampStartX,
    maxX: rampEndX,
    minZ: rampCenterZ - rampWidth * 0.5 + 0.4,
    maxZ: rampCenterZ + rampWidth * 0.5 - 0.4,
    startY: floorY,
    endY: platformHeight,
  },
  {
    type: "box",
    minX: platformMinX,
    maxX: platformMaxX,
    minZ: platformMinZ,
    maxZ: platformMaxZ,
    y: platformHeight,
  },
]

const multiplayerSpawnPoints = [
  createVector3(cellSize * 2.75, floorY, cellSize * 2.75),
  createVector3(cellSize * 15.25, floorY, cellSize * 2.75),
  createVector3(cellSize * 2.75, floorY, cellSize * 12.25),
  createVector3(cellSize * 15.25, floorY, cellSize * 12.25),
]

function createVector3(x, y, z) {
  return { x, y, z }
}

export function getArenaDimensions() {
  return { width, depth, cellSize, wallHeight, floorY }
}

export function isWallCell(cellX, cellZ) {
  const row = map[cellZ]
  if (!row || row[cellX] == null) {
    return true
  }

  return row[cellX] === "#"
}

export function cellToWorld(cell) {
  return createVector3(cell.x * cellSize, floorY, cell.z * cellSize)
}

export function getPlayerSpawn() {
  return cellToWorld(WORLD_CONFIG.playerSpawn)
}

export function getMultiplayerSpawnPoints() {
  return multiplayerSpawnPoints.map((point) => createVector3(point.x, point.y, point.z))
}

export function getSpawnPoint(index = 0) {
  const points = getMultiplayerSpawnPoints()
  return points[index % points.length]
}

function getStructureSurfaceHeight(collider, x) {
  if (collider.type === "ramp") {
    const progress = (x - collider.minX) / Math.max(collider.maxX - collider.minX, 0.001)
    return collider.startY + progress * (collider.endY - collider.startY)
  }

  return collider.topY
}

function getSurfaceInfo(surface, x) {
  if (surface.type === "ramp") {
    const run = Math.max(surface.maxX - surface.minX, 0.001)
    const rise = surface.endY - surface.startY
    const progress = (x - surface.minX) / run
    const height = surface.startY + progress * rise
    const normal = normalizeSurfaceNormal({ x: -rise / run, y: 1, z: 0 })
    const slopeAngle = (Math.acos(clamp(normal.y, -1, 1)) * 180) / Math.PI

    return {
      height,
      normal,
      walkable: normal.y >= maxWalkableSlopeCos,
      slopeAngle,
      surfaceType: "ramp",
    }
  }

  return {
    height: surface.y,
    normal: createVector3(0, 1, 0),
    walkable: true,
    slopeAngle: 0,
    surfaceType: "box",
  }
}

function normalizeSurfaceNormal(value) {
  const length = Math.hypot(value.x, value.y, value.z) || 1
  return { x: value.x / length, y: value.y / length, z: value.z / length }
}

export function getGroundInfoAt(x, z, currentY = floorY) {
  let highest = floorY
  let best = {
    height: floorY,
    normal: createVector3(0, 1, 0),
    walkable: true,
    slopeAngle: 0,
    surfaceType: "floor",
  }

  for (const surface of walkSurfaces) {
    if (x < surface.minX || x > surface.maxX || z < surface.minZ || z > surface.maxZ) {
      continue
    }

    const surfaceInfo = getSurfaceInfo(surface, x)
    if (surfaceInfo.height <= currentY + maxStepHeight && surfaceInfo.height >= highest - 0.02) {
      highest = surfaceInfo.height
      best = surfaceInfo
    }
  }

  return best
}

function overlapsStructureCollider(x, z, radius, currentY = floorY) {
  for (const collider of structureColliders) {
    const nearestX = clamp(x, collider.minX, collider.maxX)
    const nearestZ = clamp(z, collider.minZ, collider.maxZ)
    const diffX = x - nearestX
    const diffZ = z - nearestZ

    if (diffX * diffX + diffZ * diffZ >= radius * radius) {
      continue
    }

    const surfaceY = getStructureSurfaceHeight(collider, nearestX)
    if (collider.type === "ramp") {
      const rampRun = Math.max(collider.maxX - collider.minX, 0.001)
      const rampRise = collider.endY - collider.startY
      const rampNormalY = normalizeSurfaceNormal({ x: -rampRise / rampRun, y: 1, z: 0 }).y
      if (rampNormalY < maxWalkableSlopeCos) {
        return true
      }
    }

    if (currentY + maxStepHeight < surfaceY - 0.04) {
      return true
    }
  }

  return false
}

function overlapsWall(x, z, radius, currentY = floorY) {
  const minCellX = Math.floor((x - radius) / cellSize)
  const maxCellX = Math.floor((x + radius) / cellSize)
  const minCellZ = Math.floor((z - radius) / cellSize)
  const maxCellZ = Math.floor((z + radius) / cellSize)

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      if (!isWallCell(cellX, cellZ)) {
        continue
      }

      const minX = cellX * cellSize
      const maxX = minX + cellSize
      const minZ = cellZ * cellSize
      const maxZ = minZ + cellSize
      const nearestX = clamp(x, minX, maxX)
      const nearestZ = clamp(z, minZ, maxZ)
      const diffX = x - nearestX
      const diffZ = z - nearestZ

      if (diffX * diffX + diffZ * diffZ < radius * radius) {
        return true
      }
    }
  }

  return overlapsStructureCollider(x, z, radius, currentY)
}

export function isWithinBounds(x, z, radius = 0) {
  const maxX = width * cellSize
  const maxZ = depth * cellSize

  return x - radius >= 0
    && z - radius >= 0
    && x + radius <= maxX
    && z + radius <= maxZ
}

export function canOccupyPosition(x, z, radius, currentY = floorY) {
  if (!isWithinBounds(x, z, radius)) {
    return false
  }

  return !overlapsWall(x, z, radius, currentY)
}

export function validateTeleportTarget(from, target, radius) {
  if (!canOccupyPosition(target.x, target.z, radius, wallHeight)) {
    return false
  }

  const groundInfo = getGroundInfoAt(target.x, target.z, wallHeight)
  if (!groundInfo.walkable) {
    return false
  }

  if (!hasLineOfSight(from, target)) {
    return false
  }

  const diffX = target.x - from.x
  const diffZ = target.z - from.z
  const distance = Math.hypot(diffX, diffZ)
  const steps = Math.max(2, Math.ceil(distance / Math.max(radius * 1.4, 0.4)))

  for (let step = 1; step < steps; step += 1) {
    const t = step / steps
    const sampleX = from.x + diffX * t
    const sampleZ = from.z + diffZ * t
    if (!canOccupyPosition(sampleX, sampleZ, radius * 0.8, wallHeight)) {
      return false
    }
  }

  return true
}

export function moveCircle(position, delta, radius, options = {}) {
  const stepSize = options.stepSize || Math.max(radius * 0.25, 0.05)
  const xFirst = moveByOrder(position, delta, radius, stepSize, true)
  const zFirst = moveByOrder(position, delta, radius, stepSize, false)
  return distanceSquared(position, xFirst) >= distanceSquared(position, zFirst) ? xFirst : zFirst
}

function moveByOrder(position, delta, radius, stepSize, xFirst) {
  const next = { x: position.x, y: position.y, z: position.z }

  if (xFirst) {
    next.x = moveAxis(next.x, next.z, position.y, delta.x, radius, stepSize, "x")
    next.z = moveAxis(next.x, next.z, position.y, delta.z, radius, stepSize, "z")
  } else {
    next.z = moveAxis(next.x, next.z, position.y, delta.z, radius, stepSize, "z")
    next.x = moveAxis(next.x, next.z, position.y, delta.x, radius, stepSize, "x")
  }

  return next
}

function moveAxis(baseX, baseZ, currentY, delta, radius, stepSize, axis) {
  if (delta === 0) {
    return axis === "x" ? baseX : baseZ
  }

  let current = axis === "x" ? baseX : baseZ
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / stepSize))
  const step = delta / steps

  for (let i = 0; i < steps; i += 1) {
    const candidate = current + step
    const nextX = axis === "x" ? candidate : baseX
    const nextZ = axis === "z" ? candidate : baseZ

    if (overlapsWall(nextX, nextZ, radius, currentY)) {
      break
    }

    current = candidate
  }

  return current
}

function distanceSquared(from, to) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return dx * dx + dz * dz
}

export function raycastWalls(origin, direction, maxDistance) {
  const dirX = direction.x
  const dirZ = direction.z
  const horizontalLength = Math.hypot(dirX, dirZ)

  if (horizontalLength < 0.0001) {
    return maxDistance
  }

  const rayX = dirX / horizontalLength
  const rayZ = dirZ / horizontalLength
  let cellX = Math.floor(origin.x / cellSize)
  let cellZ = Math.floor(origin.z / cellSize)

  const deltaDistX = rayX === 0 ? Infinity : Math.abs(cellSize / rayX)
  const deltaDistZ = rayZ === 0 ? Infinity : Math.abs(cellSize / rayZ)

  let sideDistX
  let sideDistZ
  let stepX
  let stepZ

  if (rayX < 0) {
    stepX = -1
    sideDistX = (origin.x - cellX * cellSize) / -rayX
  } else {
    stepX = 1
    sideDistX = (((cellX + 1) * cellSize) - origin.x) / (rayX || 1)
  }

  if (rayZ < 0) {
    stepZ = -1
    sideDistZ = (origin.z - cellZ * cellSize) / -rayZ
  } else {
    stepZ = 1
    sideDistZ = (((cellZ + 1) * cellSize) - origin.z) / (rayZ || 1)
  }

  let distance = 0

  while (distance <= maxDistance) {
    if (sideDistX < sideDistZ) {
      distance = sideDistX
      sideDistX += deltaDistX
      cellX += stepX
    } else {
      distance = sideDistZ
      sideDistZ += deltaDistZ
      cellZ += stepZ
    }

    if (isWallCell(cellX, cellZ)) {
      return Math.min(distance, maxDistance)
    }
  }

  return maxDistance
}

export function hasLineOfSight(from, to) {
  const diffX = to.x - from.x
  const diffZ = to.z - from.z
  const distance = Math.hypot(diffX, diffZ)

  if (distance < 0.001) {
    return true
  }

  const hitDistance = raycastWalls(from, { x: diffX, z: diffZ }, distance)
  return hitDistance >= distance - 0.12
}

export function computeTeleportMarkerTarget(state) {
  const look = getLookDirection(state.yaw, state.pitch)
  const horizontalLength = Math.hypot(look.x, look.z)
  const origin = getPlayerCenterPosition(state)

  if (horizontalLength < 0.0001) {
    return { valid: false, reason: "Teleport marker needs a clear forward angle." }
  }

  const dirX = look.x / horizontalLength
  const dirZ = look.z / horizontalLength
  const horizontalWallDistance = raycastWalls(origin, { x: dirX, z: dirZ }, TELEPORT_CONFIG.range)
  let targetDistance = Math.min(
    TELEPORT_CONFIG.range,
    Math.max(0, horizontalWallDistance - TELEPORT_CONFIG.wallBuffer)
  )

  if (look.y < -0.08) {
    const floorDistance = (floorY - getPlayerShootOrigin(state).y) / look.y
    if (floorDistance > 0) {
      targetDistance = Math.min(targetDistance, floorDistance * horizontalLength)
    }
  }

  targetDistance = clamp(targetDistance, 0, TELEPORT_CONFIG.range)

  const x = state.position.x + dirX * targetDistance
  const z = state.position.z + dirZ * targetDistance
  if (targetDistance < TELEPORT_CONFIG.minRange) {
    return { valid: false, x, z, reason: "Teleport marker needs a little more room." }
  }

  const radius = PLAYER_CONFIG.radius + TELEPORT_CONFIG.clearancePadding
  const valid = validateTeleportTarget(origin, { x, z }, radius)
  return {
    valid,
    x,
    z,
    reason: valid ? "" : "Teleport marker target is blocked.",
  }
}

export function getPlayerCenterPosition(state) {
  return {
    x: state.position.x,
    y: state.position.y + PLAYER_CONFIG.eyeHeight * 0.7,
    z: state.position.z,
  }
}

export function getPlayerShootOrigin(state) {
  return {
    x: state.position.x,
    y: state.position.y + PLAYER_CONFIG.eyeHeight,
    z: state.position.z,
  }
}

export function getLookDirection(yaw, pitch) {
  const cosPitch = Math.cos(pitch)
  return {
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  }
}
