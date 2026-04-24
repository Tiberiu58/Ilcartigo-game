import { BABYLON } from "./babylon.js"
import { PLAYER_CONFIG, WORLD_CONFIG } from "./config.js?v=snow-courtyard-v5"
import { clamp } from "./utils.js"

function createPatternTexture(scene, name, draw) {
  const texture = new BABYLON.DynamicTexture(name, { width: 64, height: 64 }, scene, false)
  const context = texture.getContext()

  draw(context)
  texture.update()
  texture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE
  texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 2

  return texture
}

export class Level {
  constructor(scene) {
    this.scene = scene
    this.map = WORLD_CONFIG.map
    this.cellSize = WORLD_CONFIG.cellSize
    this.wallHeight = WORLD_CONFIG.wallHeight
    this.floorY = WORLD_CONFIG.floorY
    this.width = this.map[0].length
    this.depth = this.map.length
    this.staticMeshes = []
    this.teleportBlockers = []
    this.walkSurfaces = []
    this.structureColliders = []
    this.maxStepHeight = 1.1
    this.maxWalkableSlopeCos = Math.cos(BABYLON.Tools.ToRadians(PLAYER_CONFIG.maxWalkableSlopeAngle))
    this.groundInfo = {
      height: this.floorY,
      normal: new BABYLON.Vector3(0, 1, 0),
      walkable: true,
      slopeAngle: 0,
      surfaceType: "floor",
    }

    this.blockTypes = {
      towerCore: new Set(["10,7"]),
      tallBlock: new Set(["2,6", "16,6", "2,8", "16,8"]),
      crate: new Set(["4,2", "14,2", "7,4", "11,4", "7,10", "11,10", "4,12", "14,12"]),
    }

    this.buildMaterials()
    this.buildGeometry()
  }

