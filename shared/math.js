export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function damp(current, target, smoothing, dt) {
  const t = 1 - Math.exp(-smoothing * dt)
  return lerp(current, target, t)
}

export function length2D(x, z) {
  return Math.hypot(x, z)
}

export function normalize2D(x, z) {
  const length = length2D(x, z) || 1
  return { x: x / length, z: z / length }
}

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target
  }

  return current + Math.sign(target - current) * maxDelta
}

export function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function subtract3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale3(value, scale) {
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale }
}

export function normalize3(value) {
  const length = Math.hypot(value.x, value.y, value.z) || 1
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  }
}

export function raySphereIntersection(origin, direction, center, radius, maxDistance) {
  const offsetX = origin.x - center.x
  const offsetY = origin.y - center.y
  const offsetZ = origin.z - center.z
  const b = offsetX * direction.x + offsetY * direction.y + offsetZ * direction.z
  const c = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radius * radius
  const discriminant = b * b - c

  if (discriminant < 0) {
    return Infinity
  }

  const sqrtValue = Math.sqrt(discriminant)
  const near = -b - sqrtValue
  const far = -b + sqrtValue
  const distance = near >= 0 ? near : far >= 0 ? far : Infinity

  if (distance > maxDistance) {
    return Infinity
  }

  return distance
}
