import { BABYLON } from "./babylon.js"
import { getWeaponDefinition, LOADOUT_CONFIG, WEAPON_CONFIG } from "./config.js"
import { clamp, damp } from "./utils.js"

export class Rifle {
  constructor(
    scene,
    player,
    weaponId = LOADOUT_CONFIG.defaultPrimaryWeaponId,
    weaponIds = LOADOUT_CONFIG.primaryWeaponIds
  ) {
    this.scene = scene
    this.player = player
    this.weaponIds = [...weaponIds]
    this.weaponStates = Object.create(null)
    this.weaponId = weaponId
    this.weaponDefinition = getWeaponDefinition(weaponId)
    this.weaponConfig = this.createWeaponConfig(this.weaponDefinition)

    this.root = new BABYLON.TransformNode("rifleRoot", scene)
    this.root.parent = player.camera

    this.basePosition = new BABYLON.Vector3(0.31, -0.31, 0.62)
    this.baseRotation = new BABYLON.Vector3(0.04, 0, 0)
    this.baseMagazinePosition = new BABYLON.Vector3(0, -0.2, -0.06)

    this.cooldown = 0
    this.swapCooldown = 0
    this.reloadTimer = 0
    this.flashTimer = 0
    this.recoil = 0
    this.visualKick = 0
    this.clipAmmo = this.weaponConfig.clipSize
    this.reserveAmmo = this.weaponConfig.reserveAmmo
    this.flashRoll = 0
    this.reloadCompletionKick = 0
    this.reloadInserted = false

    this.createMeshes()
    this.reset()
  }

  createWeaponConfig(weaponDefinition) {
    return {
      ...WEAPON_CONFIG,
      ...weaponDefinition.stats,
      visualKickStrength: weaponDefinition.stats.recoil,
    }
  }