  buildMaterials() {
    const wallTexture = createPatternTexture(this.scene, "snowWallTexture", (context) => {
      context.fillStyle = "#9d9487"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#b8afa2"
      context.fillRect(0, 0, 64, 8)
      context.fillStyle = "#7f776c"
      for (let y = 12; y < 64; y += 18) {
        context.fillRect(0, y, 64, 2)
      }
      for (let x = 10; x < 64; x += 18) {
        context.fillRect(x, 0, 2, 64)
      }
      context.fillStyle = "rgba(224,220,210,0.16)"
      context.fillRect(4, 4, 56, 3)
      context.fillRect(8, 18, 18, 2)
      context.fillRect(34, 36, 20, 2)
    })

    const snowTexture = createPatternTexture(this.scene, "snowGroundTexture", (context) => {
      context.fillStyle = "#9ba8b1"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#87959f"
      for (let i = 0; i < 18; i += 1) {
        context.fillRect((i * 11) % 64, (i * 7) % 64, 6, 2)
      }
      context.fillStyle = "rgba(111,128,141,0.28)"
      context.fillRect(0, 22, 64, 2)
      context.fillRect(0, 44, 64, 2)
      context.fillStyle = "rgba(198,208,214,0.18)"
      context.fillRect(0, 6, 64, 1)
      context.fillRect(0, 54, 64, 1)
    })

    const stoneTopTexture = createPatternTexture(this.scene, "snowStoneTopTexture", (context) => {
      context.fillStyle = "#8f867a"
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = "#b1a89b"
      context.fillRect(0, 0, 64, 16)
      context.fillStyle = "#71695e"
      for (let y = 22; y < 64; y += 18) {
        context.fillRect(0, y, 64, 2)
      }
      context.fillStyle = "rgba(214,208,196,0.14)"
      context.fillRect(8, 6, 48, 2)
    })

    this.wallMaterial = new BABYLON.StandardMaterial("courtyardWallMaterial", this.scene)
    this.wallMaterial.diffuseTexture = wallTexture
    this.wallMaterial.diffuseTexture.uScale = 0.9
    this.wallMaterial.diffuseTexture.vScale = 0.65
    this.wallMaterial.specularColor = BABYLON.Color3.Black()
    this.wallMaterial.ambientColor = BABYLON.Color3.FromHexString("#a79f94")
    this.wallMaterial.emissiveColor = BABYLON.Color3.FromHexString("#343c47")
    this.wallMaterial.freeze()

    this.groundMaterial = new BABYLON.StandardMaterial("courtyardGroundMaterial", this.scene)
    this.groundMaterial.diffuseTexture = snowTexture
    this.groundMaterial.diffuseTexture.uScale = this.width * 0.32
    this.groundMaterial.diffuseTexture.vScale = this.depth * 0.32
    this.groundMaterial.specularColor = BABYLON.Color3.Black()
    this.groundMaterial.ambientColor = BABYLON.Color3.FromHexString("#96a6b1")
    this.groundMaterial.emissiveColor = BABYLON.Color3.FromHexString("#738390")
    this.groundMaterial.freeze()

    this.coverMaterial = new BABYLON.StandardMaterial("courtyardCoverMaterial", this.scene)
    this.coverMaterial.diffuseTexture = stoneTopTexture
    this.coverMaterial.diffuseTexture.uScale = 0.8
    this.coverMaterial.diffuseTexture.vScale = 0.8
    this.coverMaterial.specularColor = BABYLON.Color3.Black()
    this.coverMaterial.ambientColor = BABYLON.Color3.FromHexString("#9b9388")
    this.coverMaterial.emissiveColor = BABYLON.Color3.FromHexString("#474d50")
    this.coverMaterial.freeze()

    this.woodMaterial = new BABYLON.StandardMaterial("courtyardWoodMaterial", this.scene)
    this.woodMaterial.diffuseColor = BABYLON.Color3.FromHexString("#6b4f3a")
    this.woodMaterial.emissiveColor = BABYLON.Color3.FromHexString("#2d221a")
    this.woodMaterial.specularColor = BABYLON.Color3.Black()
    this.woodMaterial.freeze()

    this.treeMaterial = new BABYLON.StandardMaterial("courtyardTreeMaterial", this.scene)
    this.treeMaterial.diffuseColor = BABYLON.Color3.FromHexString("#4b433c")
    this.treeMaterial.emissiveColor = BABYLON.Color3.FromHexString("#221f1c")
    this.treeMaterial.specularColor = BABYLON.Color3.Black()
    this.treeMaterial.freeze()

    this.mountainMaterial = new BABYLON.StandardMaterial("courtyardMountainMaterial", this.scene)
    this.mountainMaterial.diffuseColor = BABYLON.Color3.FromHexString("#66737f")
    this.mountainMaterial.emissiveColor = BABYLON.Color3.FromHexString("#48515a")
    this.mountainMaterial.specularColor = BABYLON.Color3.Black()
    this.mountainMaterial.freeze()
  }

  buildGeometry() {
    const worldWidth = this.width * this.cellSize
    const worldDepth = this.depth * this.cellSize

    const floor = BABYLON.MeshBuilder.CreateGround(
      "courtyardFloor",
      { width: worldWidth, height: worldDepth, subdivisions: 1 },
      this.scene
    )
    floor.position.set(worldWidth * 0.5, this.floorY, worldDepth * 0.5)
    floor.material = this.groundMaterial
    floor.receiveShadows = false
    floor.freezeWorldMatrix()
    this.staticMeshes.push(floor)

    this.buildPerimeterAndCover()
    this.buildCentralPlatform()
    this.buildGate(worldWidth)
    this.buildTrees()
    this.buildMountains(worldWidth, worldDepth)
  }

