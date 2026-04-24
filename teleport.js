import { BABYLON } from "./babylon.js"
import { PLAYER_CONFIG, TELEPORT_CONFIG } from "./config.js"
import { clamp, damp } from "./utils.js"

export class TeleportAbility {
  constructor(scene, player, input, level) {
    this.scene = scene
    this.player = player
    this.input = input
    this.level = level

    this.state = "idle"
    this.cooldownTimer = 0
    this.statusText = ""
    this.statusTimer = 0
    this.previewAlpha = 0
    this.markerVisible = false
    this.markerPosition = new BABYLON.Vector3()
    this.awaitingKeyRelease = false

    this.createMarkerMeshes()
    this.hideMarker()
  }

  createMarkerMeshes() {
    this.markerRoot = new BABYLON.TransformNode("teleportMarkerRoot", this.scene)

    this.validMaterial = new BABYLON.StandardMaterial("teleportMarkerValidMaterial", this.scene)
    this.validMaterial.diffuseColor = BABYLON.Color3.FromHexString("#7affc4")
    this.validMaterial.emissiveColor = BABYLON.Color3.FromHexString("#1f9a6c")
    this.validMaterial.specularColor = BABYLON.Color3.Black()
    this.validMaterial.alpha = 0

    this.pulseMaterial = new BABYLON.StandardMaterial("teleportMarkerPulseMaterial", this.scene)
    this.pulseMaterial.diffuseColor = BABYLON.Color3.FromHexString("#c0fff0")
    this.pulseMaterial.emissiveColor = BABYLON.Color3.FromHexString("#5fd9c1")
    this.pulseMaterial.specularColor = BABYLON.Color3.Black()
    this.pulseMaterial.alpha = 0

    this.markerRing = BABYLON.MeshBuilder.CreateCylinder(
      "teleportMarkerRing",
      { diameter: 1.2, height: 0.03, tessellation: 20 },
      this.scene
    )
    this.markerRing.parent = this.markerRoot
    this.markerRing.position.y = 0.02
    this.markerRing.isPickable = false
    this.markerRing.renderingGroupId = 2
    this.markerRing.material = this.validMaterial

    this.markerPillar = BABYLON.MeshBuilder.CreateCylinder(
      "teleportMarkerPillar",
      { diameterTop: 0.08, diameterBottom: 0.18, height: TELEPORT_CONFIG.previewHeight, tessellation: 10 },
      this.scene
    )
    this.markerPillar.parent = this.markerRoot
    this.markerPillar.position.y = TELEPORT_CONFIG.previewHeight * 0.5
    this.markerPillar.isPickable = false
    this.markerPillar.renderingGroupId = 2
    this.markerPillar.material = this.validMaterial

    this.markerPulse = BABYLON.MeshBuilder.CreateCylinder(
      "teleportMarkerPulse",
      { diameter: 1.05, height: 0.02, tessellation: 20 },
      this.scene
    )
    this.markerPulse.parent = this.markerRoot
    this.markerPulse.position.y = 0.015
    this.markerPulse.isPickable = false
    this.markerPulse.renderingGroupId = 2
    this.markerPulse.material = this.pulseMaterial
  }

  reset() {
    this.state = "idle"
    this.cooldownTimer = 0
    this.statusText = ""
    this.statusTimer = 0
    this.previewAlpha = 0
    this.markerVisible = false
    this.awaitingKeyRelease = false
    this.hideMarker()
  }

