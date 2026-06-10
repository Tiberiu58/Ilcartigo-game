/**
 * Input — keyboard state + pointer-lock mouselook.
 *
 * Mouselook accumulates raw mouse deltas per frame; the controller reads and
 * clears them in its update tick so we never lose movement between frames.
 */

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'      // Shift — drops stance, slows to 3 m/s, tighter accuracy
  | 'walk'        // Ctrl  — CS-style walk modifier, 5 m/s, no slide
  | 'reload'
  | 'slot1'
  | 'slot2'
  | 'slotLast'
  | 'ability'
  | 'grenade';

// Note: Ctrl is intentionally UNBOUND — Ctrl+W closes the browser tab, Ctrl+D
// bookmarks, and neither can be reliably preventDefault()ed under pointer-lock.
// The 'walk' action remains defined for future re-binding (e.g. to CapsLock).
const DEFAULT_BINDINGS: Record<string, Action> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'crouch',
  KeyR: 'reload',
  Digit1: 'slot1',
  Digit2: 'slot2',
  KeyQ: 'slotLast',
  KeyE: 'ability',
  KeyG: 'grenade',
};

export class Input {
  private actions = new Set<Action>();
  private actionEdgeDowns = new Set<Action>();
  private bindings = { ...DEFAULT_BINDINGS };
  private canvas: HTMLCanvasElement;

  // Raw mouse delta accumulated since the last consume() call.
  private mouseDX = 0;
  private mouseDY = 0;

  // Mouse button state: index 0 = LMB, 2 = RMB.
  private mouseButtons = new Set<number>();
  private mouseEdgeDowns: number[] = [];   // buttons that had a fresh down this frame

  // 0.5 maps roughly to "Valorant 0.5 @ 800dpi" feel; the controller scales it.
  sensitivity = 0.5;
  // When zoomed, mouse delta is multiplied by this so wrist motion maps to
  // consistent on-screen angle regardless of FOV. Set externally by Game.
  zoomSensitivityScale = 1;
  pointerLocked = false;

  onPointerLockChange?: (locked: boolean) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeRaw);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', this.clearAll);
  }

  isMouseDown(button = 0): boolean {
    return this.pointerLocked && this.mouseButtons.has(button);
  }

  /** Returns true exactly once per fresh mouse-down; consume on read. */
  consumeMouseEdge(button = 0): boolean {
    const i = this.mouseEdgeDowns.indexOf(button);
    if (i < 0) return false;
    this.mouseEdgeDowns.splice(i, 1);
    return true;
  }

  requestPointerLock() {
    this.canvas.requestPointerLock();
  }

  exitPointerLock() {
    document.exitPointerLock();
  }

  isDown(action: Action): boolean {
    return this.actions.has(action);
  }

  /**
   * Returns true exactly once per keydown of the bound action; the action is
   * popped on read. Use for "press" semantics (reload, ability) so holding the
   * key doesn't fire every frame.
   */
  consumeAction(action: Action): boolean {
    if (!this.actionEdgeDowns.has(action)) return false;
    this.actionEdgeDowns.delete(action);
    return true;
  }

  /** Returns accumulated mouse delta and resets it. Called once per frame. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const action = this.bindings[e.code];
    if (action) {
      if (!this.actions.has(action)) this.actionEdgeDowns.add(action);
      this.actions.add(action);
      // Prevent Space scrolling the page when not locked.
      if (e.code === 'Space') e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = this.bindings[e.code];
    if (action) this.actions.delete(action);
  };

  // We track button state regardless of pointer-lock so the *first* mousedown
  // after PLAY isn't lost to the lock-acquisition race in Chrome. Whether the
  // game actually fires is gated at the *read* site (isMouseDown), which only
  // returns true while the pointer is locked. consumeMouseEdge is similarly
  // safe because we clear the edge queue on lock-gain (see onPointerLockChangeRaw).
  private onMouseDown = (e: MouseEvent) => {
    if (!this.mouseButtons.has(e.button)) {
      this.mouseButtons.add(e.button);
      this.mouseEdgeDowns.push(e.button);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtons.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    // Chrome on Windows occasionally emits absurd movement deltas under
    // pointer-lock (cursor crossing a screen edge, OS acceleration glitches).
    // Real human flicks top out around 200 px/frame; 350 leaves headroom for
    // very fast players, and anything past that is rejected as a spike so the
    // view doesn't snap halfway across the map.
    const MAX_DELTA = 350;
    const dx = e.movementX;
    const dy = e.movementY;
    if (Math.abs(dx) < MAX_DELTA) this.mouseDX += dx;
    if (Math.abs(dy) < MAX_DELTA) this.mouseDY += dy;
  };

  private onPointerLockChangeRaw = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) {
      // Wipe pre-lock button state so the player can't fire a spurious shot
      // from a click that occurred while they were still on the menu.
      this.mouseEdgeDowns.length = 0;
    } else {
      this.clearAll();
    }
    this.onPointerLockChange?.(this.pointerLocked);
  };

  private clearAll = () => {
    this.actions.clear();
    this.actionEdgeDowns.clear();
    this.mouseButtons.clear();
    this.mouseEdgeDowns.length = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  };
}
