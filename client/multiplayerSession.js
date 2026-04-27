import { MULTIPLAYER_CONFIG } from "../config.js"
import { MESSAGE_TYPES, normalizeRoomCode } from "../shared/protocol.js?v=multiplayer-v11"
import { NetworkClient } from "./networkClient.js?v=multiplayer-v11"

export class MultiplayerSession {
  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const host = window.location.hostname || "127.0.0.1"
    this.client = new NetworkClient(`${protocol}://${host}:${MULTIPLAYER_CONFIG.serverPort}`)
    this.client.onMessage = (message) => this.handleMessage(message)
    this.client.onClose = () => this.handleDisconnected("Disconnected from multiplayer server.")
    this.client.onError = () => this.handleDisconnected("Failed to reach multiplayer server.")

    this.playerId = ""
    this.roomId = ""
    this.connected = false
    this.pendingRoomAction = null
    this.joinWaiter = null
    this.lastError = ""
    this.hostId = ""
    this.started = false
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.inputAccumulator = 0
    this.hitMarkerPulse = false
    this.damagePulse = 0
    this.pendingJumpPressed = false
    this.onLobbyStateChanged = null
    this.onMatchStarted = null
  }

  async ensureConnected() {
    if (this.connected && this.client.isOpen()) {
      return
    }

    await this.client.connect()
    this.connected = true
  }

  async createRoom() {
    await this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.joinWaiter = { resolve, reject }
      this.pendingRoomAction = "create"
      this.client.send(MESSAGE_TYPES.CREATE_ROOM)
    })
  }

  async joinRoom(roomCode) {
    await this.ensureConnected()
    return new Promise((resolve, reject) => {
      this.joinWaiter = { resolve, reject }
      this.pendingRoomAction = "join"
      this.client.send(MESSAGE_TYPES.JOIN_ROOM, { roomId: normalizeRoomCode(roomCode) })
    })
  }

  leaveRoom() {
    if (this.roomId) {
      this.client.send(MESSAGE_TYPES.LEAVE_ROOM, { roomId: this.roomId })
    }
    this.playerId = ""
    this.roomId = ""
    this.hostId = ""
    this.started = false
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.pendingJumpPressed = false
    this.lastError = ""
    this.emitLobbyStateChanged()
  }

  disconnect() {
    this.leaveRoom()
    this.client.disconnect()
    this.connected = false
  }

  update(dt, context) {
    if (!this.roomId || !this.client.isOpen()) {
      return
    }

    if (context.jumpPressed) {
      this.pendingJumpPressed = true
    }

    this.inputAccumulator += dt
    const sendInterval = 1 / MULTIPLAYER_CONFIG.inputSendRate
    if (this.inputAccumulator >= sendInterval || this.pendingJumpPressed) {
      this.inputAccumulator = 0
      this.client.send(MESSAGE_TYPES.INPUT, {
        roomId: this.roomId,
        forward: context.input.getMoveAxes().forward,
        right: context.input.getMoveAxes().right,
        sprinting: context.input.isSprinting(),
        jumpHeld: context.input.isJumpHeld(),
        jumpPressed: this.pendingJumpPressed,
        yaw: context.player.yaw,
        pitch: context.player.pitch,
        weaponId: context.weapon.getWeaponId(),
      })
      this.pendingJumpPressed = false
    }

    if (this.localSnapshot) {
      context.player.reconcileAuthoritativeState(this.localSnapshot, dt)
      context.weapon.syncNetworkState(this.localSnapshot)
      context.teleport.syncNetworkState({
        marker: this.localSnapshot.teleportMarker,
        cooldown: this.localSnapshot.teleportCooldown || 0,
      })
    }
  }

  requestFire() {
    if (!this.roomId) {
      return false
    }
    this.client.send(MESSAGE_TYPES.FIRE, { roomId: this.roomId })
    return true
  }

  requestReload() {
    if (!this.roomId) {
      return
    }
    this.client.send(MESSAGE_TYPES.RELOAD, { roomId: this.roomId })
  }

  requestWeaponSwitch(weaponId) {
    if (!this.roomId) {
      return
    }
    this.client.send(MESSAGE_TYPES.SWITCH_WEAPON, { roomId: this.roomId, weaponId })
  }

  requestTeleportAction() {
    if (!this.roomId) {
      return
    }

    if (this.localSnapshot?.teleportMarker) {
      this.client.send(MESSAGE_TYPES.TELEPORT_USE, { roomId: this.roomId })
    } else {
      this.client.send(MESSAGE_TYPES.TELEPORT_PLACE, { roomId: this.roomId })
    }
  }

  requestStartMatch() {
    if (!this.roomId || !this.isHost()) {
      this.lastError = !this.roomId ? "Join a room first." : "Only the host can start the match."
      this.emitLobbyStateChanged()
      return false
    }

    this.client.send(MESSAGE_TYPES.START_MATCH, { roomId: this.roomId })
    this.lastError = "Starting match..."
    this.emitLobbyStateChanged()
    return true
  }

  isHost() {
    return Boolean(this.playerId) && this.playerId === this.hostId
  }

  hasStarted() {
    return this.started
  }

  getLobbyState() {
    const roster = this.lastRoomPlayers.length > 0
      ? [...this.lastRoomPlayers]
      : [
          ...(this.localSnapshot ? [this.localSnapshot] : []),
          ...this.remoteSnapshots,
        ]

    roster.sort((left, right) => {
      if (left.id === this.hostId) {
        return -1
      }
      if (right.id === this.hostId) {
        return 1
      }
      if (left.id === this.playerId) {
        return -1
      }
      if (right.id === this.playerId) {
        return 1
      }
      return left.id.localeCompare(right.id)
    })

    const players = roster.map((player, index) => {
      const isLocal = player.id === this.playerId
      const isHost = player.id === this.hostId
      const baseLabel = isLocal ? "You" : `Player ${index + 1}`

      return {
        id: player.id,
        label: isHost ? `${baseLabel} (Host)` : baseLabel,
      }
    })

    return {
      roomId: this.roomId,
      hostId: this.hostId,
      started: this.started,
      isHost: this.isHost(),
      playerCount: players.length,
      players,
      status: this.lastError || (this.started ? "Match starting..." : "Waiting for players."),
    }
  }

  emitLobbyStateChanged() {
    if (typeof this.onLobbyStateChanged === "function") {
      this.onLobbyStateChanged(this.getLobbyState())
    }
  }

  getRemoteSnapshots() {
    return this.remoteSnapshots
  }

  consumeHitMarkerPulse() {
    const value = this.hitMarkerPulse
    this.hitMarkerPulse = false
    return value
  }

  consumeDamagePulse() {
    const value = this.damagePulse
    this.damagePulse = 0
    return value
  }

  getStatusText() {
    if (!this.roomId) {
      return this.lastError || "Connect to a multiplayer room."
    }

    if (this.localSnapshot && !this.localSnapshot.alive) {
      return `Respawning in ${this.localSnapshot.respawnAt.toFixed(1)}s.`
    }

    return `Room ${this.roomId}. ${this.remoteSnapshots.length + 1} players connected.`
  }

  handleMessage(message) {
    switch (message.type) {
      case MESSAGE_TYPES.WELCOME:
        this.playerId = message.playerId
        break
      case MESSAGE_TYPES.ROOM_JOINED:
        this.roomId = message.roomId
        this.playerId = message.playerId
        this.hostId = message.hostId || this.hostId
        this.started = Boolean(message.started)
        this.lastError = ""
        this.applySnapshots(message.players || [])
        if (this.joinWaiter) {
          this.joinWaiter.resolve({ roomId: this.roomId, playerId: this.playerId })
          this.joinWaiter = null
        }
        this.emitLobbyStateChanged()
        break
      case MESSAGE_TYPES.SNAPSHOT:
        this.applySnapshots(message.players || [])
        break
      case MESSAGE_TYPES.ROOM_STATE:
        {
          const wasStarted = this.started
          this.roomId = message.roomId || this.roomId
          this.hostId = message.hostId || this.hostId
          this.started = Boolean(message.started)
          if (this.started) {
            this.lastError = ""
          }
          this.applySnapshots(message.players || [])
          this.emitLobbyStateChanged()
          if (!wasStarted && this.started && typeof this.onMatchStarted === "function") {
            this.onMatchStarted({
              roomId: this.roomId,
              hostId: this.hostId,
            })
          }
        }
        break
      case MESSAGE_TYPES.PLAYER_LEFT:
      case MESSAGE_TYPES.PLAYER_JOINED:
      case MESSAGE_TYPES.RESPAWN:
        break
      case MESSAGE_TYPES.DAMAGE:
        if (message.attackerId === this.playerId) {
          this.hitMarkerPulse = true
        }
        if (message.victimId === this.playerId) {
          this.damagePulse = message.amount || 10
        }
        break
      case MESSAGE_TYPES.ERROR:
        this.lastError = message.message || "Multiplayer error."
        if (this.joinWaiter) {
          this.joinWaiter.reject(new Error(this.lastError))
          this.joinWaiter = null
        }
        this.emitLobbyStateChanged()
        break
      default:
        break
    }
  }

  applySnapshots(players) {
    this.lastRoomPlayers = [...players]
    this.localSnapshot = players.find((player) => player.id === this.playerId) || this.localSnapshot
    this.remoteSnapshots = players.filter((player) => player.id !== this.playerId)
  }

  handleDisconnected(message) {
    this.connected = false
    this.lastError = message
    this.roomId = ""
    this.hostId = ""
    this.started = false
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.pendingJumpPressed = false
    this.emitLobbyStateChanged()
  }
}
