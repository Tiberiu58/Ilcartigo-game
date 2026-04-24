export const MESSAGE_TYPES = {
  HELLO: "hello",
  WELCOME: "welcome",
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  ROOM_JOINED: "room_joined",
  ROOM_STATE: "room_state",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT: "player_left",
  INPUT: "input",
  FIRE: "fire",
  RELOAD: "reload",
  SWITCH_WEAPON: "switch_weapon",
  TELEPORT_PLACE: "teleport_place",
  TELEPORT_USE: "teleport_use",
  SNAPSHOT: "snapshot",
  DAMAGE: "damage",
  DEATH: "death",
  RESPAWN: "respawn",
  ERROR: "error",
}

export function serializeMessage(type, payload = {}) {
  return JSON.stringify({ type, ...payload })
}

export function parseMessage(raw) {
  try {
    const data = JSON.parse(raw)
    return typeof data?.type === "string" ? data : null
  } catch {
    return null
  }
}

export function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
}

export function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}