  buildPerimeterAndCover() {
    const perimeterMeshes = []
    const coverMeshes = []

    for (let z = 0; z < this.depth; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!this.isWallCell(x, z)) {
          continue
        }

        const positionX = (x + 0.5) * this.cellSize
        const positionZ = (z + 0.5) * this.cellSize

        if (this.isPerimeterCell(x, z)) {
          const wall = BABYLON.MeshBuilder.CreateBox(
            `fortress-wall-${x}-${z}`,
            {
              width: this.cellSize,
              height: this.wallHeight,
              depth: this.cellSize,
            },
            this.scene
          )
          wall.position.set(positionX, this.wallHeight * 0.5, positionZ)
          wall.material = this.wallMaterial
          wall.isPickable = false
          perimeterMeshes.push(wall)
          continue
        }

        const type = this.getInteriorBlockType(x, z)
        const definition = this.getInteriorBlockDefinition(type)
        const mesh = BABYLON.MeshBuilder.CreateBox(
          `${type}-${x}-${z}`,
          {
            width: definition.width,
            height: definition.height,
            depth: definition.depth,
          },
          this.scene
        )
        mesh.position.set(positionX, definition.height * 0.5, positionZ)
        mesh.material = this.coverMaterial
        mesh.isPickable = false
        coverMeshes.push(mesh)
      }
    }

    const mergedWalls = BABYLON.Mesh.MergeMeshes(perimeterMeshes, true, true, undefined, false, true)
    if (mergedWalls) {
      mergedWalls.name = "fortressWalls"
      mergedWalls.freezeWorldMatrix()
      this.staticMeshes.push(mergedWalls)
    }

    const mergedCover = BABYLON.Mesh.MergeMeshes(coverMeshes, true, true, undefined, false, true)
    if (mergedCover) {
      mergedCover.name = "courtyardCover"
      mergedCover.freezeWorldMatrix()
      this.staticMeshes.push(mergedCover)
    }
  }

  buildCentralPlatform() {
    const rampStartX = this.cellSize * 1.3
    const rampEndX = this.cellSize * 8.0
    const rampCenterZ = this.cellSize * 7.5
    const rampWidth = this.cellSize * 3.2
    const platformHeight = 1.8
    const rampLength = rampEndX - rampStartX
    const rampThickness = 0.9
    const rampAngle = Math.atan(platformHeight / rampLength)
    const rampTopStartY = this.floorY + 0.06
    const rampCenterY = rampTopStartY
      + Math.sin(rampAngle) * rampLength * 0.5
      - Math.cos(rampAngle) * rampThickness * 0.5

    const platformMinX = rampEndX
    const platformMaxX = this.cellSize * 12.2
    const platformMinZ = this.cellSize * 5.5
    const platformMaxZ = this.cellSize * 9.5
    const platformCenterX = (platformMinX + platformMaxX) * 0.5
    const platformCenterZ = (platformMinZ + platformMaxZ) * 0.5

    const ramp = BABYLON.MeshBuilder.CreateBox(
      "courtyardRamp",
      {
        width: rampLength,
        height: rampThickness,
        depth: rampWidth,
      },
      this.scene
    )
    ramp.position.set(
      rampStartX + rampLength * 0.5,
      rampCenterY,
      rampCenterZ
    )
    ramp.rotation.z = rampAngle
    ramp.material = this.coverMaterial
    ramp.isPickable = false

    const rampSideLeft = BABYLON.MeshBuilder.CreateBox(
      "courtyardRampSideLeft",
      { width: rampLength, height: 0.6, depth: 0.35 },
      this.scene
    )
    rampSideLeft.position.set(ramp.position.x, ramp.position.y - 0.12, rampCenterZ - rampWidth * 0.5)
    rampSideLeft.rotation.z = rampAngle
    rampSideLeft.material = this.wallMaterial
    rampSideLeft.isPickable = false

    const rampSideRight = rampSideLeft.clone("courtyardRampSideRight")
    rampSideRight.position.z = rampCenterZ + rampWidth * 0.5

    const platform = BABYLON.MeshBuilder.CreateBox(
      "courtyardPlatform",
      {
        width: platformMaxX - platformMinX,
        height: platformHeight,
        depth: platformMaxZ - platformMinZ,
      },
      this.scene
    )
    platform.position.set(
      platformCenterX,
      this.floorY + platformHeight * 0.5,
      platformCenterZ
    )
    platform.material = this.coverMaterial
    platform.isPickable = false

    const tower = BABYLON.MeshBuilder.CreateBox(
      "courtyardTower",
      { width: this.cellSize * 1.2, height: 3.1, depth: this.cellSize * 1.2 },
      this.scene
    )
    tower.position.set(this.cellSize * 10.5, this.floorY + platformHeight + 1.55, this.cellSize * 7.5)
    tower.material = this.wallMaterial
    tower.isPickable = false

    const towerCap = BABYLON.MeshBuilder.CreateBox(
      "courtyardTowerCap",
      { width: this.cellSize * 1.45, height: 0.32, depth: this.cellSize * 1.45 },
      this.scene
    )
    towerCap.position.set(tower.position.x, tower.position.y + 1.7, tower.position.z)
    towerCap.material = this.coverMaterial
    towerCap.isPickable = false

    const mergedStructure = BABYLON.Mesh.MergeMeshes(
      [ramp, rampSideLeft, rampSideRight, platform, tower, towerCap],
      true,
      true,
      undefined,
      false,
      true
    )

    if (mergedStructure) {
      mergedStructure.name = "courtyardCenterStructure"
      mergedStructure.freezeWorldMatrix()
      this.staticMeshes.push(mergedStructure)
    }

    this.structureColliders.push({
      type: "ramp",
      minX: rampStartX,
      maxX: rampEndX,
      minZ: rampCenterZ - rampWidth * 0.5 + 0.15,
      maxZ: rampCenterZ + rampWidth * 0.5 - 0.15,
      startY: this.floorY,
      endY: platformHeight,
    })

    this.structureColliders.push({
      type: "box",
      minX: platformMinX,
      maxX: platformMaxX,
      minZ: platformMinZ,
      maxZ: platformMaxZ,
      topY: platformHeight,
    })

    this.structureColliders.push({
      type: "box",
      minX: tower.position.x - this.cellSize * 0.6,
      maxX: tower.position.x + this.cellSize * 0.6,
      minZ: tower.position.z - this.cellSize * 0.6,
      maxZ: tower.position.z + this.cellSize * 0.6,
      topY: this.floorY + platformHeight + 3.1,
    })

    this.walkSurfaces.push({
      type: "ramp",
      minX: rampStartX,
      maxX: rampEndX,
      minZ: rampCenterZ - rampWidth * 0.5 + 0.4,
      maxZ: rampCenterZ + rampWidth * 0.5 - 0.4,
      startY: this.floorY,
      endY: platformHeight,
    })

    this.walkSurfaces.push({
      type: "box",
      minX: platformMinX,
      maxX: platformMaxX,
      minZ: platformMinZ,
      maxZ: platformMaxZ,
      y: platformHeight,
    })
  }

  buildGate(worldWidth) {
    const gateCenterX = worldWidth * 0.5
    const gateZ = this.cellSize * 0.5

    const gatePosts = []
    ;[-1.45, 1.45].forEach((offset) => {
      const post = BABYLON.MeshBuilder.CreateBox(
        `gatePost${offset > 0 ? "Right" : "Left"}`,
        { width: 0.85, height: 3.4, depth: 1.1 },
        this.scene
      )
      post.position.set(gateCenterX + offset * this.cellSize, 1.7, gateZ + 1.1)
      post.material = this.wallMaterial
      post.isPickable = false
      gatePosts.push(post)
    })

    const arch = BABYLON.MeshBuilder.CreateBox(
      "gateArch",
      { width: this.cellSize * 3.7, height: 0.55, depth: 1.1 },
      this.scene
    )
    arch.position.set(gateCenterX, 3.25, gateZ + 1.1)
    arch.material = this.wallMaterial
    arch.isPickable = false
    gatePosts.push(arch)

    const door = BABYLON.MeshBuilder.CreateBox(
      "gateDoor",
      { width: this.cellSize * 2.7, height: 2.8, depth: 0.34 },
      this.scene
    )
    door.position.set(gateCenterX, 1.4, gateZ + 1.42)
    door.material = this.woodMaterial
    door.isPickable = false
    gatePosts.push(door)

    const mergedGate = BABYLON.Mesh.MergeMeshes(gatePosts, true, true, undefined, false, true)
    if (mergedGate) {
      mergedGate.name = "courtyardGate"
      mergedGate.freezeWorldMatrix()
      this.staticMeshes.push(mergedGate)
    }
  }

  buildTrees() {
    const treePositions = [
      { x: this.cellSize * 4.2, z: this.cellSize * 10.6, scale: 1 },
      { x: this.cellSize * 15.1, z: this.cellSize * 4.1, scale: 1.15 },
    ]

    const trees = []
    treePositions.forEach((tree, index) => {
      const trunk = BABYLON.MeshBuilder.CreateCylinder(
        `treeTrunk-${index}`,
        { diameterTop: 0.18, diameterBottom: 0.34, height: 3.2 * tree.scale, tessellation: 7 },
        this.scene
      )
      trunk.position.set(tree.x, 1.6 * tree.scale, tree.z)
      trunk.material = this.treeMaterial
      trunk.isPickable = false
      trees.push(trunk)

      ;[
        { x: 0.3, y: 2.7, z: 0.1, rotZ: -0.6 },
        { x: -0.25, y: 2.4, z: -0.1, rotZ: 0.55 },
        { x: 0.15, y: 2.9, z: -0.18, rotX: 0.45 },
        { x: -0.18, y: 3.05, z: 0.2, rotX: -0.5 },
      ].forEach((branch, branchIndex) => {
        const limb = BABYLON.MeshBuilder.CreateCylinder(
          `treeBranch-${index}-${branchIndex}`,
          { diameterTop: 0.04, diameterBottom: 0.1, height: 1.6 * tree.scale, tessellation: 6 },
          this.scene
        )
        limb.position.set(tree.x + branch.x, branch.y * tree.scale, tree.z + branch.z)
        limb.rotation.z = branch.rotZ || 0
        limb.rotation.x = branch.rotX || 0
        limb.material = this.treeMaterial
        limb.isPickable = false
        trees.push(limb)
      })
    })

    const mergedTrees = BABYLON.Mesh.MergeMeshes(trees, true, true, undefined, false, true)
    if (mergedTrees) {
      mergedTrees.name = "courtyardTrees"
      mergedTrees.freezeWorldMatrix()
      this.staticMeshes.push(mergedTrees)
    }
  }

  buildMountains(worldWidth, worldDepth) {
    const ridgeGroups = []
    const farZ = -this.cellSize * 3.8

    for (let i = 0; i < 5; i += 1) {
      const ridge = BABYLON.MeshBuilder.CreateBox(
        `mountain-${i}`,
        {
          width: this.cellSize * (3.2 + i * 0.8),
          height: 8 + i * 2,
          depth: this.cellSize * 0.8,
        },
        this.scene
      )
      ridge.position.set(
        worldWidth * (0.08 + i * 0.22),
        ridge.scaling.y + 2.5,
        farZ - i * 2
      )
      ridge.rotation.z = 0.16 - i * 0.05
      ridge.material = this.mountainMaterial
      ridge.isPickable = false
      ridgeGroups.push(ridge)
    }

    const sideRidgeLeft = BABYLON.MeshBuilder.CreateBox(
      "mountainSideLeft",
      { width: this.cellSize * 3.4, height: 10, depth: this.cellSize * 1.2 },
      this.scene
    )
    sideRidgeLeft.position.set(-this.cellSize * 1.5, 6.2, worldDepth * 0.35)
    sideRidgeLeft.rotation.z = -0.35
    sideRidgeLeft.material = this.mountainMaterial
    sideRidgeLeft.isPickable = false
    ridgeGroups.push(sideRidgeLeft)

    const sideRidgeRight = sideRidgeLeft.clone("mountainSideRight")
    sideRidgeRight.position.set(worldWidth + this.cellSize * 1.5, 6.6, worldDepth * 0.28)
    sideRidgeRight.rotation.z = 0.35
    ridgeGroups.push(sideRidgeRight)

    const mergedMountains = BABYLON.Mesh.MergeMeshes(ridgeGroups, true, true, undefined, false, true)
    if (mergedMountains) {
      mergedMountains.name = "courtyardMountains"
      mergedMountains.freezeWorldMatrix()
      this.staticMeshes.push(mergedMountains)
    }
  }

  getInteriorBlockType(x, z) {
    const key = `${x},${z}`
    if (this.blockTypes.towerCore.has(key)) {
      return "towerCore"
    }
    if (this.blockTypes.tallBlock.has(key)) {
      return "tallBlock"
    }
    return "crate"
  }

  getInteriorBlockDefinition(type) {
    switch (type) {
      case "towerCore":
        return { width: this.cellSize * 0.95, depth: this.cellSize * 0.95, height: 4.2 }
      case "tallBlock":
        return { width: this.cellSize * 0.8, depth: this.cellSize * 0.8, height: 2.8 }
      default:
        return { width: this.cellSize * 0.95, depth: this.cellSize * 0.95, height: 1.55 }
    }
  }

  isPerimeterCell(x, z) {
    return x === 0 || z === 0 || x === this.width - 1 || z === this.depth - 1
  }

  dispose() {
    this.staticMeshes.forEach((mesh) => mesh.dispose())
  }

  isWallCell(cellX, cellZ) {
    const row = this.map[cellZ]
    if (!row || row[cellX] == null) {
      return true
    }

    return row[cellX] === "#"
  }

  cellToWorld(cell) {
    return new BABYLON.Vector3(
      cell.x * this.cellSize,
      this.floorY,
      cell.z * this.cellSize
    )
  }

  getPlayerSpawn() {
    return this.cellToWorld(WORLD_CONFIG.playerSpawn)
  }

  getEnemySpawns() {
    return WORLD_CONFIG.enemyRoutes.map((route) => ({
      position: this.cellToWorld(route[0]),
      patrol: route.map((point) => this.cellToWorld(point)),
    }))
  }

  getGroundHeightAt(x, z, currentY = this.floorY) {
    return this.getGroundInfoAt(x, z, currentY).height
  }

  getStructureSurfaceHeight(collider, x) {
    if (collider.type === "ramp") {
      const progress = (x - collider.minX) / Math.max(collider.maxX - collider.minX, 0.001)
      return collider.startY + progress * (collider.endY - collider.startY)
    }

    return collider.topY
  }

  getSurfaceInfo(surface, x) {
    if (surface.type === "ramp") {
      const run = Math.max(surface.maxX - surface.minX, 0.001)
      const rise = surface.endY - surface.startY
      const progress = (x - surface.minX) / run
      const height = surface.startY + progress * rise
      const normal = new BABYLON.Vector3(-rise / run, 1, 0).normalize()
      const walkable = normal.y >= this.maxWalkableSlopeCos
      const slopeAngle = BABYLON.Tools.ToDegrees(Math.acos(clamp(normal.y, -1, 1)))
      return { height, normal, walkable, slopeAngle, surfaceType: "ramp" }
    }

    return {
      height: surface.y,
      normal: new BABYLON.Vector3(0, 1, 0),
      walkable: true,
      slopeAngle: 0,
      surfaceType: "box",
    }
  }

  getGroundInfoAt(x, z, currentY = this.floorY) {
    let highest = this.floorY
    let bestHeight = this.floorY
    let bestNormal = this.groundInfo.normal.set(0, 1, 0)
    let bestWalkable = true
    let bestSlopeAngle = 0
    let bestSurfaceType = "floor"

    for (let i = 0; i < this.walkSurfaces.length; i += 1) {
      const surface = this.walkSurfaces[i]
      if (x < surface.minX || x > surface.maxX || z < surface.minZ || z > surface.maxZ) {
        continue
      }

      const surfaceInfo = this.getSurfaceInfo(surface, x)
      if (surfaceInfo.height <= currentY + this.maxStepHeight && surfaceInfo.height >= highest - 0.02) {
        highest = surfaceInfo.height
        bestHeight = surfaceInfo.height
        bestNormal.copyFrom(surfaceInfo.normal)
        bestWalkable = surfaceInfo.walkable
        bestSlopeAngle = surfaceInfo.slopeAngle
        bestSurfaceType = surfaceInfo.surfaceType
      }
    }

    this.groundInfo.height = bestHeight
    this.groundInfo.walkable = bestWalkable
    this.groundInfo.slopeAngle = bestSlopeAngle
    this.groundInfo.surfaceType = bestSurfaceType
    return this.groundInfo
  }

  overlapsStructureCollider(x, z, radius, currentY = this.floorY) {
    for (let i = 0; i < this.structureColliders.length; i += 1) {
      const collider = this.structureColliders[i]
      const nearestX = clamp(x, collider.minX, collider.maxX)
      const nearestZ = clamp(z, collider.minZ, collider.maxZ)
      const diffX = x - nearestX
      const diffZ = z - nearestZ

      if (diffX * diffX + diffZ * diffZ >= radius * radius) {
        continue
      }

      const surfaceY = this.getStructureSurfaceHeight(collider, nearestX)
      if (collider.type === "ramp") {
        const rampRun = Math.max(collider.maxX - collider.minX, 0.001)
        const rampRise = collider.endY - collider.startY
        const rampNormalY = new BABYLON.Vector3(-rampRise / rampRun, 1, 0).normalize().y
        if (rampNormalY < this.maxWalkableSlopeCos) {
          return true
        }
      }

      if (currentY + this.maxStepHeight < surfaceY - 0.04) {
        return true
      }
    }

    return false
  }

  overlapsWall(x, z, radius, currentY = this.floorY) {
    const minCellX = Math.floor((x - radius) / this.cellSize)
    const maxCellX = Math.floor((x + radius) / this.cellSize)
    const minCellZ = Math.floor((z - radius) / this.cellSize)
    const maxCellZ = Math.floor((z + radius) / this.cellSize)

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        if (!this.isWallCell(cellX, cellZ)) {
          continue
        }

        const minX = cellX * this.cellSize
        const maxX = minX + this.cellSize
        const minZ = cellZ * this.cellSize
        const maxZ = minZ + this.cellSize
        const nearestX = clamp(x, minX, maxX)
        const nearestZ = clamp(z, minZ, maxZ)
        const diffX = x - nearestX
        const diffZ = z - nearestZ

        if (diffX * diffX + diffZ * diffZ < radius * radius) {
          return true
        }
      }
    }

    if (this.overlapsStructureCollider(x, z, radius, currentY)) {
      return true
    }

    return false
  }

  overlapsTeleportBlocker(x, z, radius) {
    for (let i = 0; i < this.teleportBlockers.length; i += 1) {
      const blocker = this.teleportBlockers[i]
      const diffX = x - blocker.x
      const diffZ = z - blocker.z
      const distance = radius + blocker.radius

      if (diffX * diffX + diffZ * diffZ < distance * distance) {
        return true
      }
    }

    return false
  }

  isWithinBounds(x, z, radius = 0) {
    const maxX = this.width * this.cellSize
    const maxZ = this.depth * this.cellSize

    return x - radius >= 0
      && z - radius >= 0
      && x + radius <= maxX
      && z + radius <= maxZ
  }

  canOccupyPosition(x, z, radius) {
    if (!this.isWithinBounds(x, z, radius)) {
      return false
    }

    if (this.overlapsWall(x, z, radius)) {
      return false
    }

    if (this.overlapsTeleportBlocker(x, z, radius)) {
      return false
    }

    return true
  }

  validateTeleportTarget(from, target, radius) {
    if (!this.canOccupyPosition(target.x, target.z, radius)) {
      return false
    }

    const groundInfo = this.getGroundInfoAt(target.x, target.z, this.wallHeight)
    if (!groundInfo.walkable) {
      return false
    }

    if (!this.hasLineOfSight(from, target)) {
      return false
    }

    const diffX = target.x - from.x
    const diffZ = target.z - from.z
    const distance = Math.hypot(diffX, diffZ)
    const steps = Math.max(2, Math.ceil(distance / Math.max(radius * 1.4, 0.4)))

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps
      const sampleX = from.x + diffX * t
      const sampleZ = from.z + diffZ * t

      if (this.overlapsTeleportBlocker(sampleX, sampleZ, radius * 0.8)) {
        return false
      }
    }

    return true
  }

  moveCircle(position, delta, radius, options = {}) {
    const stepSize = options.stepSize || Math.max(radius * 0.25, 0.05)
    const xFirst = this.moveByOrder(position, delta, radius, stepSize, true)
    const zFirst = this.moveByOrder(position, delta, radius, stepSize, false)

    return this.distanceSquared(position, xFirst) >= this.distanceSquared(position, zFirst)
      ? xFirst
      : zFirst
  }

  moveByOrder(position, delta, radius, stepSize, xFirst) {
    const next = position.clone()

    if (xFirst) {
      next.x = this.moveAxis(next.x, next.z, position.y, delta.x, radius, stepSize, "x")
      next.z = this.moveAxis(next.x, next.z, position.y, delta.z, radius, stepSize, "z")
    } else {
      next.z = this.moveAxis(next.x, next.z, position.y, delta.z, radius, stepSize, "z")
      next.x = this.moveAxis(next.x, next.z, position.y, delta.x, radius, stepSize, "x")
    }

    return next
  }

  moveAxis(baseX, baseZ, currentY, delta, radius, stepSize, axis) {
    if (delta === 0) {
      return axis === "x" ? baseX : baseZ
    }

    let current = axis === "x" ? baseX : baseZ
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / stepSize))
    const step = delta / steps

    for (let i = 0; i < steps; i += 1) {
      const candidate = current + step
      const nextX = axis === "x" ? candidate : baseX
      const nextZ = axis === "z" ? candidate : baseZ

      if (this.overlapsWall(nextX, nextZ, radius, currentY)) {
        break
      }

      current = candidate
    }

    return current
  }

  distanceSquared(from, to) {
    const dx = to.x - from.x
    const dz = to.z - from.z
    return dx * dx + dz * dz
  }

  raycastWalls(origin, direction, maxDistance) {
    const dirX = direction.x
    const dirZ = direction.z
    const horizontalLength = Math.hypot(dirX, dirZ)

    if (horizontalLength < 0.0001) {
      return maxDistance
    }

    const rayX = dirX / horizontalLength
    const rayZ = dirZ / horizontalLength
    let cellX = Math.floor(origin.x / this.cellSize)
    let cellZ = Math.floor(origin.z / this.cellSize)

    const deltaDistX = rayX === 0 ? Infinity : Math.abs(this.cellSize / rayX)
    const deltaDistZ = rayZ === 0 ? Infinity : Math.abs(this.cellSize / rayZ)

    let sideDistX
    let sideDistZ
    let stepX
    let stepZ

    if (rayX < 0) {
      stepX = -1
      sideDistX = (origin.x - cellX * this.cellSize) / -rayX
    } else {
      stepX = 1
      sideDistX = (((cellX + 1) * this.cellSize) - origin.x) / (rayX || 1)
    }

    if (rayZ < 0) {
      stepZ = -1
      sideDistZ = (origin.z - cellZ * this.cellSize) / -rayZ
    } else {
      stepZ = 1
      sideDistZ = (((cellZ + 1) * this.cellSize) - origin.z) / (rayZ || 1)
    }

    let distance = 0

    while (distance <= maxDistance) {
      if (sideDistX < sideDistZ) {
        distance = sideDistX
        sideDistX += deltaDistX
        cellX += stepX
      } else {
        distance = sideDistZ
        sideDistZ += deltaDistZ
        cellZ += stepZ
      }

      if (this.isWallCell(cellX, cellZ)) {
        return Math.min(distance, maxDistance)
      }
    }

    return maxDistance
  }

  hasLineOfSight(from, to) {
    const diffX = to.x - from.x
    const diffZ = to.z - from.z
    const distance = Math.hypot(diffX, diffZ)

    if (distance < 0.001) {
      return true
    }

    const hitDistance = this.raycastWalls(from, { x: diffX, z: diffZ }, distance)
    return hitDistance >= distance - 0.12
  }
}
