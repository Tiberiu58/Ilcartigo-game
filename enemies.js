import { BABYLON } from "./babylon.js"
import { ENEMY_CONFIG } from "./config.js"
import { damp, raySphereIntersection } from "./utils.js"

const BODY_HURT_COLOR = BABYLON.Color3.FromHexString("#b53333")
const HEAD_HURT_COLOR = BABYLON.Color3.FromHexString("#7c4337")
const EYE_IDLE_COLOR = BABYLON.Color3.FromHexString("#ffd76b")
const EYE_ATTACK_COLOR = BABYLON.Color3.FromHexString("#fff1a4")
const NO_EMISSIVE_COLOR = BABYLON.Color3.Black()

class EnemyBot {
  constructor(scene, index, manager) {
    this.scene = scene
    this.index = index
    this.manager = manager
    this.route = []
    this.routeIndex = 0
    this.waitTimer = 0
    this.attackCooldown = 0
    this.memoryTimer = 0
    this.hurtTimer = 0
    this.walkCycle = 0
    this.alive = true
    this.active = true
    this.health = ENEMY_CONFIG.health
    this.position = new BABYLON.Vector3()
    this.lastSeenTarget = new BABYLON.Vector3()
    this.centerPosition = new BABYLON.Vector3()
    this.moveDelta = new BABYLON.Vector3()

    this.buildMesh()
  }

  buildMesh() {
    this.root = new BABYLON.TransformNode(`enemyRoot-${this.index}`, this.scene)

    this.bodyMaterial = new BABYLON.StandardMaterial(`enemyBodyMaterial-${this.index}`, this.scene)
    this.bodyMaterial.diffuseColor = BABYLON.Color3.FromHexString("#ff7b5c")
    this.bodyMaterial.specularColor = BABYLON.Color3.Black()

    this.headMaterial = new BABYLON.StandardMaterial(`enemyHeadMaterial-${this.index}`, this.scene)
    this.headMaterial.diffuseColor = BABYLON.Color3.FromHexString("#ffe2b8")
    this.headMaterial.specularColor = BABYLON.Color3.Black()

    this.eyeMaterial = new BABYLON.StandardMaterial(`enemyEyeMaterial-${this.index}`, this.scene)
    this.eyeMaterial.diffuseColor = BABYLON.Color3.FromHexString("#fff6d8")
    this.eyeMaterial.emissiveColor = BABYLON.Color3.FromHexString("#ffd76b")
    this.eyeMaterial.specularColor = BABYLON.Color3.Black()

    this.plateMaterial = new BABYLON.StandardMaterial(`enemyPlateMaterial-${this.index}`, this.scene)
    this.plateMaterial.diffuseColor = BABYLON.Color3.FromHexString("#8f2f2b")
    this.plateMaterial.emissiveColor = BABYLON.Color3.FromHexString("#5c1d1b")
    this.plateMaterial.specularColor = BABYLON.Color3.Black()

    this.body = BABYLON.MeshBuilder.CreateCylinder(
      `enemyBody-${this.index}`,
      { height: 1.2, diameterTop: 0.56, diameterBottom: 0.76, tessellation: 6 },
      this.scene
    )
    this.body.position.y = 0.72
    this.body.material = this.bodyMaterial

    this.head = BABYLON.MeshBuilder.CreateSphere(
      `enemyHead-${this.index}`,
      { diameter: 0.5, segments: 6 },
      this.scene
    )
    this.head.position.y = 1.47
    this.head.material = this.headMaterial

    this.shoulders = BABYLON.MeshBuilder.CreateBox(
      `enemyShoulders-${this.index}`,
      { width: 0.88, height: 0.18, depth: 0.24 },
      this.scene
    )
    this.shoulders.position.set(0, 1.08, 0)
    this.shoulders.material = this.plateMaterial

    this.eye = BABYLON.MeshBuilder.CreateBox(
      `enemyEye-${this.index}`,
      { width: 0.28, height: 0.08, depth: 0.04 },
      this.scene
    )
    this.eye.position.set(0, 1.47, 0.25)
    this.eye.material = this.eyeMaterial

    this.healthBarBack = BABYLON.MeshBuilder.CreatePlane(
      `enemyHealthBack-${this.index}`,
      { width: 0.72, height: 0.08 },
      this.scene
    )
    this.healthBarBack.position.set(0, 1.95, 0)
    this.healthBarBack.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL
    const healthBackMaterial = new BABYLON.StandardMaterial(`enemyHealthBackMaterial-${this.index}`, this.scene)
    healthBackMaterial.diffuseColor = BABYLON.Color3.FromHexString("#2a1f34")
    healthBackMaterial.emissiveColor = BABYLON.Color3.FromHexString("#1c1322")
    healthBackMaterial.specularColor = BABYLON.Color3.Black()
    this.healthBarBack.material = healthBackMaterial

    this.healthBarFill = BABYLON.MeshBuilder.CreatePlane(
      `enemyHealthFill-${this.index}`,
      { width: 0.68, height: 0.045 },
      this.scene
    )
    this.healthBarFill.position.set(0, 1.95, -0.001)
    this.healthBarFill.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL
    const healthFillMaterial = new BABYLON.StandardMaterial(`enemyHealthFillMaterial-${this.index}`, this.scene)
    healthFillMaterial.diffuseColor = BABYLON.Color3.FromHexString("#75ff9d")
    healthFillMaterial.emissiveColor = BABYLON.Color3.FromHexString("#46ff83")
    healthFillMaterial.specularColor = BABYLON.Color3.Black()
    this.healthBarFill.material = healthFillMaterial

    this.body.parent = this.root
    this.head.parent = this.root
    this.shoulders.parent = this.root
    this.eye.parent = this.root
    this.healthBarBack.parent = this.root
    this.healthBarFill.parent = this.root

    ;[this.body, this.head, this.shoulders, this.eye, this.healthBarBack, this.healthBarFill].forEach((mesh) => {
      mesh.isPickable = false
      // Enemies should render in the same depth pass as the map so walls and
      // landmarks occlude them normally from every angle.
      mesh.renderingGroupId = 0
    })
  }

