import { clamp } from "./utils.js"

export class UIController {
  constructor(rootDocument) {
    this.rootDocument = rootDocument
    this.health = rootDocument.getElementById("health-value")
    this.ammo = rootDocument.getElementById("ammo-value")
    this.enemies = rootDocument.getElementById("enemy-value")
    this.score = rootDocument.getElementById("score-value")
    this.kills = rootDocument.getElementById("kill-value")
    this.fps = rootDocument.getElementById("fps-value")
    this.status = rootDocument.getElementById("status-value")
    this.overlay = rootDocument.getElementById("overlay")
    this.menuRoot = rootDocument.getElementById("menu-root")
    this.overlayTitle = rootDocument.getElementById("overlay-title")
    this.overlayText = rootDocument.getElementById("overlay-text")
    this.overlayEyebrow = rootDocument.getElementById("overlay-eyebrow")
    this.overlayButton = rootDocument.getElementById("overlay-button")
    this.crosshair = rootDocument.getElementById("crosshair")
    this.hitMarker = rootDocument.getElementById("hit-marker")
    this.screenFlash = rootDocument.getElementById("screen-flash")
    this.scoreboard = rootDocument.getElementById("scoreboard")
    this.scoreboardTable = rootDocument.getElementById("scoreboard-table")
    this.scoreboardTimer = rootDocument.getElementById("scoreboard-timer")
    this.debugPanel = rootDocument.getElementById("debug-panel")
    this.debugPanelBody = rootDocument.getElementById("debug-panel-body")
    this.weaponSlotNames = [
      rootDocument.getElementById("weapon-slot-name-0"),
      rootDocument.getElementById("weapon-slot-name-1"),
      rootDocument.getElementById("weapon-slot-name-2"),
    ]
    this.weaponSlotAmmo = [
      rootDocument.getElementById("weapon-slot-ammo-0"),
      rootDocument.getElementById("weapon-slot-ammo-1"),
      rootDocument.getElementById("weapon-slot-ammo-2"),
    ]
    this.weaponSlots = [
      rootDocument.getElementById("weapon-slot-0"),
      rootDocument.getElementById("weapon-slot-1"),
      rootDocument.getElementById("weapon-slot-2"),
    ]
    this.playButton = rootDocument.getElementById("play-button")
    this.loadoutButton = rootDocument.getElementById("loadout-button")
    this.loadoutPlayButton = rootDocument.getElementById("loadout-play-button")
    this.settingsButton = rootDocument.getElementById("settings-button")
    this.lobbyButton = rootDocument.getElementById("lobby-button")
    this.loadoutBackButton = rootDocument.getElementById("loadout-back-button")
    this.settingsBackButton = rootDocument.getElementById("settings-back-button")
    this.lobbyBackButton = rootDocument.getElementById("lobby-back-button")
    this.lobbySoloButton = rootDocument.getElementById("lobby-solo-button")
    this.createRoomButton = rootDocument.getElementById("create-room-button")
    this.joinRoomButton = rootDocument.getElementById("join-room-button")
    this.copyRoomCodeButton = rootDocument.getElementById("copy-room-code-button")
    this.retryServerButton = rootDocument.getElementById("retry-server-button")
    this.startRoomButton = rootDocument.getElementById("start-room-button")
    this.lobbyRoomCode = rootDocument.getElementById("lobby-room-code")
    this.lobbyRoomStatus = rootDocument.getElementById("lobby-room-status")
    this.lobbyConnectionStatus = rootDocument.getElementById("lobby-connection-status")
    this.lobbyMatchStatus = rootDocument.getElementById("lobby-match-status")
    this.menuServerStatus = rootDocument.getElementById("menu-server-status")
    this.playerSlots = rootDocument.getElementById("player-slots")
    this.loadoutOptions = rootDocument.getElementById("loadout-options")
    this.loadoutWeaponName = rootDocument.getElementById("loadout-weapon-name")
    this.loadoutWeaponDescription = rootDocument.getElementById("loadout-weapon-description")
    this.loadoutStatDamage = rootDocument.getElementById("loadout-stat-damage")
    this.loadoutStatFireRate = rootDocument.getElementById("loadout-stat-fire-rate")
    this.loadoutStatRecoil = rootDocument.getElementById("loadout-stat-recoil")
    this.loadoutStatReload = rootDocument.getElementById("loadout-stat-reload")

    this.screens = {
      main: rootDocument.getElementById("screen-main"),
      loadout: rootDocument.getElementById("screen-loadout"),
      settings: rootDocument.getElementById("screen-settings"),
      lobby: rootDocument.getElementById("screen-lobby"),
      message: rootDocument.getElementById("screen-message"),
    }

    this.cache = {
      health: "",
      ammo: "",
      enemies: "",
      score: "",
      kills: "",
      fps: "",
      status: "",
      crosshairGap: "",
    }

    this.hitTimer = 0
    this.damageTimer = 0
    this.activeScreen = "main"
    this.lobbyBusyAction = ""
    this.copyFeedbackTimer = 0
    this.copyFeedbackLabel = ""
  }