  update(dt, active, context = null) {
    if (context?.multiplayer) {
      this.updateMultiplayer(dt, active, context)
      return
    }

    if (!active) {
      this.state = "idle"
      this.cooldownTimer = 0
      this.markerVisible = false
      this.statusText = ""
      this.statusTimer = 0
      this.hideMarker()
      return
    }

    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt)
      if (this.statusTimer === 0 && this.state === "idle") {
        this.statusText = ""
      }
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt)
    }

    if (this.awaitingKeyRelease && !this.isTeleportHeld()) {
      this.awaitingKeyRelease = false
    }

    if (this.consumeTeleportPressed()) {
      if (this.awaitingKeyRelease) {
        this.updateMarkerVisuals(dt)
        return
      }

      if (this.cooldownTimer > 0) {
        this.setStatus(`Teleport cooling down: ${this.cooldownTimer.toFixed(1)}s`, 0.7)
        this.updateMarkerVisuals(dt)
        return
      }

      if (this.state === "placed") {
        this.teleportToMarker()
      } else {
        this.placeMarker()
      }
    }

    if (this.state === "placed") {
      this.markerVisible = true
      this.statusText = "Teleport marker set. Press Q again to teleport."
      this.statusTimer = 0
    }

    this.updateMarkerVisuals(dt)
  }

  updateMultiplayer(dt, active, context) {
    if (!active) {
      this.hideMarker()
      return
    }

    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt)
      if (this.statusTimer === 0) {
        this.statusText = ""
      }
    }

    if (this.awaitingKeyRelease && !this.isTeleportHeld()) {
      this.awaitingKeyRelease = false
    }

    if (this.consumeTeleportPressed() && !this.awaitingKeyRelease) {
      context.networkSession.requestTeleportAction()
      this.awaitingKeyRelease = true
      this.setStatus(
        this.markerVisible ? "Teleport request sent." : "Teleport marker request sent.",
        0.45
      )
    }

    this.updateMarkerVisuals(dt)
  }

  placeMarker() {
    const targetInfo = this.computeTarget()
    if (!targetInfo.valid) {
      this.state = "idle"
      this.markerVisible = false
      this.setStatus(targetInfo.reason, 0.8)
      return
    }

    this.state = "placed"
    this.markerVisible = true
    this.markerPosition.copyFromFloats(targetInfo.x, this.level.floorY, targetInfo.z)
    this.awaitingKeyRelease = true
    this.setStatus("Teleport marker placed. Press Q again to teleport.", 0.8)
  }

  teleportToMarker() {
    if (!this.validateMarkerPosition()) {
      this.state = "idle"
      this.markerVisible = false
      this.setStatus("Teleport marker lost. Place a new one.", 0.8)
      return
    }

    this.player.teleportTo(this.markerPosition.x, this.markerPosition.z)
    this.state = "idle"
    this.cooldownTimer = TELEPORT_CONFIG.cooldown
    this.markerVisible = false
    this.awaitingKeyRelease = true
    this.setStatus(`Teleported to marker. Cooldown ${this.cooldownTimer.toFixed(1)}s`, 0.9)
  }

  validateMarkerPosition() {
    const radius = PLAYER_CONFIG.radius + TELEPORT_CONFIG.clearancePadding
    return this.level.canOccupyPosition(
      this.markerPosition.x,
      this.markerPosition.z,
      radius
    )
  }

  computeTarget() {
    const look = this.player.getLookDirection()
    const horizontalLength = Math.hypot(look.x, look.z)
    const origin = this.player.getCenterPosition()

    if (horizontalLength < 0.0001) {
      return {
        valid: false,
        x: this.player.position.x,
        z: this.player.position.z,
        reason: "Teleport marker needs a clear forward angle.",
      }
    }

    const dirX = look.x / horizontalLength
    const dirZ = look.z / horizontalLength
    const horizontalWallDistance = this.level.raycastWalls(
      origin,
      { x: dirX, z: dirZ },
      TELEPORT_CONFIG.range
    )
    let targetDistance = Math.min(
      TELEPORT_CONFIG.range,
      Math.max(0, horizontalWallDistance - TELEPORT_CONFIG.wallBuffer)
    )

    if (look.y < -0.08) {
      const floorDistance = (this.level.floorY - this.player.getShootOrigin().y) / look.y
      if (floorDistance > 0) {
        targetDistance = Math.min(targetDistance, floorDistance * horizontalLength)
      }
    }

    targetDistance = clamp(targetDistance, 0, TELEPORT_CONFIG.range)

    const x = this.player.position.x + dirX * targetDistance
    const z = this.player.position.z + dirZ * targetDistance

    if (targetDistance < TELEPORT_CONFIG.minRange) {
      return {
        valid: false,
        x,
        z,
        reason: "Teleport marker needs a little more room.",
      }
    }

    const radius = PLAYER_CONFIG.radius + TELEPORT_CONFIG.clearancePadding
    const valid = this.level.validateTeleportTarget(origin, { x, z }, radius)

    return {
      valid,
      x,
      z,
      reason: valid ? "" : "Teleport marker target is blocked.",
    }
  }

  updateMarkerVisuals(dt) {
    const targetAlpha = this.markerVisible ? 1 : 0
    this.previewAlpha = damp(this.previewAlpha, targetAlpha, 18, dt)

    if (this.previewAlpha < 0.01) {
      this.hideMarker()
      return
    }

    this.markerRoot.setEnabled(true)
    this.markerRoot.position.set(this.markerPosition.x, this.level.floorY, this.markerPosition.z)

    const pulse = 0.55 + Math.sin(performance.now() * 0.01) * 0.08
    this.validMaterial.alpha = this.previewAlpha * (0.32 + pulse)
    this.markerPillar.scaling.y = 1.08
    this.pulseMaterial.alpha = this.previewAlpha * 0.28
    this.markerPulse.scaling.x = 1 + Math.sin(performance.now() * 0.006) * 0.08
    this.markerPulse.scaling.z = 1 + Math.sin(performance.now() * 0.006) * 0.08
  }

  hideMarker() {
    this.markerRoot.setEnabled(false)
    this.validMaterial.alpha = 0
    this.pulseMaterial.alpha = 0
  }

  setStatus(text, duration = 0.6) {
    this.statusText = text
    this.statusTimer = duration
  }

  syncNetworkState(state) {
    this.cooldownTimer = state?.cooldown || 0
    if (state?.marker) {
      this.markerVisible = true
      this.markerPosition.copyFromFloats(state.marker.x, this.level.floorY, state.marker.z)
    } else {
      this.markerVisible = false
    }
  }

  consumeTeleportPressed() {
    return this.input.consumeTeleportPressed()
  }

  isTeleportHeld() {
    return Boolean(this.input.keys?.KeyQ)
  }

  blocksWeaponInput() {
    return false
  }

  getStatusText() {
    if (this.state === "placed") {
      return this.statusText
    }

    if (this.markerVisible && this.statusTimer <= 0) {
      return "Teleport marker active. Press Q again to teleport."
    }

    if (this.cooldownTimer > 0 && this.statusTimer <= 0) {
      return `Teleport cooling down: ${this.cooldownTimer.toFixed(1)}s`
    }

    if (this.statusTimer > 0) {
      return this.statusText
    }

    return ""
  }
}