  reset(spawn, wave) {
    this.route = spawn.patrol.map((point) => point.clone())
    this.routeIndex = 0
    this.waitTimer = 0
    this.attackCooldown = 0
    this.memoryTimer = 0
    this.hurtTimer = 0
    this.walkCycle = 0
    this.alive = true
    this.active = true
    this.health = ENEMY_CONFIG.health + Math.max(0, wave - 1) * ENEMY_CONFIG.healthPerWave
    this.wave = wave
    this.position.copyFrom(spawn.position)
    this.lastSeenTarget.copyFrom(spawn.position)
    this.root.position.copyFrom(this.position)
    this.root.rotation.set(0, 0, 0)
    this.root.setEnabled(true)
    this.root.scaling.setAll(ENEMY_CONFIG.readableScale)
    this.bodyMaterial.emissiveColor = NO_EMISSIVE_COLOR
    this.headMaterial.emissiveColor = NO_EMISSIVE_COLOR
    this.eyeMaterial.emissiveColor = EYE_IDLE_COLOR
    this.healthBarBack.setEnabled(true)
    this.healthBarFill.setEnabled(true)
    this.healthBarFill.scaling.x = 1
  }

  deactivate(spawn) {
    this.route = spawn.patrol.map((point) => point.clone())
    this.routeIndex = 0
    this.waitTimer = 0
    this.attackCooldown = 0
    this.memoryTimer = 0
    this.hurtTimer = 0
    this.walkCycle = 0
    this.alive = false
    this.active = false
    this.health = ENEMY_CONFIG.health
    this.position.copyFrom(spawn.position)
    this.root.position.copyFrom(this.position)
    this.root.setEnabled(false)
  }