  createMeshes() {
    this.bodyMaterial = new BABYLON.StandardMaterial("rifleBodyMaterial", this.scene)
    this.bodyMaterial.specularColor = BABYLON.Color3.Black()

    this.trimMaterial = new BABYLON.StandardMaterial("rifleTrimMaterial", this.scene)
    this.trimMaterial.specularColor = BABYLON.Color3.Black()

    this.gripMaterial = new BABYLON.StandardMaterial("rifleGripMaterial", this.scene)
    this.gripMaterial.specularColor = BABYLON.Color3.Black()

    this.meshes = [
      BABYLON.MeshBuilder.CreateBox("rifleBody", { width: 0.18, height: 0.18, depth: 0.72 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleBarrel", { width: 0.08, height: 0.08, depth: 0.52 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleStock", { width: 0.14, height: 0.18, depth: 0.22 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleMagazine", { width: 0.08, height: 0.22, depth: 0.12 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleSight", { width: 0.07, height: 0.05, depth: 0.12 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleForegrip", { width: 0.07, height: 0.16, depth: 0.08 }, this.scene),
      BABYLON.MeshBuilder.CreateBox("rifleReceiver", { width: 0.14, height: 0.1, depth: 0.2 }, this.scene),
    ]

    this.meshes[0].position.z = 0
    this.meshes[0].material = this.bodyMaterial

    this.meshes[1].position.z = 0.52
    this.meshes[1].position.y = 0.01
    this.meshes[1].material = this.trimMaterial

    this.meshes[2].position.z = -0.46
    this.meshes[2].position.y = -0.01
    this.meshes[2].material = this.gripMaterial

    this.meshes[3].position.copyFrom(this.baseMagazinePosition)
    this.meshes[3].material = this.gripMaterial

    this.meshes[4].position.set(0, 0.12, 0.06)
    this.meshes[4].material = this.trimMaterial

    this.meshes[5].position.set(0, -0.15, 0.2)
    this.meshes[5].material = this.gripMaterial

    this.meshes[6].position.set(0, 0.02, -0.12)
    this.meshes[6].material = this.trimMaterial

    this.meshes.forEach((mesh) => {
      mesh.parent = this.root
      mesh.renderingGroupId = 2
      mesh.isPickable = false
    })

    const muzzleMaterial = new BABYLON.StandardMaterial("muzzleMaterial", this.scene)
    muzzleMaterial.diffuseColor = BABYLON.Color3.FromHexString("#ffd28a")
    muzzleMaterial.emissiveColor = BABYLON.Color3.FromHexString("#ffc25e")
    muzzleMaterial.alpha = 0

    this.muzzleFlashMaterial = muzzleMaterial
    this.muzzleFlash = BABYLON.MeshBuilder.CreateBox(
      "muzzleFlash",
      {
        width: 0.08 * this.weaponConfig.muzzleFlashSize,
        height: 0.08 * this.weaponConfig.muzzleFlashSize,
        depth: 0.16 * this.weaponConfig.muzzleFlashSize,
      },
      this.scene
    )
    this.muzzleFlash.parent = this.root
    this.muzzleFlash.position.set(0, 0, 0.86)
    this.muzzleFlash.material = muzzleMaterial
    this.muzzleFlash.renderingGroupId = 2
    this.muzzleFlash.isPickable = false
  }

  reset() {
    this.weaponStates = Object.create(null)
    this.weaponIds.forEach((weaponId) => {
      const definition = getWeaponDefinition(weaponId)
      this.weaponStates[weaponId] = {
        clipAmmo: definition.stats.clipSize,
        reserveAmmo: definition.stats.reserveAmmo,
      }
    })

    this.cooldown = 0
    this.swapCooldown = 0
    this.reloadTimer = 0
    this.flashTimer = 0
    this.recoil = 0
    this.visualKick = 0
    this.flashRoll = 0
    this.root.position.copyFrom(this.basePosition)
    this.root.rotation.copyFrom(this.baseRotation)
    this.muzzleFlashMaterial.alpha = 0
    this.reloadCompletionKick = 0
    this.reloadInserted = false
    this.meshes[3].position.copyFrom(this.baseMagazinePosition)
    this.meshes[3].rotation.set(0, 0, 0)
    this.setWeapon(this.weaponId, { resetAmmo: false, preserveCooldown: true })
  }

  update(dt, context) {
    const result = { hit: false, killed: false }

    this.cooldown = Math.max(0, this.cooldown - dt)
    this.swapCooldown = Math.max(0, this.swapCooldown - dt)
    this.flashTimer = Math.max(0, this.flashTimer - dt)
    this.recoil = damp(this.recoil, 0, this.weaponConfig.recoilRecover, dt)
    this.visualKick = damp(this.visualKick, 0, 18, dt)
    this.reloadCompletionKick = damp(this.reloadCompletionKick, 0, this.weaponConfig.completionRecover, dt)

    if (this.reloadTimer > 0) {
      const previousTimer = this.reloadTimer
      this.reloadTimer = Math.max(0, this.reloadTimer - dt)
      const previousProgress = this.getReloadProgress(previousTimer)
      const reloadProgress = this.getReloadProgress(this.reloadTimer)

      if (
        !this.reloadInserted
        && previousProgress < this.weaponConfig.insertWindow
        && reloadProgress >= this.weaponConfig.insertWindow
      ) {
        this.reloadInserted = true
      }

      if (this.reloadTimer <= 0) {
        const needed = this.weaponConfig.clipSize - this.clipAmmo
        const amount = Math.min(needed, this.reserveAmmo)
        this.clipAmmo += amount
        this.reserveAmmo -= amount
        this.persistCurrentWeaponAmmo()
        this.reloadCompletionKick = this.weaponConfig.completionKick
      }
    }

    if (context.active) {
      const weaponSlot = context.input.consumeWeaponSlot()
      if (weaponSlot != null) {
        if (context.networkSession) {
          const weaponId = this.weaponIds[weaponSlot]
          if (weaponId) {
            this.setWeapon(weaponId)
            context.networkSession.requestWeaponSwitch(weaponId)
          }
        } else {
          this.selectWeaponSlot(weaponSlot)
        }
      } else {
        const weaponCycle = context.input.consumeWeaponCycle()
        if (weaponCycle !== 0) {
          if (context.networkSession) {
            const currentIndex = this.weaponIds.indexOf(this.weaponId)
            const nextIndex = (currentIndex + Math.sign(weaponCycle) + this.weaponIds.length) % this.weaponIds.length
            const weaponId = this.weaponIds[nextIndex]
            this.setWeapon(weaponId)
            context.networkSession.requestWeaponSwitch(weaponId)
          } else {
            this.cycleWeapon(weaponCycle)
          }
        }
      }

      if (context.input.consumeReloadPressed()) {
        if (context.networkSession) {
          context.networkSession.requestReload()
        } else {
          this.startReload()
        }
      }

      if (context.input.isFireHeld()) {
        if (context.networkSession) {
          this.tryFireNetwork(context.player, context.networkSession)
        } else {
          const fireResult = this.tryFire(context.player, context.enemies, context.level)
          result.hit = fireResult.hit
          result.killed = fireResult.killed
        }
      }
    }

    this.updateVisuals(dt, context.player)

    return result
  }

  updateVisuals(dt, player) {
    const bob = player.getViewBob()
    const localMove = player.getLocalMovement()
    const moveScale = Math.max(1, player.getMaxMoveSpeed())
    const strafeAmount = clamp(localMove.strafe / moveScale, -1, 1)
    const forwardAmount = clamp(localMove.forward / moveScale, -1, 1)
    const reloadProgress = this.getReloadProgress(this.reloadTimer)
    const reloadBlend = this.getReloadBlend(reloadProgress)
    const reloadMagazineOffset = this.getReloadMagazineOffset(reloadProgress)
    const targetPosX = this.basePosition.x
      + bob.x * this.weaponConfig.viewmodelBobAmount
      + strafeAmount * this.weaponConfig.viewmodelStrafeAmount
      - reloadBlend * this.weaponConfig.weaponSideOffset
    const targetPosY = this.basePosition.y
      + bob.y * 0.32
      + Math.abs(strafeAmount) * 0.008
      - this.visualKick * this.weaponConfig.recoilPositionKick
      - reloadBlend * this.weaponConfig.weaponDrop
      + this.reloadCompletionKick * 0.4
    const targetPosZ = this.basePosition.z
      - this.visualKick * (this.weaponConfig.recoilPositionKick + 0.01)
      + Math.abs(forwardAmount) * 0.008
      - reloadBlend * this.weaponConfig.weaponPullback
      + this.reloadCompletionKick
    const targetRotX = this.baseRotation.x + this.visualKick * this.weaponConfig.recoilRotationKick
      + reloadBlend * this.weaponConfig.weaponTiltPitch
      - this.reloadCompletionKick * 0.22
    const targetRotY = this.baseRotation.y - reloadBlend * 0.08
    const targetRotZ = this.baseRotation.z
      + bob.x * -0.06
      + strafeAmount * -this.weaponConfig.viewmodelStrafeTilt
      + this.visualKick * -0.02
      - reloadBlend * this.weaponConfig.weaponTiltRoll
      + this.reloadCompletionKick * 0.1

    this.root.position.x = damp(this.root.position.x, targetPosX, this.weaponConfig.viewmodelSmoothing, dt)
    this.root.position.y = damp(this.root.position.y, targetPosY, this.weaponConfig.viewmodelSmoothing, dt)
    this.root.position.z = damp(this.root.position.z, targetPosZ, this.weaponConfig.viewmodelSmoothing, dt)
    this.root.rotation.x = damp(this.root.rotation.x, targetRotX, this.weaponConfig.viewmodelSmoothing, dt)
    this.root.rotation.y = damp(this.root.rotation.y, targetRotY, this.weaponConfig.viewmodelSmoothing, dt)
    this.root.rotation.z = damp(this.root.rotation.z, targetRotZ, this.weaponConfig.viewmodelSmoothing, dt)

    this.meshes[3].position.y = damp(
      this.meshes[3].position.y,
      this.baseMagazinePosition.y - reloadMagazineOffset,
      this.weaponConfig.viewmodelSmoothing,
      dt
    )
    this.meshes[3].position.z = damp(
      this.meshes[3].position.z,
      this.baseMagazinePosition.z - reloadMagazineOffset * 0.18,
      this.weaponConfig.viewmodelSmoothing,
      dt
    )
    this.meshes[3].rotation.x = damp(
      this.meshes[3].rotation.x,
      reloadMagazineOffset * 1.5,
      this.weaponConfig.viewmodelSmoothing,
      dt
    )

    const flashAlpha = clamp(this.flashTimer / this.weaponConfig.muzzleFlashTime, 0, 1)
    this.muzzleFlashMaterial.alpha = flashAlpha
    this.muzzleFlash.scaling.x = 1 + flashAlpha * 1.3
    this.muzzleFlash.scaling.y = 1 + flashAlpha * 0.9
    this.muzzleFlash.scaling.z = 1 + flashAlpha * 1.7
    this.muzzleFlash.rotation.z = flashAlpha > 0 ? this.flashRoll : 0
  }

  tryFire(player, enemies, level) {
    if (this.reloadTimer > 0 || this.cooldown > 0 || this.swapCooldown > 0) {
      return { hit: false, killed: false }
    }

    if (this.clipAmmo <= 0) {
      this.startReload()
      return { hit: false, killed: false }
    }

    this.clipAmmo -= 1
    this.persistCurrentWeaponAmmo()
    this.cooldown = this.weaponConfig.fireInterval
    this.flashTimer = this.weaponConfig.muzzleFlashTime
    this.flashRoll = Math.random() * Math.PI
    this.recoil = clamp(this.recoil + 1, 0, 5.5)
    this.visualKick = clamp(this.visualKick + this.weaponConfig.visualKickStrength, 0, 4.6)

    player.addViewKick(
      this.weaponConfig.recoilPitch + this.recoil * 0.0012,
      (Math.random() - 0.5) * (this.weaponConfig.recoilYaw + this.recoil * 0.0008)
    )

    const spread = this.weaponConfig.hipSpread
      + player.getMoveAmount() * this.weaponConfig.moveSpread
      + this.recoil * this.weaponConfig.recoilSpread
    const origin = player.getShootOrigin()
    const direction = player.getShootDirection(spread)
    const wallDistance = level.raycastWalls(origin, direction, this.weaponConfig.range)

    let bestTarget = null
    let bestDistance = wallDistance

    enemies.forEachLivingEnemy((enemy) => {
      const hitDistance = enemy.raycast(origin, direction, bestDistance)
      if (hitDistance < bestDistance) {
        bestDistance = hitDistance
        bestTarget = enemy
      }
    })

    if (bestTarget) {
      const killed = bestTarget.applyDamage(this.weaponConfig.damage)
      if (this.clipAmmo === 0 && this.reserveAmmo > 0) {
        this.startReload()
      }
      return { hit: true, killed }
    }

    if (this.clipAmmo === 0 && this.reserveAmmo > 0) {
      this.startReload()
    }

    return { hit: false, killed: false }
  }

  tryFireNetwork(player, networkSession) {
    if (this.reloadTimer > 0 || this.cooldown > 0 || this.swapCooldown > 0) {
      return false
    }

    if (this.clipAmmo <= 0) {
      networkSession.requestReload()
      return false
    }

    this.cooldown = this.weaponConfig.fireInterval
    this.flashTimer = this.weaponConfig.muzzleFlashTime
    this.flashRoll = Math.random() * Math.PI
    this.recoil = clamp(this.recoil + 1, 0, 5.5)
    this.visualKick = clamp(this.visualKick + this.weaponConfig.visualKickStrength, 0, 4.6)

    player.addViewKick(
      this.weaponConfig.recoilPitch + this.recoil * 0.0012,
      (Math.random() - 0.5) * (this.weaponConfig.recoilYaw + this.recoil * 0.0008)
    )

    return networkSession.requestFire()
  }

  startReload() {
    if (this.reloadTimer > 0 || this.swapCooldown > 0) {
      return
    }

    if (this.clipAmmo >= this.weaponConfig.clipSize || this.reserveAmmo <= 0) {
      return
    }

    this.reloadTimer = this.weaponConfig.reloadTime
    this.reloadInserted = false
    this.cooldown = Math.max(
      this.cooldown,
      this.weaponConfig.startWindow * this.weaponConfig.reloadTime * 0.4
    )
  }

  selectWeaponSlot(index) {
    const weaponId = this.weaponIds[index]
    if (weaponId) {
      this.setWeapon(weaponId)
    }
  }

  cycleWeapon(direction) {
    if (this.weaponIds.length <= 1) {
      return
    }

    const currentIndex = this.weaponIds.indexOf(this.weaponId)
    const nextIndex = (currentIndex + Math.sign(direction) + this.weaponIds.length) % this.weaponIds.length
    this.setWeapon(this.weaponIds[nextIndex])
  }

  setLoadout(weaponIds, activeWeaponId) {
    this.weaponIds = [...weaponIds]
    this.weaponId = activeWeaponId || this.weaponIds[0] || LOADOUT_CONFIG.defaultPrimaryWeaponId
  }

  setWeapon(weaponId, options = {}) {
    const { resetAmmo = false, preserveCooldown = false } = options
    const nextWeaponDefinition = getWeaponDefinition(weaponId)
    const nextWeaponConfig = this.createWeaponConfig(nextWeaponDefinition)

    if (this.weaponId && this.weaponStates[this.weaponId]) {
      this.persistCurrentWeaponAmmo()
    }

    this.weaponId = weaponId
    this.weaponDefinition = nextWeaponDefinition
    this.weaponConfig = nextWeaponConfig
    this.bodyMaterial.diffuseColor = BABYLON.Color3.FromHexString(this.weaponDefinition.colors.body)
    this.trimMaterial.diffuseColor = BABYLON.Color3.FromHexString(this.weaponDefinition.colors.trim)
    this.gripMaterial.diffuseColor = BABYLON.Color3.FromHexString(this.weaponDefinition.colors.grip)

    if (!this.weaponStates[this.weaponId] || resetAmmo) {
      this.weaponStates[this.weaponId] = {
        clipAmmo: this.weaponConfig.clipSize,
        reserveAmmo: this.weaponConfig.reserveAmmo,
      }
    }

    this.clipAmmo = this.weaponStates[this.weaponId].clipAmmo
    this.reserveAmmo = this.weaponStates[this.weaponId].reserveAmmo
    this.reloadTimer = 0
    this.reloadInserted = false
    this.reloadCompletionKick = 0
    this.flashTimer = 0

    if (!preserveCooldown) {
      this.swapCooldown = 0.14
      this.cooldown = Math.max(this.cooldown, 0.08)
    }
  }

  persistCurrentWeaponAmmo() {
    if (!this.weaponStates[this.weaponId]) {
      this.weaponStates[this.weaponId] = {
        clipAmmo: this.clipAmmo,
        reserveAmmo: this.reserveAmmo,
      }
      return
    }

    this.weaponStates[this.weaponId].clipAmmo = this.clipAmmo
    this.weaponStates[this.weaponId].reserveAmmo = this.reserveAmmo
  }

  isReloading() {
    return this.reloadTimer > 0
  }

  getReloadStatusText() {
    if (this.swapCooldown > 0) {
      return `Switching to ${this.weaponDefinition.name}.`
    }

    if (!this.isReloading()) {
      return ""
    }

    const progress = this.getReloadProgress(this.reloadTimer)
    if (progress < this.weaponConfig.startWindow) {
      return "Reloading. Dropping mag."
    }

    if (progress < this.weaponConfig.insertWindow) {
      return "Reloading. Seating fresh mag."
    }

    return "Reloading. Snapping back up."
  }

  getAmmoText() {
    return this.isReloading()
      ? `${this.clipAmmo} / ${this.reserveAmmo} | RLD`
      : `${this.clipAmmo} / ${this.reserveAmmo}`
  }

  getCrosshairGap(player) {
    return this.weaponConfig.crosshairBaseGap
      + player.getMoveAmount() * this.weaponConfig.crosshairMoveGap
      + this.recoil * this.weaponConfig.crosshairRecoilGap
      + (this.isReloading() ? this.weaponConfig.crosshairReloadGap : 0)
  }

  getReloadProgress(timer = this.reloadTimer) {
    if (timer <= 0 || this.weaponConfig.reloadTime <= 0) {
      return 0
    }

    return clamp(1 - timer / this.weaponConfig.reloadTime, 0, 1)
  }

  getReloadBlend(progress) {
    if (!this.isReloading()) {
      return 0
    }

    if (progress < this.weaponConfig.startWindow) {
      return progress / Math.max(this.weaponConfig.startWindow, 0.0001)
    }

    if (progress < this.weaponConfig.insertWindow) {
      return 1
    }

    const settleRange = Math.max(1 - this.weaponConfig.insertWindow, 0.0001)
    return 1 - (progress - this.weaponConfig.insertWindow) / settleRange
  }

  getReloadMagazineOffset(progress) {
    if (!this.isReloading()) {
      return 0
    }

    if (progress < this.weaponConfig.startWindow) {
      const t = progress / Math.max(this.weaponConfig.startWindow, 0.0001)
      return t * this.weaponConfig.magazineDrop * 0.45
    }

    if (progress < this.weaponConfig.insertWindow) {
      const t = (progress - this.weaponConfig.startWindow)
        / Math.max(this.weaponConfig.insertWindow - this.weaponConfig.startWindow, 0.0001)
      return this.weaponConfig.magazineDrop * (0.45 + t * 0.55)
    }

    const t = (progress - this.weaponConfig.insertWindow) / Math.max(1 - this.weaponConfig.insertWindow, 0.0001)
    return this.weaponConfig.magazineDrop * (1 - t)
  }

  getWeaponId() {
    return this.weaponId
  }

  syncNetworkState(snapshot) {
    if (!snapshot) {
      return
    }

    if (snapshot.weaponId && snapshot.weaponId !== this.weaponId) {
      this.setWeapon(snapshot.weaponId, { resetAmmo: false, preserveCooldown: true })
    }

    this.clipAmmo = snapshot.clipAmmo
    this.reserveAmmo = snapshot.reserveAmmo
    this.reloadTimer = snapshot.reloadRemaining || 0
    this.persistCurrentWeaponAmmo()
  }

  getSelectedWeapon() {
    return this.weaponDefinition
  }

  getLoadoutSlots() {
    return this.weaponIds.map((weaponId, index) => {
      const definition = getWeaponDefinition(weaponId)
      const ammoState = this.weaponStates[weaponId] || {
        clipAmmo: definition.stats.clipSize,
        reserveAmmo: definition.stats.reserveAmmo,
      }

      return {
        slot: index + 1,
        weaponId,
        name: definition.name,
        ammoText: `${ammoState.clipAmmo} / ${ammoState.reserveAmmo}`,
        active: weaponId === this.weaponId,
      }
    })
  }
}
