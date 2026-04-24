import { WebSocketServer } from "ws"
import { MULTIPLAYER_CONFIG } from "../config.js"
import { MESSAGE_TYPES, normalizeRoomCode, parseMessage, serializeMessage } from "../shared/protocol.js"
import { RoomManager } from "./roomManager.js"

const roomManager = new RoomManager()
const wss = new WebSocketServer({ port: MULTIPLAYER_CONFIG.serverPort })
let nextClientId = 1

function createClientSocket(socket) {
  return {
    id: `p${nextClientId++}`,
    socket,
    roomId: null,
    playerState: null,
    inputState: null,
    send(type, payload = {}) {
      if (socket.readyState === 1) {
        socket.send(serializeMessage(type, payload))
      }
    },
  }
}

function leaveCurrentRoom(client) {
  if (!client.roomId) {
    return
  }

  const room = roomManager.getRoom(client.roomId)
  if (room) {
    room.removePlayer(client.id)
  }

  client.roomId = null
  client.playerState = null
  client.inputState = null
}

wss.on("connection", (socket) => {
  const client = createClientSocket(socket)
  client.send(MESSAGE_TYPES.WELCOME, {
    playerId: client.id,
    maxPlayers: MULTIPLAYER_CONFIG.maxPlayersPerRoom,
  })

  socket.on("message", (raw) => {
    const message = parseMessage(raw.toString())
    if (!message) {
      client.send(MESSAGE_TYPES.ERROR, { message: "Invalid message payload." })
      return
    }

    if (message.type === MESSAGE_TYPES.CREATE_ROOM) {
      leaveCurrentRoom(client)
      const room = roomManager.createRoom()
      room.addPlayer(client)
      return
    }

    if (message.type === MESSAGE_TYPES.JOIN_ROOM) {
      const roomId = normalizeRoomCode(message.roomId)
      const room = roomManager.getRoom(roomId)
      if (!room) {
        client.send(MESSAGE_TYPES.ERROR, { message: `Room ${roomId} not found.` })
        return
      }

      if (room.players.size >= MULTIPLAYER_CONFIG.maxPlayersPerRoom) {
        client.send(MESSAGE_TYPES.ERROR, { message: `Room ${roomId} is full.` })
        return
      }

      leaveCurrentRoom(client)
      room.addPlayer(client)
      return
    }

    const room = client.roomId ? roomManager.getRoom(client.roomId) : null
    if (!room) {
      client.send(MESSAGE_TYPES.ERROR, { message: "Join a room first." })
      return
    }

    room.handleMessage(client, message)
  })

  socket.on("close", () => {
    leaveCurrentRoom(client)
  })
})

setInterval(() => {
  for (const room of roomManager.rooms.values()) {
    room.tick()
  }
}, Math.max(4, Math.floor(1000 / MULTIPLAYER_CONFIG.simulationRate)))

console.log(`Facility Zero multiplayer server running on ws://localhost:${MULTIPLAYER_CONFIG.serverPort}`)