  update(dt, player, playerCenter, level) {
    if (!this.active || !this.alive) {
      return 0
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt)
    this.hurtTimer = Math.max(0, this.hurtTimer - dt)

    const selfCenter = this.getCenterPosition()
    const toPlayerX = playerCenter.x - selfCenter.x
    const toPlayerZ = playerCenter.z - selfCenter.z
    const distanceToPlayer = Math.hypot(toPlayerX, toPlayerZ)
    const canSeePlayer = distanceToPlayer <= ENEMY_CONFIG.detectDistance
      && level.hasLineOfSight(selfCenter, playerCenter)

    if (canSeePlayer) {
      this.lastSeenTarget.copyFrom(playerCenter)
      this.memoryTimer = ENEMY_CONFIG.memoryTime
    } else {
      this.memoryTimer = Math.max(0, this.memoryTimer - dt)
    }

    let target = null
    let moveSpeed = 0

    // Bots patrol until they spot the player, then chase the last seen position
    // for a few seconds so they feel reactive without running expensive pathing.
    if (canSeePlayer || this.memoryTimer > 0) {
      target = canSeePlayer ? playerCenter : this.lastSeenTarget
      moveSpeed = ENEMY_CONFIG.chaseSpeed + (this.wave - 1) * ENEMY_CONFIG.speedPerWave
    } else {
      target = this.route[this.routeIndex]
      moveSpeed = ENEMY_CONFIG.patrolSpeed

      if (this.waitTimer > 0) {
        this.waitTimer -= dt
        moveSpeed = 0
      } else {
        const patrolDistance = Math.hypot(target.x - this.position.x, target.z - this.position.z)
        if (patrolDistance < 0.35) {
          this.routeIndex = (this.routeIndex + 1) % this.route.length
          this.waitTimer = 0.4
        }
      }
    }

    let damage = 0
    const targetDx = target.x - this.position.x
    const targetDz = target.z - this.position.z
    const targetLength = Math.hypot(targetDx, targetDz) || 1
    const moveDirX = targetDx / targetLength
    const moveDirZ = targetDz / targetLength

    if (canSeePlayer && distanceToPlayer <= ENEMY_CONFIG.attackDistance) {
      moveSpeed = 0
      if (this.attackCooldown <= 0) {
        damage = ENEMY_CONFIG.attackDamage + Math.max(0, this.wave - 1) * ENEMY_CONFIG.attackDamagePerWave
        player.applyDamage(damage)
        this.attackCooldown = Math.max(
          ENEMY_CONFIG.attackCooldownFloor,
          ENEMY_CONFIG.attackCooldown - (this.wave - 1) * 0.04
        )
        this.eyeMaterial.emissiveColor = EYE_ATTACK_COLOR
      }
    } else {
      this.eyeMaterial.emissiveColor = EYE_IDLE_COLOR
    }

    this.moveDelta.set(moveDirX * moveSpeed * dt, 0, moveDirZ * moveSpeed * dt)
    const next = level.moveCircle(this.position, this.moveDelta, ENEMY_CONFIG.radius)
    const movedX = next.x - this.position.x
    const movedZ = next.z - this.position.z

    this.position.x = next.x
    this.position.z = next.z
    this.root.position.copyFrom(this.position)

    const movedDistance = Math.hypot(movedX, movedZ)
    if (movedDistance > 0.001) {
      this.root.rotation.y = Math.atan2(movedX, movedZ)
      this.walkCycle += dt * 10 * (moveSpeed / ENEMY_CONFIG.chaseSpeed + 0.2)
    }

    this.body.position.y = damp(this.body.position.y, 0.72 + Math.sin(this.walkCycle) * 0.05, 10, dt)
    this.head.position.y = damp(this.head.position.y, 1.47 + Math.sin(this.walkCycle + 0.5) * 0.04, 10, dt)
    this.eye.position.y = this.head.position.y
    const baseScale = ENEMY_CONFIG.readableScale
    const hurtScale = this.hurtTimer > 0 ? baseScale * 1.045 : baseScale
    this.root.scaling.x = damp(this.root.scaling.x, hurtScale, 18, dt)
    this.root.scaling.y = damp(this.root.scaling.y, this.hurtTimer > 0 ? baseScale * 0.96 : baseScale, 18, dt)
    this.root.scaling.z = damp(this.root.scaling.z, hurtScale, 18, dt)
    this.bodyMaterial.emissiveColor = this.hurtTimer > 0
      ? BODY_HURT_COLOR
      : NO_EMISSIVE_COLOR
    this.headMaterial.emissiveColor = this.hurtTimer > 0
      ? HEAD_HURT_COLOR
      : NO_EMISSIVE_COLOR
    this.healthBarFill.scaling.x = damp(
      this.healthBarFill.scaling.x,
      Math.max(0, this.health / ENEMY_CONFIG.health),
      18,
      dt
    )
    this.healthBarFill.position.x = -0.34 * (1 - this.healthBarFill.scaling.x)

    return damage
  }