  updateHud(values) {
    const nextHealth = String(values.health)
    const nextAmmo = values.ammo
    const nextEnemies = String(values.enemies)
    const nextScore = String(values.score)
    const nextKills = String(values.kills)
    const nextFps = String(values.fps)

    if (this.cache.health !== nextHealth) {
      this.cache.health = nextHealth
      this.health.textContent = nextHealth
    }

    if (this.cache.ammo !== nextAmmo) {
      this.cache.ammo = nextAmmo
      this.ammo.textContent = nextAmmo
    }

    if (this.cache.enemies !== nextEnemies) {
      this.cache.enemies = nextEnemies
      this.enemies.textContent = nextEnemies
    }

    if (this.cache.score !== nextScore) {
      this.cache.score = nextScore
      this.score.textContent = nextScore
    }

    if (this.cache.kills !== nextKills) {
      this.cache.kills = nextKills
      this.kills.textContent = nextKills
    }

    if (this.cache.fps !== nextFps) {
      this.cache.fps = nextFps
      this.fps.textContent = nextFps
    }

    if (this.cache.status !== values.status) {
      this.cache.status = values.status
      this.status.textContent = values.status
    }

    const gap = values.crosshairGap.toFixed(1) + "px"
    if (this.cache.crosshairGap !== gap) {
      this.cache.crosshairGap = gap
      this.crosshair.style.setProperty("--crosshair-gap", gap)
    }

    if (values.loadoutSlots) {
      values.loadoutSlots.forEach((slot, index) => {
        if (!this.weaponSlots[index]) {
          return
        }

        this.weaponSlotNames[index].textContent = slot.name.toUpperCase()
        this.weaponSlotAmmo[index].textContent = slot.ammoText
        this.weaponSlots[index].classList.toggle("weapon-slot-active", slot.active)
      })
    }
  }

  showScreen(screenName) {
    Object.entries(this.screens).forEach(([name, element]) => {
      element.classList.toggle("hidden", name !== screenName)
    })
    this.activeScreen = screenName
    this.overlay.classList.remove("hidden")
  }

  showMainMenu() {
    this.showScreen("main")
  }

  showLoadoutMenu() {
    this.showScreen("loadout")
  }

  showSettingsMenu() {
    this.showScreen("settings")
  }

  showLobbyMenu() {
    this.showScreen("lobby")
  }

  renderMenuStatus(lobbyState) {
    if (!this.menuServerStatus) {
      return
    }

    this.menuServerStatus.textContent = `Server: ${getConnectionShortText(lobbyState.connectionState)}`
    setStatusClass(this.menuServerStatus, lobbyState.connectionState)
  }

