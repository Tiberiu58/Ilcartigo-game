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
    this.startRoomButton = rootDocument.getElementById("start-room-button")
    this.lobbyRoomCode = rootDocument.getElementById("lobby-room-code")
    this.lobbyRoomStatus = rootDocument.getElementById("lobby-room-status")
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

  renderLobby(lobbyState) {
    if (this.lobbyRoomCode) {
      this.lobbyRoomCode.textContent = lobbyState.roomId || "Created On Join"
    }

    if (this.lobbyRoomStatus) {
      this.lobbyRoomStatus.textContent = lobbyState.status
    }

    if (this.copyRoomCodeButton) {
      this.copyRoomCodeButton.disabled = !lobbyState.roomId
    }

    if (this.startRoomButton) {
      this.startRoomButton.classList.toggle("hidden", !lobbyState.isHost)
      this.startRoomButton.disabled = !lobbyState.isHost || lobbyState.started
    }

    if (!this.playerSlots) {
      return
    }

    const fragment = this.rootDocument.createDocumentFragment()
    for (let index = 0; index < 4; index += 1) {
      const player = lobbyState.players[index]
      const slot = this.rootDocument.createElement("div")
      slot.className = `slot-card${player ? " slot-card-active" : ""}`

      const label = this.rootDocument.createElement("span")
      label.className = "info-label"
      label.textContent = `Slot ${index + 1}`

      const strong = this.rootDocument.createElement("strong")
      strong.textContent = player ? player.label : "Open"

      slot.append(label, strong)
      fragment.append(slot)
    }

    this.playerSlots.replaceChildren(fragment)
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

    this.screenFlash.style.opacity = String(clamp(this.damageTimer, 0, 0.45))
  }
}
