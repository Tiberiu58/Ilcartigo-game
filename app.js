import { BABYLON } from "./babylon.js"
import { InputController } from "./input.js"
import { UIController } from "./ui.js"
import { Level } from "./level.js?v=snow-courtyard-v4"
import { PlayerController } from "./player.js"
import { Rifle } from "./weapon.js"
import { EnemyManager } from "./enemies.js"
import { TeleportAbility } from "./teleport.js?v=snow-courtyard-v4"
import { LOADOUT_CONFIG, LOOP_CONFIG } from "./config.js?v=snow-courtyard-v4"

export function bootstrapGame() {
  const APP_STATES = {
    menu: "menu",
    playing: "playing",
    dead: "dead",
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
  scene.clearColor = BABYLON.Color4.FromHexString("#dbe4eaFF")
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR
  scene.fogStart = 52
  scene.fogEnd = 112
  scene.fogColor = BABYLON.Color3.FromHexString("#d4dde4")
  scene.skipPointerMovePicking = true
  scene.imageProcessingConfiguration.isEnabled = false

  const hemiLight = new BABYLON.HemisphericLight(
    "hemiLight",
    new BABYLON.Vector3(0.12, 1, 0.1),
    scene
  )
  hemiLight.intensity = 1.18
  hemiLight.groundColor = BABYLON.Color3.FromHexString("#b5c1cb")
  hemiLight.diffuse = BABYLON.Color3.FromHexString("#f6fbff")

  const fillLight = new BABYLON.DirectionalLight(
    "fillLight",
    new BABYLON.Vector3(-0.18, -1, 0.12),
    scene
  )
  fillLight.intensity = 0.28
  fillLight.diffuse = BABYLON.Color3.FromHexString("#d8e7f8")

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
  scene.activeCamera = player.camera

  let appState = APP_STATES.menu
  let fpsValue = 60
  let runState = null
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
      `pointerLocked: ${input.isLocked()}`,
      `pointerEvent: ${debugState.lastPointerEvent}`,
      `inputEvent: ${debugState.lastInputEvent}`,
      `frame: ${debugState.frame}`,
      `fps: ${Math.round(fpsValue)}`,
      `look: ${input.lookX.toFixed(2)}, ${input.lookY.toFixed(2)}`,
      `keys: W${input.keys.KeyW ? 1 : 0} A${input.keys.KeyA ? 1 : 0} S${input.keys.KeyS ? 1 : 0} D${input.keys.KeyD ? 1 : 0}`,
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

  function resetScenario() {
    player.reset(level.getPlayerSpawn())
    enemies.reset()
    weapon.reset()
    teleport.reset()
    input.resetTransientState()
    runState = createRunState()
    debugState.lastFrameNote = "scenario reset"
  }

  function beginRun() {
    resetScenario()
    appState = APP_STATES.playing
    ui.hideOverlay()
    debugState.phase = "playing"
    debugState.lastFrameNote = "beginRun"
  }

  function showDeathOverlay() {
    appState = APP_STATES.dead
    debugState.phase = "dead"
    debugState.lastFrameNote = "player dead"
    ui.setOverlay(
      "Operator Down",
      `Score ${runState.score}. Kills ${runState.kills}. Best streak ${runState.bestStreak}. Reached wave ${runState.bestWave}. Restart and go again.`,
      "Restart Run",
      "Run Over"
    )
  }

  function lockPointer() {
    if (typeof canvas.focus === "function") {
      canvas.focus({ preventScroll: true })
    }
    debugState.lastPointerEvent = "request lock"
    input.requestPointerLock()
  }

  function handleOverlayAction() {
    beginRun()
    lockPointer()
  }

  function showMainMenu() {
    appState = APP_STATES.menu
    debugState.phase = "menu"
    debugState.lastFrameNote = "main menu"
    ui.showMainMenu()
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

  ui.overlayButton.addEventListener("click", handleOverlayAction)
  ui.playButton.addEventListener("click", () => {
    beginRun()
    lockPointer()
  })

  canvas.addEventListener("click", () => {
    debugState.lastInputEvent = "canvas click"
    if (appState === APP_STATES.playing && !input.isLocked()) {
      lockPointer()
    }
  })

  window.addEventListener("resize", () => {
    engine.resize()
  })

  function getStatusText() {
    if (appState === APP_STATES.menu) {
      return "Press Play to start a run."
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
        if (runState.streakTimer > 0) {
          runState.streakTimer = Math.max(0, runState.streakTimer - dt)
          if (runState.streakTimer === 0) {
            runState.streak = 0
            runState.lastComboBonus = 0
          }
        }

        player.update(dt)
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
        teleport.update(dt, false)
        weapon.update(dt, {
          active: false,
          input,
          player,
          enemies,
          level,
        })
      }

      debugState.lastFrameNote = "frame ok"
      ui.update(dt)
      ui.updateHud({
        health: player.getHealth(),
        ammo: weapon.getAmmoText(),
        enemies: enemies.getAliveCount(),
        score: runState.score,
        kills: runState.kills,
        fps: Math.round(fpsValue),
        status: getStatusText(),
        crosshairGap: weapon.getCrosshairGap(player),
        loadoutSlots: weapon.getLoadoutSlots(),
      })
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : String(error))
    }

    updateDebugPanel()
    scene.render()
  })

  resetScenario()
  showMainMenu()
  updateDebugPanel()

  window.addEventListener("beforeunload", () => {
    input.dispose()
    scene.dispose()
    engine.dispose()
  })
}