  renderLobby(lobbyState) {
    if (this.lobbyRoomCode) {
      this.lobbyRoomCode.textContent = lobbyState.roomId || "Create or Join"
    }

    if (this.lobbyRoomStatus) {
      this.lobbyRoomStatus.textContent = this.lobbyBusyAction
        ? `${this.lobbyBusyAction}...`
        : lobbyState.status
    }

    if (this.lobbyConnectionStatus) {
      this.lobbyConnectionStatus.textContent = getConnectionShortText(lobbyState.connectionState)
      setStatusClass(this.lobbyConnectionStatus, lobbyState.connectionState)
    }

    if (this.lobbyMatchStatus) {
      this.lobbyMatchStatus.textContent = getLobbyMatchText(lobbyState)
      setStatusClass(this.lobbyMatchStatus, lobbyState.matchPhase === "playing" ? "connected" : "idle")
    }

    if (this.copyRoomCodeButton) {
      this.copyRoomCodeButton.disabled = !lobbyState.roomId
      if (!this.lobbyBusyAction) {
        this.copyRoomCodeButton.textContent = this.copyFeedbackTimer > 0
          ? this.copyFeedbackLabel
          : lobbyState.roomId
            ? "Copy"
            : "No Code"
      }
    }

    if (this.retryServerButton) {
      const shouldShowRetry = ["waking", "connecting", "disconnected", "error"].includes(lobbyState.connectionState)
      this.retryServerButton.classList.toggle("hidden", !shouldShowRetry)
      this.retryServerButton.disabled = this.lobbyBusyAction === "Waking server"
      this.retryServerButton.textContent = this.lobbyBusyAction === "Waking server"
        ? "Waking..."
        : "Wake / Retry Server"
    }

    if (this.createRoomButton) {
      this.createRoomButton.disabled = Boolean(this.lobbyBusyAction)
      this.createRoomButton.textContent = this.lobbyBusyAction === "Creating room" ? "Creating..." : "Create Room"
    }

    if (this.joinRoomButton) {
      this.joinRoomButton.disabled = Boolean(this.lobbyBusyAction)
      this.joinRoomButton.textContent = this.lobbyBusyAction === "Joining room" ? "Joining..." : "Join Room"
    }

    if (this.startRoomButton) {
      const canRestart = lobbyState.matchPhase === "ended"
      this.startRoomButton.classList.toggle("hidden", !lobbyState.isHost)
      this.startRoomButton.disabled = Boolean(this.lobbyBusyAction) || !lobbyState.isHost || (lobbyState.started && !canRestart)
      this.startRoomButton.textContent = this.lobbyBusyAction === "Starting match"
        ? "Starting..."
        : canRestart
          ? "Restart Match"
          : "Start Match"
    }

    if (!this.playerSlots) {
      return
    }

    const fragment = this.rootDocument.createDocumentFragment()
    for (let index = 0; index < 4; index += 1) {
      const player = lobbyState.players[index]
      const slot = this.rootDocument.createElement("div")
      const isHost = player?.id && player.id === lobbyState.hostId
      slot.className = [
        "slot-card",
        player ? "slot-card-active" : "slot-card-empty",
        isHost ? "slot-card-host" : "",
      ].filter(Boolean).join(" ")

      const copy = this.rootDocument.createElement("div")

      const label = this.rootDocument.createElement("span")
      label.className = "info-label"
      label.textContent = player ? `Slot ${index + 1} Ready` : `Slot ${index + 1}`
      const strong = this.rootDocument.createElement("strong")
      strong.textContent = player ? player.label : "Open"
      copy.append(label, strong)

      const badge = this.rootDocument.createElement("span")
      badge.className = `slot-badge${player ? "" : " slot-badge-muted"}`
      badge.textContent = isHost ? "Host" : player ? "Ready" : "Waiting"

      slot.append(copy, badge)
      fragment.append(slot)
    }

    this.playerSlots.replaceChildren(fragment)
  }

  setLobbyBusy(actionName) {
    this.lobbyBusyAction = actionName
  }

  clearLobbyBusy() {
    this.lobbyBusyAction = ""
  }

  isLobbyBusy(actionName = "") {
    return actionName ? this.lobbyBusyAction === actionName : Boolean(this.lobbyBusyAction)
  }

  showCopyFeedback(label = "Copied") {
    this.copyFeedbackLabel = label
    this.copyFeedbackTimer = 1.2
  }

  renderScoreboard(entries, options = {}) {
    if (!this.scoreboard || !this.scoreboardTable) {
      return
    }

    this.scoreboard.classList.toggle("hidden", !options.visible)
    if (!options.visible) {
      return
    }

    if (this.scoreboardTimer) {
      this.scoreboardTimer.textContent = options.timeText || "0:00"
    }

    const fragment = this.rootDocument.createDocumentFragment()
    const header = this.rootDocument.createElement("div")
    header.className = "scoreboard-row scoreboard-row-header"
    header.innerHTML = "<span>Player</span><span>K</span><span>D</span><span>Score</span><span>State</span>"
    fragment.append(header)

    entries.forEach((entry, index) => {
      const row = this.rootDocument.createElement("div")
      row.className = `scoreboard-row${index === 0 ? " scoreboard-row-leader" : ""}`
      row.innerHTML = `
        <span>${entry.label || entry.id}</span>
        <span>${entry.kills || 0}</span>
        <span>${entry.deaths || 0}</span>
        <span>${entry.score || 0}</span>
        <span>${entry.alive ? "Alive" : "Down"}</span>
      `
      fragment.append(row)
    })

    this.scoreboardTable.replaceChildren(fragment)
  }

