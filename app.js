import { BABYLON } from "./babylon.js"
import { InputController } from "./input.js?v=multiplayer-v16"
import { UIController } from "./ui.js?v=multiplayer-v16"
import { Level } from "./level.js?v=multiplayer-v16"
import { PlayerController } from "./player.js?v=multiplayer-v16"
import { Rifle } from "./weapon.js?v=multiplayer-v16"
import { EnemyManager } from "./enemies.js"
import { TeleportAbility } from "./teleport.js?v=multiplayer-v16"
import { LOADOUT_CONFIG, LOOP_CONFIG } from "./config.js?v=multiplayer-v16"
import { MultiplayerSession } from "./client/multiplayerSession.js?v=multiplayer-v16"
import { RemotePlayers } from "./client/remotePlayers.js?v=multiplayer-v16"

export function bootstrapGame() {
  const APP_STATES = {
    menu: "menu",
    lobby: "lobby",
    playing: "playing",
    dead: "dead",
  }

  const GAME_MODES = {
    singleplayer: "singleplayer",
    multiplayer: "multiplayer",
  }

  const canvas = document.getElementById("renderCanvas")
  const ui = new UIController(document)
  const input = new InputController(canvas)
  input.connect()

  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    powerPreference: "high-performance",
  })

  const deviceRatio = Math.max(1, window.devicePixelRatio || 1)
  if (deviceRatio > 1.2) {
    engine.setHardwareScalingLevel(Math.min(2, deviceRatio / 1.15))
  }

  const scene = new BABYLON.Scene(engine)
  scene.clearColor = BABYLON.Color4.FromHexString("#9caab5FF")
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR
  scene.fogStart = 52
  scene.fogEnd = 112
  scene.fogColor = BABYLON.Color3.FromHexString("#8d99a5")
  scene.skipPointerMovePicking = true
  scene.imageProcessingConfiguration.isEnabled = false

  const hemiLight = new BABYLON.HemisphericLight(
    "hemiLight",
    new BABYLON.Vector3(0.12, 1, 0.1),
    scene
  )
  hemiLight.intensity = 0.98
  hemiLight.groundColor = BABYLON.Color3.FromHexString("#7b8792")
  hemiLight.diffuse = BABYLON.Color3.FromHexString("#d9e2e9")

  const fillLight = new BABYLON.DirectionalLight(
    "fillLight",
    new BABYLON.Vector3(-0.18, -1, 0.12),
    scene
  )
  fillLight.intensity = 0.18
  fillLight.diffuse = BABYLON.Color3.FromHexString("#b9c7d4")

  const level = new Level(scene)
  const player = new PlayerController(scene, input, level)
  const enemies = new EnemyManager(scene, level)
  const weapon = new Rifle(
    scene,
    player,
    LOADOUT_CONFIG.defaultPrimaryWeaponId,
    LOADOUT_CONFIG.primaryWeaponIds
  )
  const teleport = new TeleportAbility(scene, player, input, level)
  const network = new MultiplayerSession()
  const remotePlayers = new RemotePlayers(scene)
  scene.activeCamera = player.camera

  let appState = APP_STATES.menu
  let gameMode = GAME_MODES.singleplayer
  let fpsValue = 60
  let runState = null
  let overlayAction = () => {
    beginSinglePlayerRun()
    lockPointer()
  }

  const debugState = {
    phase: "boot",
    frame: 0,
    lastError: "",
    lastPointerEvent: "init",
    lastInputEvent: "init",
    lastFrameNote: "boot",
  }

  function setDebugError(message) {
    debugState.lastError = message
    debugState.lastFrameNote = "error"
  }

  function updateDebugPanel() {
    ui.updateDebugPanel([
      `phase: ${debugState.phase}`,
      `state: ${appState}`,
      `mode: ${gameMode}`,
      `room: ${network.roomId || "none"}`,
      `pointerLocked: ${input.isLocked()}`,
      `pointerEvent: ${debugState.lastPointerEvent}`,
      `inputEvent: ${debugState.lastInputEvent}`,
      `frame: ${debugState.frame}`,
      `fps: ${Math.round(fpsValue)}`,
      `look: ${input.lookX.toFixed(2)}, ${input.lookY.toFixed(2)}`,
      `keys: W${input.keys.KeyW ? 1 : 0} A${input.keys.KeyA ? 1 : 0} S${input.keys.KeyS ? 1 : 0} D${input.keys.KeyD ? 1 : 0}`,
      `reconcile: ${player.getLastReconcileNote()}`,
      `note: ${debugState.lastFrameNote}`,
      `error: ${debugState.lastError || "none"}`,
    ])
  }

  function createRunState() {
    return {
      score: 0,
      kills: 0,
      bestWave: 1,
      clearedWave: 0,
      streak: 0,
      streakTimer: 0,
      bestStreak: 0,
      lastComboBonus: 0,
    }
  }

  function resetScenarioBase() {
    player.reset(level.getPlayerSpawn())
    weapon.reset()
    teleport.reset()
    input.resetTransientState()
    runState = createRunState()
    debugState.lastFrameNote = "scenario reset"
  }

  function resetSinglePlayerScenario() {
    resetScenarioBase()
    enemies.setEnabled(true)
    enemies.reset()
    remotePlayers.clear()
  }

  function resetMultiplayerScenario() {
    resetScenarioBase()
    enemies.setEnabled(false)
    enemies.reset()
    remotePlayers.clear()
  }

  function lockPointer() {
    if (typeof canvas.focus === "function") {
      canvas.focus({ preventScroll: true })
    }
    debugState.lastPointerEvent = "request lock"
    input.requestPointerLock()
  }

  function beginSinglePlayerRun() {
    leaveMultiplayer()
    gameMode = GAME_MODES.singleplayer
    resetSinglePlayerScenario()
    appState = APP_STATES.playing
    ui.hideOverlay()
    debugState.phase = "playing"
    debugState.lastFrameNote = "begin singleplayer"
  }

  function enterMultiplayerMatch(reason = "match started") {
    gameMode = GAME_MODES.multiplayer
    appState = APP_STATES.playing
    ui.hideOverlay()
    debugState.phase = "playing"
    debugState.lastFrameNote = reason
    debugState.lastPointerEvent = "awaiting click to lock"
    debugState.lastError = ""
  }

  function renderLobbyState(statusOverride = "") {
    const lobbyState = network.getLobbyState()
    if (typeof ui.renderLobby === "function") {
      ui.renderLobby({
        ...lobbyState,
        status: statusOverride || lobbyState.status,
      })
    }
  }

  async function beginMultiplayerRun(mode) {
    try {
      debugState.lastFrameNote = `multiplayer ${mode}`
      gameMode = GAME_MODES.multiplayer
      appState = APP_STATES.lobby
      resetMultiplayerScenario()
      renderLobbyState(mode === "create" ? "Creating room..." : "Joining room...")
      ui.showLobbyMenu()
      let roomInfo
      if (mode === "create") {
        roomInfo = await network.createRoom()
      } else {
        const roomCode = window.prompt("Enter room code") || ""
        if (!roomCode.trim()) {
          return
        }
        roomInfo = await network.joinRoom(roomCode)
      }

      appState = APP_STATES.lobby
      debugState.phase = "lobby"
      debugState.lastFrameNote = `joined room ${roomInfo.roomId}`
      renderLobbyState(mode === "create" ? `Room ${roomInfo.roomId} created.` : `Joined room ${roomInfo.roomId}.`)
      ui.showLobbyMenu()
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : String(error))
      showLobbyMenu(error instanceof Error ? error.message : String(error))
    }
  }

  function showDeathOverlay() {
    appState = APP_STATES.dead
    debugState.phase = "dead"
    debugState.lastFrameNote = "player dead"
    overlayAction = () => {
      beginSinglePlayerRun()
      lockPointer()
    }
    ui.setOverlay(
      "Operator Down",
      `Score ${runState.score}. Kills ${runState.kills}. Best streak ${runState.bestStreak}. Reached wave ${runState.bestWave}. Restart and go again.`,
      "Restart Run",
      "Run Over"
    )
  }

  function showMainMenu() {
    appState = APP_STATES.menu
    debugState.phase = "menu"
    debugState.lastFrameNote = "main menu"
    ui.showMainMenu()
  }

  function showLobbyMenu(statusOverride = "") {
    appState = APP_STATES.lobby
    debugState.phase = "lobby"
    debugState.lastFrameNote = "lobby menu"
    if (network.roomId) {
      gameMode = GAME_MODES.multiplayer
    }
    renderLobbyState(statusOverride)
    ui.showLobbyMenu()
  }

  function leaveMultiplayer() {
    network.leaveRoom()
    remotePlayers.clear()
    gameMode = GAME_MODES.singleplayer
  }

  network.onLobbyStateChanged = () => {
    if (network.roomId) {
      gameMode = GAME_MODES.multiplayer
    }
    if (appState === APP_STATES.lobby) {
      renderLobbyState()
    }
  }

  network.onMatchStarted = ({ roomId }) => {
    enterMultiplayerMatch(`match started ${roomId}`)
  }

  input.onPointerLockChange = (locked) => {
    debugState.lastPointerEvent = locked ? "lock acquired" : "lock released"
  }
  input.onPointerLockError = () => {
    setDebugError("pointer lock error")
    debugState.lastPointerEvent = "lock error"
  }

  window.addEventListener("error", (event) => {
    setDebugError(event.error?.message || event.message || "window error")
  })

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    setDebugError(`promise rejection: ${reason}`)
  })

  ui.overlayButton.addEventListener("click", () => {
    overlayAction()
  })
  ui.playButton?.addEventListener("click", () => {
    overlayAction = () => {
      beginSinglePlayerRun()
      lockPointer()
    }
    beginSinglePlayerRun()
    lockPointer()
  })
  ui.lobbyButton?.addEventListener("click", showLobbyMenu)
  ui.lobbyBackButton?.addEventListener("click", () => {
    leaveMultiplayer()
    showMainMenu()
  })
  ui.lobbySoloButton?.addEventListener("click", () => {
    leaveMultiplayer()
    beginSinglePlayerRun()
    lockPointer()
  })
  ui.createRoomButton?.addEventListener("click", () => {
    beginMultiplayerRun("create")
  })
  ui.joinRoomButton?.addEventListener("click", () => {
    beginMultiplayerRun("join")
  })
  ui.copyRoomCodeButton?.addEventListener("click", async () => {
    const roomCode = network.roomId
    if (!roomCode) {
      renderLobbyState("No room code available yet.")
      return
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard unavailable")
      }
      await navigator.clipboard.writeText(roomCode)
      renderLobbyState("Room code copied to clipboard.")
    } catch {
      renderLobbyState("Could not copy room code.")
    }
  })
  ui.startRoomButton?.addEventListener("click", () => {
    const started = network.requestStartMatch()
    if (!started) {
      renderLobbyState(network.getLobbyState().status)
      return
    }
    renderLobbyState("Starting match...")
  })

  canvas.addEventListener("click", () => {
    debugState.lastInputEvent = "canvas click"
  })

  window.addEventListener("resize", () => {
    engine.resize()
  })

  function getSinglePlayerStatusText() {
    if (appState === APP_STATES.menu) {
      return "Press Play to start a run."
    }

    if (appState === APP_STATES.lobby) {
      return network.getLobbyState().status
    }

    if (appState === APP_STATES.dead) {
      return "Operator down. Restart the run."
    }

    if (!input.isLocked()) {
      return "Click the viewport to relock the mouse."
    }

    const teleportStatus = teleport.getStatusText()
    if (teleportStatus) {
      return teleportStatus
    }

    if (weapon.isReloading()) {
      return "Reloading rifle."
    }

    if (player.isAirborne()) {
      return "Airborne."
    }

    if (runState.streak > 1 && runState.streakTimer > 0) {
      return `Combo x${runState.streak}. ${runState.streakTimer.toFixed(1)}s to chain the next kill.`
    }

    if (player.isSprinting()) {
      return `Wave ${enemies.getWave()} live. Sprinting through the facility.`
    }

    if (enemies.isWaitingForNextWave()) {
      return `Wave ${enemies.getWave() + 1} inbound in ${enemies.getWaveCountdown().toFixed(1)}s.`
    }

    return `Wave ${enemies.getWave()} live. Score ${runState.score}. Sweep the patrol routes.`
  }

  function getMultiplayerStatusText() {
    if (appState === APP_STATES.lobby) {
      return network.getLobbyState().status
    }

    if (!input.isLocked()) {
      return "Click the viewport to relock the mouse."
    }

    const teleportStatus = teleport.getStatusText()
    if (teleportStatus) {
      return teleportStatus
    }

    if (weapon.isReloading()) {
      return "Reloading weapon."
    }

    return network.getStatusText()
  }

  engine.runRenderLoop(() => {
    try {
      debugState.frame += 1
      const dt = Math.min(0.05, engine.getDeltaTime() / 1000 || 0.016)
      const reportedFps = engine.getFps()
      if (Number.isFinite(reportedFps)) {
        fpsValue += (reportedFps - fpsValue) * Math.min(1, dt * 4)
      }

      debugState.lastInputEvent = `mouse:${input.lookX.toFixed(2)},${input.lookY.toFixed(2)} fire:${input.fireHeld ? 1 : 0}`

      if (appState === APP_STATES.playing) {
        const jumpPressed = input.consumeJumpPressed()
        player.update(dt, { jumpPressed })

        if (gameMode === GAME_MODES.singleplayer) {
          if (runState.streakTimer > 0) {
            runState.streakTimer = Math.max(0, runState.streakTimer - dt)
            if (runState.streakTimer === 0) {
              runState.streak = 0
              runState.lastComboBonus = 0
            }
          }

          runState.bestWave = Math.max(runState.bestWave, enemies.getWave())
          teleport.update(dt, true)

          const weaponResult = weapon.update(dt, {
            active: !teleport.blocksWeaponInput(),
            input,
            player,
            enemies,
            level,
          })

          if (weaponResult.hit) {
            runState.score += weaponResult.killed ? LOOP_CONFIG.killScore : LOOP_CONFIG.hitScore
            ui.pulseHitMarker()
          }

          if (weaponResult.killed) {
            runState.kills += 1
            runState.streak = runState.streakTimer > 0 ? runState.streak + 1 : 1
            runState.streakTimer = LOOP_CONFIG.comboWindow
            runState.bestStreak = Math.max(runState.bestStreak, runState.streak)

            if (runState.streak > 1) {
              runState.lastComboBonus = Math.min(
                LOOP_CONFIG.comboMaxBonus,
                (runState.streak - 1) * LOOP_CONFIG.comboStepScore
              )
              runState.score += runState.lastComboBonus
            } else {
              runState.lastComboBonus = 0
            }
          }

          const damageTaken = enemies.update(dt, player, level)
          if (damageTaken > 0) {
            ui.pulseDamage(damageTaken)
          }

          if (!enemies.isWaitingForNextWave() && runState.clearedWave < enemies.getWave() - 1) {
            runState.clearedWave = enemies.getWave() - 1
            runState.score += LOOP_CONFIG.waveClearScore
            runState.streak = 0
            runState.streakTimer = 0
            runState.lastComboBonus = 0
          }

          if (player.isDead()) {
            if (input.isLocked()) {
              document.exitPointerLock()
            }
            showDeathOverlay()
          }
        } else {
          teleport.update(dt, true, { multiplayer: true, networkSession: network })
          weapon.update(dt, {
            active: !teleport.blocksWeaponInput(),
            input,
            player,
            enemies: null,
            level,
            networkSession: network,
          })
          network.update(dt, { input, player, weapon, teleport, jumpPressed })
          remotePlayers.syncSnapshots(network.getRemoteSnapshots())
          remotePlayers.update(dt)

          if (network.consumeHitMarkerPulse()) {
            ui.pulseHitMarker()
          }

          const damageTaken = network.consumeDamagePulse()
          if (damageTaken > 0) {
            ui.pulseDamage(damageTaken)
          }
        }
      } else if (appState === APP_STATES.lobby) {
        renderLobbyState()
        if (gameMode === GAME_MODES.multiplayer && network.hasStarted()) {
          enterMultiplayerMatch(`match started ${network.roomId}`)
        }
      } else {
        teleport.update(dt, false)
        weapon.update(dt, {
          active: false,
          input,
          player,
          enemies,
          level,
        })
        remotePlayers.update(dt)
      }

      debugState.lastFrameNote = "frame ok"
      ui.update(dt)
      ui.updateHud({
        health: player.getHealth(),
        ammo: weapon.getAmmoText(),
        enemies: gameMode === GAME_MODES.multiplayer
          ? network.getRemoteSnapshots().length + (network.roomId ? 1 : 0)
          : enemies.getAliveCount(),
        score: gameMode === GAME_MODES.multiplayer ? network.getScore() : runState.score,
        kills: gameMode === GAME_MODES.multiplayer ? network.getKills() : runState.kills,
        fps: Math.round(fpsValue),
        status: gameMode === GAME_MODES.multiplayer ? getMultiplayerStatusText() : getSinglePlayerStatusText(),
        crosshairGap: weapon.getCrosshairGap(player),
        loadoutSlots: weapon.getLoadoutSlots(),
      })
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : String(error))
    }

    updateDebugPanel()
    scene.render()
  })

  resetSinglePlayerScenario()
  showMainMenu()
  updateDebugPanel()

  window.addEventListener("beforeunload", () => {
    input.dispose()
    network.disconnect()
    remotePlayers.clear()
    scene.dispose()
    engine.dispose()
  })
}
