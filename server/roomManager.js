import { createRoomCode } from "../shared/protocol.js"
import { Match } from "./match.js"

export class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  createRoom() {
    let roomId = createRoomCode()
    while (this.rooms.has(roomId)) {
      roomId = createRoomCode()
    }

    const match = new Match(roomId, this)
    this.rooms.set(roomId, match)
    return match
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId)
  }

  listPublicRooms() {
    const rooms = []
    for (const [roomId, match] of this.rooms.entries()) {
      if (match.matchPhase === "ended") {
        continue
      }
      rooms.push({
        roomId,
        playerCount: match.players.size,
        maxPlayers: 4,
        matchPhase: match.matchPhase,
      })
    }
    return rooms
  }
}
