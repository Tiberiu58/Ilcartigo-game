export class InputController {
  constructor(canvas) {
    this.canvas = canvas
    this.keys = Object.create(null)
    this.lookX = 0
    this.lookY = 0
    this.fireHeld = false
    this.firePressed = false
    this.jumpQueued = false
    this.reloadQueued = false
    this.teleportQueued = false
    this.weaponCycle = 0
    this.weaponSlotQueued = null
    this.pointerLocked = false
    this.onPointerLockChange = null
    this.onPointerLockError = null
    this.pendingPointerLockRequest = false

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerDown = this.handlePointerDown.bind(this)
    this.handlePointerUp = this.handlePointerUp.bind(this)
    this.handleCanvasClick = this.handleCanvasClick.bind(this)
    this.handleWheel = this.handleWheel.bind(this)
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this)
    this.handlePointerLockError = this.handlePointerLockError.bind(this)
    this.handleContextMenu = this.handleContextMenu.bind(this)
    this.handleBlur = this.handleBlur.bind(this)
  }

  connect() {
    document.addEventListener("keydown", this.handleKeyDown)
    document.addEventListener("keyup", this.handleKeyUp)
    document.addEventListener("mousemove", this.handlePointerMove, { passive: true })
    document.addEventListener("mousedown", this.handlePointerDown)
    document.addEventListener("mouseup", this.handlePointerUp)
    this.canvas.addEventListener("click", this.handleCanvasClick)
    document.addEventListener("wheel", this.handleWheel, { passive: false })
    this.canvas.addEventListener("contextmenu", this.handleContextMenu)
    document.addEventListener("pointerlockchange", this.handlePointerLockChange)
    document.addEventListener("pointerlockerror", this.handlePointerLockError)
    window.addEventListener("blur", this.handleBlur)
  }

  dispose() {
    document.removeEventListener("keydown", this.handleKeyDown)
    document.removeEventListener("keyup", this.handleKeyUp)
    document.removeEventListener("mousemove", this.handlePointerMove)
    document.removeEventListener("mousedown", this.handlePointerDown)
    document.removeEventListener("mouseup", this.handlePointerUp)
    this.canvas.removeEventListener("click", this.handleCanvasClick)
    document.removeEventListener("wheel", this.handleWheel)
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu)
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange)
    document.removeEventListener("pointerlockerror", this.handlePointerLockError)
    window.removeEventListener("blur", this.handleBlur)
  }

  requestPointerLock() {
    if (document.pointerLockElement === this.canvas) {
      return Promise.resolve()
    }
    if (this.pendingPointerLockRequest) {
      return Promise.resolve()
    }
    this.pendingPointerLockRequest = true
    try {
      const result = this.canvas.requestPointerLock?.()
      if (result && typeof result.catch === "function") {
        return result.catch(() => {
          this.pendingPointerLockRequest = false
          if (typeof this.onPointerLockError === "function") {
            this.onPointerLockError()
          }
        })
      }
      return Promise.resolve(result)
    } catch (error) {
      this.pendingPointerLockRequest = false
      if (typeof this.onPointerLockError === "function") {
        this.onPointerLockError(error)
      }
      return Promise.resolve()
    }
  }

  isLocked() {
    return this.pointerLocked
  }

  consumeLookDelta() {
    const delta = { x: this.lookX, y: this.lookY }
    this.lookX = 0
    this.lookY = 0
    return delta
  }

  consumeJumpPressed() {
    const value = this.jumpQueued
    this.jumpQueued = false
    return value
  }

  consumeReloadPressed() {
    const value = this.reloadQueued
    this.reloadQueued = false
    return value
  }

  consumeWeaponCycle() {
    const value = this.weaponCycle
    this.weaponCycle = 0
    return value
  }

  consumeWeaponSlot() {
    const value = this.weaponSlotQueued
    this.weaponSlotQueued = null
    return value
  }

  consumeFirePressed() {
    const value = this.firePressed
    this.firePressed = false
    return value
  }

  consumeTeleportPressed() {
    const value = this.teleportQueued
    this.teleportQueued = false
    return value
  }

  getMoveAxes() {
    return {
      forward: (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0),
      right: (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0),
    }
  }

  isSprinting() {
    return Boolean(this.keys.ShiftLeft || this.keys.ShiftRight)
  }

  isJumpHeld() {
    return Boolean(this.keys.Space)
  }

  isFireHeld() {
    return this.fireHeld
  }

  resetTransientState() {
    this.lookX = 0
    this.lookY = 0
    this.fireHeld = false
    this.firePressed = false
    this.jumpQueued = false
    this.reloadQueued = false
    this.teleportQueued = false
    this.weaponCycle = 0
    this.weaponSlotQueued = null
  }

  clearFireState() {
    this.fireHeld = false
    this.firePressed = false
  }

  handleKeyDown(event) {
    const isGameplayKey = [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ShiftLeft",
      "ShiftRight",
      "Space",
      "KeyR",
      "KeyQ",
      "Digit1",
      "Digit2",
      "Digit3",
    ].includes(event.code)

    if (isGameplayKey) {
      event.preventDefault()
    }

    const isRepeatSensitiveAction = [
      "Space",
      "KeyR",
      "KeyQ",
      "Digit1",
      "Digit2",
      "Digit3",
    ].includes(event.code)

    if (event.repeat && isRepeatSensitiveAction) {
      this.keys[event.code] = true
      return
    }

    this.keys[event.code] = true

    if (event.code === "Space") {
      this.jumpQueued = true
    }

    if (event.code === "KeyR") {
      this.reloadQueued = true
    }

    if (event.code === "KeyQ") {
      this.teleportQueued = true
    }

    if (event.code === "Digit1" || event.code === "Digit2" || event.code === "Digit3") {
      this.weaponSlotQueued = Number(event.code.slice(-1)) - 1
    }
  }

  handleKeyUp(event) {
    this.keys[event.code] = false
  }

  handlePointerMove(event) {
    if (!this.pointerLocked) {
      return
    }

    const deltaX = Number.isFinite(event.movementX) ? event.movementX : 0
    const deltaY = Number.isFinite(event.movementY) ? event.movementY : 0
    this.lookX += deltaX
    this.lookY += deltaY
  }

  handlePointerDown(event) {
    if (event.button !== 0) {
      return
    }

    if (!this.pointerLocked) {
      return
    }

    event.preventDefault()
    this.fireHeld = true
    this.firePressed = true
  }

  handlePointerUp(event) {
    if (event.button === 0) {
      this.fireHeld = false
    }
  }

  handleCanvasClick() {
    if (!this.pointerLocked) {
      this.requestPointerLock()
    }
  }

  handleWheel(event) {
    if (!this.pointerLocked) {
      return
    }

    event.preventDefault()
    if (event.deltaY > 0) {
      this.weaponCycle = 1
    } else if (event.deltaY < 0) {
      this.weaponCycle = -1
    }
  }

  handlePointerLockChange() {
    this.pointerLocked = document.pointerLockElement === this.canvas
    this.pendingPointerLockRequest = false

    if (!this.pointerLocked) {
      this.clearFireState()
      this.lookX = 0
      this.lookY = 0
    }

    if (typeof this.onPointerLockChange === "function") {
      this.onPointerLockChange(this.pointerLocked)
    }
  }

  handlePointerLockError() {
    this.pendingPointerLockRequest = false
    this.pointerLocked = document.pointerLockElement === this.canvas
    if (typeof this.onPointerLockError === "function") {
      this.onPointerLockError()
    }
  }

  handleContextMenu(event) {
    event.preventDefault()
  }

  handleBlur() {
    this.keys = Object.create(null)
    this.resetTransientState()
  }
}
