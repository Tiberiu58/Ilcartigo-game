/**
 * Viewmodel — first-person weapon mesh + procedural recoil/sway/swap.
 *
 * Each weapon ID gets a distinct procedural geometry tree built from boxes.
 * The Viewmodel owns:
 *   - the mesh group (parented to the camera)
 *   - muzzle anchor + flash plane
 *   - per-shot recoil kick (visual: z-push back, returns to zero)
 *   - walk-bob driven by player speed
 *   - SWAP animation: drops the gun below the camera by SWAP_DROP over
 *     SWAP_DURATION, rebuilds geometry for the new weapon, rises back up.
 *
 * Tracers are spawned by Game (not the viewmodel) so bot shots share the
 * effect path.
 */

import * as THREE from 'three';
import type { WeaponId } from './Weapon';

const SWAP_DURATION = 0.32;       // total time gun is offscreen during swap
const SWAP_DROP = 0.35;           // y-offset at full swap

export class Viewmodel {
  readonly group: THREE.Group;
  private content: THREE.Group;      // child group that holds current weapon meshes
  private muzzleAnchor: THREE.Object3D;
  private flashMesh: THREE.Mesh;
  private flashTime = 0;

  private currentId: WeaponId = 'ar';
  private bobPhase = 0;
  private recoilOffset = 0;
  private restPos = new THREE.Vector3(0.32, -0.28, -0.55);
  private restRot = new THREE.Euler(0, Math.PI, 0); // -Z forward

  // Swap animation: -1 = stable, 0..1 = animating (0=start, 1=done).
  private swapPhase = -1;
  private swapPending: WeaponId | null = null;

  // Hidden flag — sniper scope hides the viewmodel completely.
  private hidden = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.group.position.copy(this.restPos);
    this.group.rotation.copy(this.restRot);
    camera.add(this.group);

    this.content = new THREE.Group();
    this.group.add(this.content);

    this.muzzleAnchor = new THREE.Object3D();
    this.group.add(this.muzzleAnchor);

    // Muzzle flash plane (additive, hidden at rest).
    const flashGeom = new THREE.PlaneGeometry(0.35, 0.35);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe170,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flashMesh = new THREE.Mesh(flashGeom, flashMat);
    this.group.add(this.flashMesh);

    this.buildFor('ar');
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.group.visible = !hidden;
  }

  /**
   * Set the viewmodel's overall opacity. Used by Ghost Cloak to ghost-out the
   * player's own hands while invisible. Walks the content tree and tweaks
   * each MeshLambertMaterial's transparent + opacity. Opacity=1.0 restores.
   */
  setOpacity(o: number) {
    this.content.traverse((n) => {
      const m = n as THREE.Mesh;
      const mat = m.material as THREE.MeshLambertMaterial | undefined;
      if (!mat) return;
      if (o < 1.0) {
        mat.transparent = true;
        mat.opacity = o;
        mat.depthWrite = false;
      } else {
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
    });
  }

  /** Returns the muzzle position in world space, for spawning tracers. */
  muzzleWorldPos(out: THREE.Vector3): THREE.Vector3 {
    this.muzzleAnchor.getWorldPosition(out);
    return out;
  }

  /** Trigger swap animation. Mesh rebuild happens at the bottom of the dip. */
  swapTo(id: WeaponId) {
    if (id === this.currentId && this.swapPhase < 0) return;
    this.swapPending = id;
    this.swapPhase = 0;
  }

  /** Call on fire — triggers flash + visual kick. No-op while swapping. */
  onFire() {
    if (this.swapPhase >= 0 || this.hidden) return;
    this.flashTime = 0.06;
    this.recoilOffset = 0.05;
  }

  update(dt: number, playerSpeed: number, isGrounded: boolean) {
    // Swap progression.
    let swapDip = 0;
    if (this.swapPhase >= 0) {
      this.swapPhase += dt / SWAP_DURATION;
      // Triangle wave: rises 0..1 from 0..0.5, falls 1..0 from 0.5..1.
      const triangle = this.swapPhase < 0.5
        ? this.swapPhase * 2
        : (1 - this.swapPhase) * 2;
      swapDip = Math.max(0, triangle) * SWAP_DROP;

      // Halfway point → rebuild geometry for the pending weapon.
      if (this.swapPhase >= 0.5 && this.swapPending) {
        this.buildFor(this.swapPending);
        this.swapPending = null;
      }
      if (this.swapPhase >= 1) this.swapPhase = -1;
    }

    // Walk-bob: sine driven by horizontal speed.
    this.bobPhase += dt * (playerSpeed * 0.6 + 1.0);
    const bobAmp = Math.min(1, playerSpeed / 9.5) * (isGrounded ? 0.012 : 0.004);
    const bobX = Math.sin(this.bobPhase * 2) * bobAmp;
    const bobY = Math.abs(Math.cos(this.bobPhase * 2)) * bobAmp * 0.6;

    // Recoil offset decays exponentially.
    this.recoilOffset *= Math.exp(-dt * 18);

    this.group.position.set(
      this.restPos.x + bobX,
      this.restPos.y - bobY - swapDip,
      this.restPos.z + this.recoilOffset,
    );

    // Flash fade.
    const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flashMesh.rotation.z += dt * 30;
      flashMat.opacity = Math.max(0, this.flashTime / 0.06);
    } else {
      flashMat.opacity = 0;
    }
  }

  private buildFor(id: WeaponId) {
    this.currentId = id;
    // Clear previous geometry.
    while (this.content.children.length > 0) {
      const c = this.content.children[0];
      this.content.remove(c);
      disposeRecursive(c);
    }

    // Build new geometry — each helper returns the muzzle z-offset from group origin.
    const muzzleZ = WEAPON_BUILDERS[id](this.content);
    this.muzzleAnchor.position.set(0, 0.02, muzzleZ);
    this.flashMesh.position.copy(this.muzzleAnchor.position);
  }
}