  getCenterPosition() {
    this.centerPosition.set(this.position.x, 1.1, this.position.z)
    return this.centerPosition
  }

  raycast(origin, direction, maxDistance) {
    if (!this.alive) {
      return Infinity
    }

    return raySphereIntersection(
      origin,
      direction,
      this.getCenterPosition(),
      0.62,
      maxDistance
    )
  }

  applyDamage(amount) {
    if (!this.active || !this.alive) {
      return false
    }

    this.health -= amount
    this.hurtTimer = ENEMY_CONFIG.hurtFlashTime
    if (this.health <= 0) {
      this.alive = false
      this.manager.notifyEnemyKilled()
      this.healthBarBack.setEnabled(false)
      this.healthBarFill.setEnabled(false)
      this.root.setEnabled(false)
      return true
    }

    return false
  }
}

export class EnemyManager {
  constructor(scene, level) {
    this.level = level
    this.spawns = level.getEnemySpawns()
    this.enemies = this.spawns.map((_, index) => new EnemyBot(scene, index, this))
    this.wave = 1
    this.waveTimer = 0
    this.aliveCount = 0
    this.enabled = true
    this.reset()
  }

  reset() {
    if (!this.enabled) {
      this.aliveCount = 0
      this.enemies.forEach((enemy, index) => {
        enemy.deactivate(this.spawns[index])
      })
      return
    }
    this.wave = 1
    this.waveTimer = 0
    this.spawnWave(this.wave)
  }

  update(dt, player, level) {
    if (!this.enabled) {
      return 0
    }

    let damageDealt = 0
    const playerCenter = player.getCenterPosition()

    for (let i = 0; i < this.enemies.length; i += 1) {
      damageDealt += this.enemies[i].update(dt, player, playerCenter, level)
    }

    if (this.aliveCount === 0) {
      this.waveTimer += dt
      if (this.waveTimer >= ENEMY_CONFIG.waveDelay) {
        this.wave += 1
        this.spawnWave(this.wave)
      }
    } else {
      this.waveTimer = 0
    }

    return damageDealt
  }

  getAliveCount() {
    return this.aliveCount
  }

  forEachLivingEnemy(callback) {
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i]
      if (enemy.active && enemy.alive) {
        callback(enemy)
      }
    }
  }

  getWave() {
    return this.wave
  }

  isWaitingForNextWave() {
    return this.aliveCount === 0 && this.waveTimer > 0
  }

  getWaveCountdown() {
    return Math.max(0, ENEMY_CONFIG.waveDelay - this.waveTimer)
  }

  spawnWave(wave) {
    this.waveTimer = 0
    const activeCount = Math.min(ENEMY_CONFIG.maxWaveSize, 2 + Math.floor((wave - 1) / 1.5))
    this.aliveCount = activeCount

    this.enemies.forEach((enemy, index) => {
      const spawn = this.spawns[index]
      if (index < activeCount) {
        enemy.reset(spawn, wave)
      } else {
        enemy.deactivate(spawn)
      }
    })
  }

  notifyEnemyKilled() {
    this.aliveCount = Math.max(0, this.aliveCount - 1)
  }

  setEnabled(enabled) {
    this.enabled = enabled
    this.reset()
  }
}
