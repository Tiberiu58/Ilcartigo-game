/**
 * ObjectiveMarker — an on-screen indicator for a world-space objective (the
 * King of the Hill zone). When the objective is in view it shows a pip + the
 * distance; when it's off-screen or behind you it clamps to the screen edge as
 * an arrow pointing the way — so you can always find the contested hill,
 * especially right after it relocates.
 *
 * The pure screen-layout math lives in `placeMarker()` (exported for tests);
 * `update()` just does the THREE projection + behind-test and applies the
 * result to the DOM. Pure client, no protocol.
 */

import type * as THREE from 'three';

export interface MarkerPlacement {
  x: number;          // screen px
  y: number;          // screen px
  rot: number | null; // arrow rotation (radians) when at an edge; null = on-screen pip
  edge: boolean;      // true = clamped to a screen edge (off-screen/behind)
}

/**
 * Given a point's projected NDC (−1..1), whether it's behind the camera, and the
 * viewport size, decide where to draw the marker. On-screen → a pip at the
 * projected spot; off-screen/behind → clamped to the inset screen rectangle with
 * an arrow angle pointing outward toward the target.
 */
export function placeMarker(
  ndcX: number, ndcY: number, behind: boolean, w: number, h: number, margin = 30,
): MarkerPlacement {
  const onScreen = !behind && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
  if (onScreen) {
    return { x: (ndcX * 0.5 + 0.5) * w, y: (-ndcY * 0.5 + 0.5) * h, rot: null, edge: false };
  }
  // Off-screen (or behind): take a screen-space direction from centre. When the
  // target is behind, the projected NDC is mirrored, so flip it back.
  let sx = ndcX, sy = ndcY;
  if (behind) { sx = -sx; sy = -sy; }
  let dx = sx, dy = -sy;            // NDC y is up; screen y is down
  if (dx === 0 && dy === 0) dy = 1; // degenerate (dead centre + behind) → point down
  const cx = w / 2, cy = h / 2;
  const halfW = cx - margin, halfH = cy - margin;
  // Scale the direction so it just reaches the inset rectangle edge.
  const scale = Math.min(halfW / Math.max(Math.abs(dx), 1e-4), halfH / Math.max(Math.abs(dy), 1e-4));
  return { x: cx + dx * scale, y: cy + dy * scale, rot: Math.atan2(dy, dx), edge: true };
}

export class ObjectiveMarker {
  private root: HTMLElement | null;
  private pip: HTMLElement | null;
  private arrow: HTMLElement | null;
  private label: HTMLElement | null;
  // Scratch vectors — allocated once.
  private _v: THREE.Vector3;
  private _d: THREE.Vector3;
  private _t: THREE.Vector3;

  constructor(makeVec: () => THREE.Vector3) {
    this.root = document.getElementById('objective-marker');
    this.pip = document.getElementById('om-pip');
    this.arrow = document.getElementById('om-arrow');
    this.label = document.getElementById('om-label');
    this._v = makeVec();
    this._d = makeVec();
    this._t = makeVec();
  }

  /** Position the marker for `worldPos` as seen by `camera`. `color` tints it. */
  update(worldPos: THREE.Vector3, camera: THREE.PerspectiveCamera, color: string) {
    if (!this.root) return;
    this._v.copy(worldPos).project(camera);
    camera.getWorldDirection(this._d);
    this._t.subVectors(worldPos, camera.position);
    const behind = this._d.dot(this._t) < 0;

    const p = placeMarker(this._v.x, this._v.y, behind, window.innerWidth, window.innerHeight);
    this.root.style.display = 'block';
    this.root.style.left = `${p.x}px`;
    this.root.style.top = `${p.y}px`;
    this.root.style.color = color;

    if (p.edge && p.rot !== null) {
      if (this.arrow) {
        this.arrow.style.display = 'block';
        // The ▲ glyph points up (−90° in our +x-based angle), so add 90° to
        // aim it along the placement direction.
        this.arrow.style.transform = `translate(-50%, -50%) rotate(${p.rot + Math.PI / 2}rad)`;
      }
      if (this.pip) this.pip.style.display = 'none';
      if (this.label) this.label.style.display = 'none';
    } else {
      if (this.arrow) this.arrow.style.display = 'none';
      if (this.pip) this.pip.style.display = 'block';
      if (this.label) {
        const dist = Math.hypot(worldPos.x - camera.position.x, worldPos.z - camera.position.z);
        this.label.textContent = `${dist.toFixed(0)}m`;
        this.label.style.display = 'block';
      }
    }
  }

  hide() {
    if (this.root) this.root.style.display = 'none';
  }
}
