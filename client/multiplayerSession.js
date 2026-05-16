import { MULTIPLAYER_CONFIG } from "../config.js"
import { getMultiplayerServerUrl } from "./runtimeConfig.js?v=multiplayer-v18"
import { MESSAGE_TYPES, normalizeRoomCode } from "../shared/protocol.js?v=multiplayer-v18"
import { NetworkClient } from "./networkClient.js?v=multiplayer-v18"

const CONNECTION_LABELS = {
  idle: "Ready to connect.",
  waking: "Waking multiplayer server...",
  connecting: "Connecting to multiplayer server...",
  connected: "Connected to multiplayer server.",
  disconnected: "Disconnected from multiplayer server.",
  error: "Could not reach multiplayer server. Try Wake / Retry.",
}

export class MultiplayerSession {
  constructor() {
    this.serverUrl = getMultiplayerServerUrl()
    this.client = new NetworkClient(this.serverUrl)
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
    this.matchPhase = "lobby"
    this.countdownRemaining = 0
    this.matchTimeRemaining = 0
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.scoreboard = []
    this.connectionState = this.serverUrl ? "idle" : "error"
    this.inputAccumulator = 0
    this.hitMarkerPulse = false
    this.damagePulse = 0
    this.kills = 0
    this.deaths = 0
    this.score = 0
    this.pendingJumpPressed = false
    this.onLobbyStateChanged = null
    this.onMatchStarted = null
  }

  getLastRoomCode() {
    return window.localStorage?.getItem("facilityZeroLastRoom") || ""
  }

  async ensureConnected() {
    if (this.connected && this.client.isOpen()) {
      return
    }

    this.connectionState = "connecting"
    this.lastError = CONNECTION_LABELS.connecting
    this.emitLobbyStateChanged()
    await this.client.connect()
    this.connected = true
    this.connectionState = "connected"
    this.lastError = ""
    this.emitLobbyStateChanged()
  }

