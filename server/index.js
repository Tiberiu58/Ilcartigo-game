import http from "node:http"
import { WebSocketServer } from "ws"
import { MULTIPLAYER_CONFIG } from "../config.js"
import { MESSAGE_TYPES, normalizeRoomCode, parseMessage, serializeMessage } from "../shared/protocol.js"
import { RoomManager } from "./roomManager.js"

const roomManager = new RoomManager()
const port = Number(process.env.PORT) || MULTIPLAYER_CONFIG.serverPort
const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/plain" })
  response.end("Facility Zero multiplayer server is running.\n")
})
const wss = new WebSocketServer({ server })
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
      console.warn(`[server] invalid payload from ${client.id}: ${raw.toString()}`)
      client.send(MESSAGE_TYPES.ERROR, { message: "Invalid message payload." })
      return
    }

    if (message.type === MESSAGE_TYPES.CREATE_ROOM) {
      try {
        leaveCurrentRoom(client)
        const room = roomManager.createRoom()
        if (!room) {
          client.send(MESSAGE_TYPES.ERROR, { message: "Could not generate a room code. Try again." })
          return
        }
        room.addPlayer(client)
      } catch {
        client.send(MESSAGE_TYPES.ERROR, { message: "Could not generate a room code. Try again." })
      }
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
      console.warn(`[server] ${client.id} sent ${message.type} without room membership`)
      client.send(MESSAGE_TYPES.ERROR, { message: "Join a room first." })
      return
    }

    if (message.type === MESSAGE_TYPES.START_MATCH) {
      console.log(`[server] ${client.id} requested start for room ${client.roomId}`)
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

server.listen(port, "0.0.0.0", () => {
  console.log(`Facility Zero multiplayer server running on port ${port}`)
})