/** Map of weapon id → builder. Each builder adds meshes to the parent and returns muzzle z. */
const WEAPON_BUILDERS: Record<WeaponId, (parent: THREE.Group) => number> = {
  ar: buildAR,
  smg: buildSMG,
  sniper: buildSniper,
  shotgun: buildShotgun,
  marksman: buildMarksman,
  pistol: buildPistol,
};

function buildAR(p: THREE.Group): number {
  p.add(box(0.16, 0.12, 0.42, 0x2c333d, 0, 0, 0));            // body
  p.add(box(0.10, 0.10, 0.22, 0x404a55, 0, -0.02, 0.28));     // stock
  p.add(box(0.06, 0.06, 0.45, 0x1a1f25, 0, 0.02, -0.32));     // barrel
  p.add(box(0.10, 0.18, 0.10, 0x232931, 0, -0.14, 0.02));     // mag
  p.add(box(0.08, 0.14, 0.10, 0x232931, 0, -0.12, 0.18));     // grip
  p.add(box(0.02, 0.05, 0.02, 0xf5d442, 0, 0.10, -0.20));     // front sight
  p.add(box(0.04, 0.04, 0.02, 0xf5d442, 0, 0.10, 0.18));      // rear sight
  return -0.56;
}

function buildSMG(p: THREE.Group): number {
  p.add(box(0.14, 0.11, 0.30, 0x2a2f38, 0, 0, 0));            // body
  p.add(box(0.05, 0.05, 0.30, 0x18181d, 0, 0.02, -0.25));     // barrel
  p.add(box(0.09, 0.20, 0.09, 0x232931, 0, -0.15, 0.0));      // mag
  p.add(box(0.07, 0.13, 0.09, 0x232931, 0, -0.12, 0.14));     // grip
  p.add(box(0.06, 0.04, 0.10, 0x18181d, 0, 0.085, 0.05));     // rail
  p.add(box(0.02, 0.05, 0.02, 0xf5d442, 0, 0.13, -0.18));     // front sight
  return -0.42;
}

function buildSniper(p: THREE.Group): number {
  p.add(box(0.14, 0.10, 0.52, 0x1c2026, 0, 0, 0));            // body
  p.add(box(0.10, 0.10, 0.30, 0x32384a, 0, -0.02, 0.34));     // stock
  p.add(box(0.05, 0.05, 0.70, 0x0e1115, 0, 0.02, -0.50));     // long barrel
  p.add(box(0.12, 0.12, 0.22, 0x111317, 0, 0.10, 0.0));       // scope body
  p.add(box(0.08, 0.08, 0.06, 0x55b0d0, 0, 0.10, -0.12));     // scope lens (cyan)
  p.add(box(0.06, 0.14, 0.08, 0x232931, 0, -0.12, 0.18));     // grip
  p.add(box(0.08, 0.16, 0.08, 0x232931, 0, -0.14, 0.02));     // mag
  return -0.86;
}

function buildShotgun(p: THREE.Group): number {
  p.add(box(0.16, 0.12, 0.46, 0x3a2620, 0, 0, 0));            // body (wood-ish)
  p.add(box(0.10, 0.10, 0.26, 0x2a1810, 0, -0.02, 0.32));     // stock
  // Twin barrels — slight horizontal offset for visual identity.
  p.add(box(0.045, 0.045, 0.55, 0x0a0c10, -0.025, 0.04, -0.40));
  p.add(box(0.045, 0.045, 0.55, 0x0a0c10,  0.025, 0.04, -0.40));
  p.add(box(0.08, 0.13, 0.10, 0x2a1810, 0, -0.12, 0.18));     // grip
  p.add(box(0.18, 0.04, 0.10, 0x232931, 0, -0.08, 0.05));     // pump
  return -0.65;
}

function buildMarksman(p: THREE.Group): number {
  p.add(box(0.14, 0.11, 0.48, 0x26303a, 0, 0, 0));            // body (gunmetal blue)
  p.add(box(0.10, 0.10, 0.26, 0x39434f, 0, -0.02, 0.32));     // stock
  p.add(box(0.05, 0.05, 0.60, 0x10141a, 0, 0.02, -0.44));     // long barrel
  p.add(box(0.10, 0.06, 0.18, 0x111317, 0, 0.095, -0.02));    // low-profile optic
  p.add(box(0.06, 0.05, 0.05, 0x4ad6a0, 0, 0.095, -0.12));    // optic lens (teal)
  p.add(box(0.08, 0.17, 0.09, 0x202830, 0, -0.13, 0.04));     // mag
  p.add(box(0.07, 0.14, 0.09, 0x202830, 0, -0.12, 0.20));     // grip
  p.add(box(0.05, 0.04, 0.16, 0x10141a, 0, -0.06, -0.30));    // handguard
  return -0.74;
}

function buildPistol(p: THREE.Group): number {
  p.add(box(0.10, 0.10, 0.18, 0x2c333d, 0, 0, 0));            // slide
  p.add(box(0.04, 0.04, 0.18, 0x18181d, 0, 0.02, -0.13));     // barrel tip
  p.add(box(0.08, 0.16, 0.10, 0x232931, 0, -0.12, 0.05));     // grip
  p.add(box(0.07, 0.06, 0.07, 0x232931, 0, -0.18, 0.05));     // mag base
  p.add(box(0.02, 0.03, 0.02, 0xf5d442, 0, 0.07, -0.08));     // front sight
  return -0.22;
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const geom = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  return m;
}

function disposeRecursive(o: THREE.Object3D) {
  o.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