  renderLoadout(weaponIds, weaponLibrary, selectedWeaponId) {
    this.loadoutOptions.replaceChildren(
      ...weaponIds.map((weaponId) => {
        const weapon = weaponLibrary[weaponId]
        const option = this.rootDocument.createElement("button")
        option.type = "button"
        option.className = `loadout-option${weaponId === selectedWeaponId ? " loadout-option-active" : ""}`
        option.dataset.weaponId = weaponId

        const title = this.rootDocument.createElement("strong")
        title.textContent = weapon.name
        const subtitle = this.rootDocument.createElement("span")
        subtitle.textContent = weapon.description

        option.append(title, subtitle)
        return option
      })
    )

    const selectedWeapon = weaponLibrary[selectedWeaponId]
    this.loadoutWeaponName.textContent = selectedWeapon.name
    this.loadoutWeaponDescription.textContent = selectedWeapon.description
    this.loadoutStatDamage.textContent = String(selectedWeapon.stats.damage)
    this.loadoutStatFireRate.textContent = `${(1 / selectedWeapon.stats.fireRate).toFixed(1)}/s`
    this.loadoutStatRecoil.textContent = `${selectedWeapon.stats.recoil.toFixed(2)}`
    this.loadoutStatReload.textContent = `${selectedWeapon.stats.reloadTime.toFixed(2)}s`
  }

  setOverlay(title, text, buttonLabel, eyebrow = "Practice Build") {
    this.overlayEyebrow.textContent = eyebrow
    this.overlayTitle.textContent = title
    this.overlayText.textContent = text
    this.overlayButton.textContent = buttonLabel
    this.showScreen("message")
  }

  hideOverlay() {
    this.overlay.classList.add("hidden")
  }

  updateDebugPanel(lines) {
    if (!this.debugPanelBody) {
      return
    }

    this.debugPanelBody.textContent = lines.join("\n")
  }

  pulseHitMarker() {
    this.hitTimer = 0.13
    this.hitMarker.classList.add("visible")
  }

  pulseDamage(amount) {
    this.damageTimer = clamp(this.damageTimer + amount * 0.008, 0, 0.65)
  }

  update(dt) {
    if (this.hitTimer > 0) {
      this.hitTimer = Math.max(0, this.hitTimer - dt)
      if (this.hitTimer === 0) {
        this.hitMarker.classList.remove("visible")
      }
    }

    if (this.damageTimer > 0) {
      this.damageTimer = Math.max(0, this.damageTimer - dt * 1.8)
    }

    if (this.copyFeedbackTimer > 0) {
      this.copyFeedbackTimer = Math.max(0, this.copyFeedbackTimer - dt)
    }

    this.screenFlash.style.opacity = String(clamp(this.damageTimer, 0, 0.45))
  }
}

function setStatusClass(element, state) {
  element.classList.remove("status-chip-online", "status-chip-error", "status-chip-waking", "status-chip-info")
  if (state === "connected" || state === "playing") {
    element.classList.add("status-chip-online")
  } else if (state === "error" || state === "disconnected") {
    element.classList.add("status-chip-error")
  } else if (state === "waking" || state === "connecting") {
    element.classList.add("status-chip-waking")
  } else {
    element.classList.add("status-chip-info")
  }
}

function getConnectionShortText(state) {
  if (state === "connected") {
    return "Connected"
  }
  if (state === "waking") {
    return "Waking"
  }
  if (state === "connecting") {
    return "Connecting"
  }
  if (state === "error") {
    return "Offline"
  }
  if (state === "disconnected") {
    return "Disconnected"
  }
  return "Ready"
}

function getLobbyMatchText(lobbyState) {
  if (lobbyState.matchPhase === "countdown") {
    return `Starting in ${Math.ceil(lobbyState.countdownRemaining || 0)}`
  }

  if (lobbyState.matchPhase === "playing") {
    return "Match live"
  }

  if (lobbyState.matchPhase === "ended") {
    return "Match ended"
  }

  return "Lobby"
}