  async wakeServer() {
    this.connectionState = "waking"
    this.lastError = CONNECTION_LABELS.waking
    this.emitLobbyStateChanged()

    try {
      const healthUrl = this.getHealthUrl()
      if (healthUrl) {
        await fetch(healthUrl, { cache: "no-store", mode: "no-cors" })
      }
      await this.ensureConnected()
      return true
    } catch (error) {
      this.connectionState = "error"
      this.lastError = error instanceof Error ? error.message : CONNECTION_LABELS.error
      this.emitLobbyStateChanged()
      return false
    }
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
    this.matchPhase = "lobby"
    this.countdownRemaining = 0
    this.matchTimeRemaining = 0
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.scoreboard = []
    this.pendingJumpPressed = false
    this.kills = 0
    this.deaths = 0
    this.score = 0
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

  requestFire(aim = {}) {
    if (!this.roomId) {
      return false
    }
    this.client.send(MESSAGE_TYPES.FIRE, {
      roomId: this.roomId,
      yaw: Number.isFinite(aim.yaw) ? aim.yaw : undefined,
      pitch: Number.isFinite(aim.pitch) ? aim.pitch : undefined,
      weaponId: typeof aim.weaponId === "string" ? aim.weaponId : undefined,
      origin: sanitizeVector3(aim.origin),
      direction: sanitizeVector3(aim.direction),
      timestamp: Number.isFinite(aim.timestamp) ? aim.timestamp : Date.now(),
    })
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
      matchPhase: this.matchPhase,
      countdownRemaining: this.countdownRemaining,
      matchTimeRemaining: this.matchTimeRemaining,
      isHost: this.isHost(),
      playerCount: players.length,
      players,
      connectionState: this.connectionState,
      connectionLabel: CONNECTION_LABELS[this.connectionState] || this.connectionState,
      status: this.lastError || (this.started ? this.getMatchStatusText() : "Waiting for players."),
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

  getKills() {
    return this.kills
  }

  getScore() {
    return this.score
  }

  getDeaths() {
    return this.deaths
  }

  getScoreboard() {
    return this.scoreboard
  }

  getMatchTimeText() {
    const seconds = Math.max(0, Math.ceil(this.matchTimeRemaining || 0))
    const minutes = Math.floor(seconds / 60)
    const remainder = String(seconds % 60).padStart(2, "0")
    return `${minutes}:${remainder}`
  }

  isMatchEnded() {
    return this.matchPhase === "ended"
  }

  getStatusText() {
    if (!this.roomId) {
      return this.lastError || "Connect to a multiplayer room."
    }

    if (this.localSnapshot && !this.localSnapshot.alive) {
      const killer = this.getPlayerLabel(this.localSnapshot.killedBy)
      return `${killer ? `Killed by ${killer}. ` : ""}Respawning in ${this.localSnapshot.respawnAt.toFixed(1)}s.`
    }

    return this.getMatchStatusText()
  }

  getMatchStatusText() {
    if (this.matchPhase === "countdown") {
      return `Match starts in ${Math.ceil(this.countdownRemaining || 0)}.`
    }

    if (this.matchPhase === "ended") {
      return "Match ended. Return to lobby or restart."
    }

    if (this.matchPhase === "playing") {
      return `Deathmatch ${this.getMatchTimeText()}. ${this.remoteSnapshots.length + 1} players connected.`
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
        this.matchPhase = message.matchPhase || (this.started ? "playing" : "lobby")
        this.countdownRemaining = Number(message.countdownRemaining) || 0
        this.matchTimeRemaining = Number(message.matchTimeRemaining) || 0
        this.scoreboard = message.scoreboard || []
        this.lastError = ""
        window.localStorage?.setItem("facilityZeroLastRoom", this.roomId)
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
          this.matchPhase = message.matchPhase || (this.started ? "playing" : "lobby")
          this.countdownRemaining = Number(message.countdownRemaining) || 0
          this.matchTimeRemaining = Number(message.matchTimeRemaining) || 0
          this.scoreboard = message.scoreboard || this.scoreboard
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
        break
      case MESSAGE_TYPES.RESPAWN:
        if (message.player?.id) {
          this.patchPlayerSnapshot(message.player.id, message.player)
        }
        break
      case MESSAGE_TYPES.DAMAGE:
        this.patchPlayerSnapshot(message.victimId, {
          health: Number.isFinite(message.health) ? message.health : undefined,
        })
        if (message.attackerId === this.playerId) {
          this.hitMarkerPulse = true
          this.score += Math.max(0, Math.round((message.amount || 0) * 0.5))
        }
        if (message.victimId === this.playerId) {
          this.damagePulse = message.amount || 10
        }
        break
      case MESSAGE_TYPES.DEATH:
        this.patchPlayerSnapshot(message.victimId, {
          alive: false,
          health: 0,
          respawnAt: message.respawnDelay || 0,
        })
        if (message.attackerId === this.playerId && message.victimId !== this.playerId) {
          this.kills += 1
          this.score += 100
        }
        if (message.victimId === this.playerId) {
          this.deaths += 1
          this.damagePulse = Math.max(this.damagePulse, 30)
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
    const local = players.find((player) => player.id === this.playerId)
    if (local) {
      this.kills = local.kills || this.kills
      this.deaths = local.deaths || this.deaths
      this.score = local.score || this.score
    }
    if (players.length > 0) {
      this.scoreboard = players
        .map((player) => ({
          id: player.id,
          label: this.getPlayerLabel(player.id),
          kills: player.kills || 0,
          deaths: player.deaths || 0,
          score: player.score || 0,
          health: player.health,
          alive: player.alive,
        }))
        .sort((left, right) => right.score - left.score || right.kills - left.kills || left.deaths - right.deaths)
    }
  }

  patchPlayerSnapshot(playerId, patch) {
    if (!playerId) {
      return
    }

    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    )

    if (this.localSnapshot?.id === playerId) {
      this.localSnapshot = { ...this.localSnapshot, ...cleanPatch }
    }

    this.remoteSnapshots = this.remoteSnapshots.map((snapshot) => (
      snapshot.id === playerId ? { ...snapshot, ...cleanPatch } : snapshot
    ))
    this.lastRoomPlayers = this.lastRoomPlayers.map((snapshot) => (
      snapshot.id === playerId ? { ...snapshot, ...cleanPatch } : snapshot
    ))
  }

  handleDisconnected(message) {
    this.connected = false
    this.lastError = message
    this.roomId = ""
    this.hostId = ""
    this.started = false
    this.matchPhase = "lobby"
    this.countdownRemaining = 0
    this.matchTimeRemaining = 0
    this.localSnapshot = null
    this.remoteSnapshots = []
    this.lastRoomPlayers = []
    this.scoreboard = []
    this.pendingJumpPressed = false
    this.kills = 0
    this.deaths = 0
    this.score = 0
    this.emitLobbyStateChanged()
  }

  getPlayerLabel(playerId) {
    if (!playerId) {
      return ""
    }

    if (playerId === this.playerId) {
      return "You"
    }

    const roster = this.lastRoomPlayers.length > 0 ? this.lastRoomPlayers : this.remoteSnapshots
    const index = roster.findIndex((player) => player.id === playerId)
    return index >= 0 ? `Player ${index + 1}` : playerId
  }

  getHealthUrl() {
    if (!this.serverUrl) {
      return ""
    }

    if (this.serverUrl.startsWith("wss://")) {
      return `https://${this.serverUrl.slice("wss://".length)}`
    }

    if (this.serverUrl.startsWith("ws://")) {
      return `http://${this.serverUrl.slice("ws://".length)}`
    }

    return ""
  }
}

function sanitizeVector3(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    return undefined
  }

  return {
    x: value.x,
    y: value.y,
    z: value.z,
  }
}
