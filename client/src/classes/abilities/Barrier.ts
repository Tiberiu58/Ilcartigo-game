/**
 * Barrier — Engineer's deployable shield wall.
 *
 * Mechanical:
 *   - 8s solid (blocks bullets AND movement, including owner — chosen design,
 *     user picked "Stay solid to everyone including owner").
 *   - 2.2m wide × 2.0m tall × 0.2m thick. Wide enough for one player to
 *     cover behind. Solid the instant it deploys (no warm-up).
 *   - 20s cooldown, starts on cast (Ability base). Engineer's class passive
 *     (cooldown ×0.85) means actual cooldown is 17s.
 *
 * Polish (Phase 5c):
 *   - Deploy animation: visual scales from 0.1 → 1 over 0.15s, alpha rises
 *     0 → 0.32. The *collision AABB is solid from t=0* — the warm-up is
 *     visual-only, so timing is honest. Implemented as an onActiveTick ramp
 *     that mutates the visual mesh; we set isActive briefly so the runner
 *     ticks us, then close out.
 *   - Energy palette: additive yellow with a brighter wireframe outline.
 */

import * as THREE from 'three';
import { Ability, type AbilityContext } from '../types';

const LIFETIME = 8.0;
const FORWARD_OFFSET = 2.2;
const SIZE = new THREE.Vector3(2.2, 2.0, 0.2);
const DEPLOY_TIME = 0.15;

export class Barrier extends Ability {
  readonly id = 'barrier' as const;
  readonly displayName = 'Barrier';
  readonly baseCooldown = 20;

  private _spawn = new THREE.Vector3();
  private _fwd = new THREE.Vector3();

  /** Visual group for the *current* in-flight deploy animation. */
  private deployGroup: THREE.Group | null = null;
  private deployMat: THREE.MeshBasicMaterial | null = null;
  /** Seconds remaining on the deploy animation. */
  private deployTimeLeft = 0;

  protected onTrigger(ctx: AbilityContext): void {
    ctx.player.aimDir(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, -1);
    this._fwd.normalize();

    const feet = ctx.player.pos;
    this._spawn.set(
      feet.x + this._fwd.x * FORWARD_OFFSET,
      feet.y + SIZE.y / 2,
      feet.z + this._fwd.z * FORWARD_OFFSET,
    );

    const group = new THREE.Group();

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xf5d442,
      transparent: true,
      opacity: 0,                  // ramps up during deploy
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(SIZE.x, SIZE.y, SIZE.z), innerMat);
    group.add(inner);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE.x, SIZE.y, SIZE.z)),
      new THREE.LineBasicMaterial({ color: 0xfff0a0 }),
    );
    group.add(edges);

    group.position.copy(this._spawn);
    group.lookAt(this._spawn.x + this._fwd.x, this._spawn.y, this._spawn.z + this._fwd.z);
    group.scale.set(0.1, 0.1, 1);   // initial mid-deploy scale

    // Collision is FULL from t=0 even though the visual is mid-warmup. World
    // tracks the mesh + AABB; we keep refs so onActiveTick can animate.
    ctx.world.addTemporarySolid(this._spawn, SIZE, group, LIFETIME);
    this.deployGroup = group;
    this.deployMat = innerMat;
    void inner;     // referenced via deployMat; keep the local for clarity above

    this.deployTimeLeft = DEPLOY_TIME;
    this.isActive = true;            // keeps runner ticking us for the deploy ramp

    ctx.bus.emit('screenShake', { intensity: 0.025, duration: 0.12 });
  }

  protected onActiveTick(dt: number, _ctx: AbilityContext): void {
    if (this.deployTimeLeft > 0) {
      this.deployTimeLeft -= dt;
      const t = 1 - Math.max(0, this.deployTimeLeft / DEPLOY_TIME);
      // Scale from 0.1 to 1 horizontally + height.
      if (this.deployGroup) {
        const s = 0.1 + 0.9 * t;
        this.deployGroup.scale.x = s;
        this.deployGroup.scale.y = s;
      }
      if (this.deployMat) this.deployMat.opacity = 0.32 * t;
      if (this.deployTimeLeft <= 0) {
        // Close out active state — barrier persists in the world via the
        // TemporarySolid TTL, we don't need to keep ticking.
        this.isActive = false;
        this.deployGroup = null;
        this.deployMat = null;
      }
    } else {
      this.isActive = false;
    }
  }

  protected onActiveEnd(_ctx: AbilityContext): void {
    // If we got cancelled mid-deploy (mode swap, class swap), snap visual to
    // finished state so the temporary solid doesn't hang there at 10% scale.
    if (this.deployGroup) this.deployGroup.scale.set(1, 1, 1);
    if (this.deployMat) this.deployMat.opacity = 0.32;
    this.deployGroup = null;
    this.deployMat = null;
    this.deployTimeLeft = 0;
  }
}
