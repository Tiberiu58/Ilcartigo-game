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
}
