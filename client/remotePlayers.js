import { BABYLON } from "../babylon.js"
import { damp } from "../utils.js"

const DEBUG_REMOTE_HITBOXES = false

class RemotePlayerView {
  constructor(scene, id) {
    this.scene = scene
    this.id = id
    this.target = {
      position: new BABYLON.Vector3(),
      yaw: 0,
      alive: true,
      health: 100,
      weaponId: "rifle",
    }

    this.root = new BABYLON.TransformNode(`remotePlayer-${id}`, scene)

    this.bodyMaterial = new BABYLON.StandardMaterial(`remotePlayerBody-${id}`, scene)
    this.bodyMaterial.diffuseColor = BABYLON.Color3.FromHexString("#cb7f57")
    this.bodyMaterial.specularColor = BABYLON.Color3.Black()
    this.bodyMaterial.emissiveColor = BABYLON.Color3.FromHexString("#37241b")

    this.headMaterial = new BABYLON.StandardMaterial(`remotePlayerHead-${id}`, scene)
    this.headMaterial.diffuseColor = BABYLON.Color3.FromHexString("#efd8c0")
    this.headMaterial.specularColor = BABYLON.Color3.Black()

    this.body = BABYLON.MeshBuilder.CreateBox(`remotePlayerBodyMesh-${id}`, {
      width: 0.7,
      height: 1.3,
      depth: 0.4,
    }, scene)
    this.body.parent = this.root
    this.body.position.y = 0.95
    this.body.material = this.bodyMaterial
    this.body.isPickable = false

    this.head = BABYLON.MeshBuilder.CreateBox(`remotePlayerHeadMesh-${id}`, {
      width: 0.42,
      height: 0.42,
      depth: 0.42,
    }, scene)
    this.head.parent = this.root
    this.head.position.y = 1.82
    this.head.material = this.headMaterial
    this.head.isPickable = false

    this.gun = BABYLON.MeshBuilder.CreateBox(`remotePlayerGun-${id}`, {
      width: 0.16,
      height: 0.12,
      depth: 0.58,
    }, scene)
    this.gun.parent = this.root
    this.gun.position.set(0.32, 1.12, 0.22)
    this.gun.material = this.bodyMaterial
    this.gun.isPickable = false

    this.hitboxMaterial = new BABYLON.StandardMaterial(`remotePlayerHitbox-${id}`, scene)
    this.hitboxMaterial.diffuseColor = BABYLON.Color3.FromHexString("#44c8ff")
    this.hitboxMaterial.emissiveColor = BABYLON.Color3.FromHexString("#1b6f9c")
    this.hitboxMaterial.alpha = 0.2
    this.hitboxMaterial.wireframe = true

    // Visual-only helper matching the server's virtual player hitbox.
    // Damage is still decided on the authoritative Node server.
    this.debugHitbox = BABYLON.MeshBuilder.CreateBox(`remotePlayerHitboxMesh-${id}`, {
      width: 1.36,
      height: 1.85,
      depth: 1.36,
    }, scene)
    this.debugHitbox.parent = this.root
    this.debugHitbox.position.y = 0.92
    this.debugHitbox.material = this.hitboxMaterial
    this.debugHitbox.isPickable = false
    this.debugHitbox.setEnabled(DEBUG_REMOTE_HITBOXES)
  }

  applySnapshot(snapshot) {
    this.target.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)
    this.target.yaw = snapshot.yaw
    this.target.alive = snapshot.alive
    this.target.health = snapshot.health
    this.target.weaponId = snapshot.weaponId
  }

  update(dt) {
    this.root.setEnabled(this.target.alive)
    if (!this.target.alive) {
      return
    }

    this.root.position.x = damp(this.root.position.x, this.target.position.x, 18, dt)
    this.root.position.y = damp(this.root.position.y, this.target.position.y, 18, dt)
    this.root.position.z = damp(this.root.position.z, this.target.position.z, 18, dt)
    this.root.rotation.y = damp(this.root.rotation.y, this.target.yaw, 18, dt)
    this.debugHitbox.setEnabled(DEBUG_REMOTE_HITBOXES && this.target.alive)
  }

  dispose() {
    this.root.dispose()
    this.bodyMaterial.dispose()
    this.headMaterial.dispose()
    this.hitboxMaterial.dispose()
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene
    this.players = new Map()
  }

  syncSnapshots(snapshots) {
    const liveIds = new Set()
    snapshots.forEach((snapshot) => {
      liveIds.add(snapshot.id)
      let view = this.players.get(snapshot.id)
      if (!view) {
        view = new RemotePlayerView(this.scene, snapshot.id)
        this.players.set(snapshot.id, view)
      }
      view.applySnapshot(snapshot)
    })

    for (const [id, view] of this.players.entries()) {
      if (!liveIds.has(id)) {
        view.dispose()
        this.players.delete(id)
      }
    }
  }

  update(dt) {
    for (const view of this.players.values()) {
      view.update(dt)
    }
  }

  clear() {
    for (const view of this.players.values()) {
      view.dispose()
    }
    this.players.clear()
  }
}
