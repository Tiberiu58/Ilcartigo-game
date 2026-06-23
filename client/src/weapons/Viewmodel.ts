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
import { getWeaponModel, modelMuzzleZ, onModelReady } from './WeaponModels';

const SWAP_DURATION = 0.32;       // total time gun is offscreen during swap
const SWAP_DROP = 0.35;           // y-offset at full swap
const MELEE_ANIM = 0.22;          // melee swing duration (seconds)
const INSPECT_ANIM = 1.45;        // weapon-inspect twirl duration (seconds)

export class Viewmodel {
  readonly group: THREE.Group;
  private content: THREE.Group;      // child group that holds current weapon meshes
  private muzzleAnchor: THREE.Object3D;
  private flashMesh: THREE.Mesh;
  private flashTime = 0;

  private currentId: WeaponId = 'ar';
  private bobPhase = 0;
  private recoilOffset = 0;
  // Melee swing animation timer (seconds remaining). 0 = idle.
  private meleeTime = 0;
  // Weapon-inspect twirl timer (seconds remaining). 0 = idle.
  private inspectTime = 0;
  private restPos = new THREE.Vector3(0.32, -0.28, -0.55);
  private restRot = new THREE.Euler(0, Math.PI, 0); // -Z forward

  // Swap animation: -1 = stable, 0..1 = animating (0=start, 1=done).
  private swapPhase = -1;
  private swapPending: WeaponId | null = null;

  // Hidden flag — sniper scope hides the viewmodel completely.
  private hidden = false;

  // True when the current content is a loaded FBX model (vs the box fallback).
  // Tint is skipped for FBX (no single "body box" to recolour); finish +
  // cloak opacity still traverse the whole tree so they work either way.
  private usingModel = false;

  // Per-weapon body tint (equipped weapon skin). Applied to the body mesh after
  // each (re)build so it survives weapon swaps. Undefined = stock look.
  private skinTints: Partial<Record<WeaponId, number>> = {};
  // Equipped weapon-finish emissive tint (Phase 14C cosmetic). Re-applied after
  // every geometry rebuild (swap) so the finish persists across weapons.
  private finishEmissive = 0x000000;

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

    // When a weapon's FBX model finishes loading, rebuild if it's the one
    // currently held (and we're not mid-swap) so the box is replaced live.
    onModelReady((id) => {
      if (id === this.currentId && this.swapPhase < 0) this.buildFor(id);
    });

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

  /**
   * Set the weapon-finish emissive tint (cosmetic). Stored + applied to every
   * content mesh; re-applied automatically on each weapon rebuild so the finish
   * follows you across swaps. 0x000000 = no glow (Standard).
   */
  setFinish(emissive: number) {
    this.finishEmissive = emissive;
    this.applyFinish();
  }

  private applyFinish() {
    this.content.traverse((n) => {
      const mat = (n as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (mat && mat.emissive) mat.emissive.setHex(this.finishEmissive);
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
    this.inspectTime = 0;            // a swap cancels any inspect twirl
    this.swapPending = id;
    this.swapPhase = 0;
  }

  /** Call on fire — triggers flash + visual kick. No-op while swapping. */
  onFire() {
    if (this.swapPhase >= 0 || this.hidden) return;
    this.inspectTime = 0;            // firing snaps the gun back to combat
    this.flashTime = 0.06;
    this.recoilOffset = 0.05;
  }

  /** Call on melee — triggers a quick slash swing. No-op while swapping. */
  meleeSwing() {
    if (this.swapPhase >= 0 || this.hidden) return;
    this.inspectTime = 0;
    this.meleeTime = MELEE_ANIM;
  }

  /**
   * Trigger the weapon-inspect twirl — a quick "show off the gun" flourish that
   * rotates + pulls the model toward the camera and settles back to rest. Lets
   * players admire the skin/finish they just unlocked (a Krunker staple). No-op
   * while swapping, scoped (hidden), or already inspecting; cancelled instantly
   * by firing/melee/swap so it never interferes with combat.
   */
  inspect() {
    if (this.swapPhase >= 0 || this.hidden || this.inspectTime > 0) return;
    this.inspectTime = INSPECT_ANIM;
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

    // Melee swing — a quick down-left arc that returns to rest.
    let meleeX = 0, meleeY = 0, meleeRotZ = 0;
    if (this.meleeTime > 0) {
      this.meleeTime = Math.max(0, this.meleeTime - dt);
      const arc = Math.sin((1 - this.meleeTime / MELEE_ANIM) * Math.PI);
      meleeX = -arc * 0.10;
      meleeY = -arc * 0.05;
      meleeRotZ = -arc * 0.9;
    }

    // Inspect twirl — pulls the gun toward the camera and rotates it to show
    // off, easing in and back out. All offsets are additive on top of rest.
    let inX = 0, inY = 0, inZ = 0, inRotX = 0, inRotY = 0, inRotZ = 0;
    if (this.inspectTime > 0) {
      this.inspectTime = Math.max(0, this.inspectTime - dt);
      const p = 1 - this.inspectTime / INSPECT_ANIM;   // 0..1 over the anim
      const ease = Math.sin(p * Math.PI);               // raise + settle bell curve
      inRotY = ease * 0.95;
      inRotX = ease * -0.32;
      inRotZ = ease * 0.55;
      inZ = ease * 0.14;
      inY = ease * 0.05;
      inX = -ease * 0.05;
    }

    this.group.position.set(
      this.restPos.x + bobX + meleeX + inX,
      this.restPos.y - bobY - swapDip + meleeY + inY,
      this.restPos.z + this.recoilOffset + inZ,
    );
    // Compose rest + melee roll + inspect twirl (idle = restRot, a no-op when
    // neither animation is active).
    this.group.rotation.set(
      this.restRot.x + inRotX,
      this.restRot.y + inRotY,
      this.restRot.z + meleeRotZ + inRotZ,
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

    // Prefer a loaded FBX model; fall back to the procedural box builder if the
    // model has no def, isn't loaded yet, or failed (kicks off the load on a
    // miss → onModelReady rebuilds us when it lands).
    const model = getWeaponModel(id);
    let muzzleZ: number;
    if (model) {
      this.content.add(model);
      this.usingModel = true;
      muzzleZ = modelMuzzleZ(id) ?? -0.5;
    } else {
      // Each helper adds meshes to content and returns the muzzle z-offset.
      muzzleZ = WEAPON_BUILDERS[id](this.content);
      this.usingModel = false;
    }
    this.muzzleAnchor.position.set(0, 0.02, muzzleZ);
    this.flashMesh.position.copy(this.muzzleAnchor.position);
    // Re-apply cosmetics to the freshly-built meshes: skin tint (body colour)
    // and finish (emissive sheen). Both survive weapon swaps this way.
    this.applyTint();
    this.applyFinish();
  }

  /**
   * Set the equipped weapon-skin tints (weaponId → body colour). Re-applies to
   * the currently-built weapon immediately so equipping a skin in the menu
   * shows on the held gun without a swap.
   */
  setSkinTints(tints: Partial<Record<WeaponId, number>>) {
    this.skinTints = { ...tints };
    this.applyTint();
  }

  /** Tint the body mesh (first child = the largest box in every builder) to the
   *  current weapon's equipped skin colour, or leave it stock if none.
   *  No-op for FBX models — they have no single "body box" child, so a skin
   *  tint would garble the import. (Finish emissive still applies tree-wide.) */
  private applyTint() {
    if (this.usingModel) return;
    const body = this.content.children[0] as THREE.Mesh | undefined;
    if (!body) return;
    const mat = body.material as THREE.MeshLambertMaterial | undefined;
    if (!mat || !('color' in mat)) return;
    const tint = this.skinTints[this.currentId];
    if (tint !== undefined) mat.color.setHex(tint);
    // No "else reset" needed — buildFor always rebuilds fresh stock materials
    // before applyTint runs, so the default look is whatever the builder set.
  }
}

/** Map of weapon id → builder. Each builder adds meshes to the parent and returns muzzle z. */
const WEAPON_BUILDERS: Record<WeaponId, (parent: THREE.Group) => number> = {
  ar: buildAR,
  smg: buildSMG,
  sniper: buildSniper,
  shotgun: buildShotgun,
  marksman: buildMarksman,
  lmg: buildLMG,
  railgun: buildRailgun,
  handcannon: buildHandCannon,
  pistol: buildPistol,
};

function buildHandCannon(p: THREE.Group): number {
  p.add(box(0.12, 0.12, 0.24, 0x2a2f38, 0, 0, 0));            // chunky frame
  p.add(box(0.06, 0.06, 0.30, 0x14171c, 0, 0.02, -0.22));     // long heavy barrel
  p.add(box(0.10, 0.10, 0.10, 0x3a424d, 0, 0.0, 0.02));       // cylinder (revolver)
  p.add(box(0.105, 0.105, 0.02, 0x55606c, 0, 0.0, -0.04));    // cylinder face ring
  p.add(box(0.09, 0.18, 0.11, 0x232931, 0.0, -0.14, 0.08));   // grip
  p.add(box(0.04, 0.05, 0.04, 0x18181d, 0, 0.085, 0.10));     // hammer
  p.add(box(0.02, 0.04, 0.02, 0xf5d442, 0, 0.09, -0.34));     // front sight
  p.add(box(0.05, 0.04, 0.10, 0x14171c, 0, -0.06, -0.12));    // underlug
  return -0.40;
}

function buildRailgun(p: THREE.Group): number {
  p.add(box(0.15, 0.13, 0.46, 0x202a36, 0, 0, 0));            // sleek body (steel-blue)
  p.add(box(0.10, 0.10, 0.26, 0x2c3a48, 0, -0.02, 0.30));     // stock
  p.add(box(0.055, 0.055, 0.78, 0x0c1016, 0, 0.03, -0.52));   // long rail barrel
  // Accelerator coils — bright cyan rings along the barrel (emissive accent).
  p.add(box(0.10, 0.10, 0.04, 0x1ad0ff, 0, 0.03, -0.34));
  p.add(box(0.10, 0.10, 0.04, 0x1ad0ff, 0, 0.03, -0.52));
  p.add(box(0.10, 0.10, 0.04, 0x1ad0ff, 0, 0.03, -0.70));
  p.add(box(0.10, 0.05, 0.20, 0x14181f, 0, 0.10, -0.04));     // top housing
  p.add(box(0.07, 0.14, 0.09, 0x1c242c, 0, -0.12, 0.18));     // grip
  p.add(box(0.08, 0.15, 0.10, 0x1c242c, 0, -0.13, 0.02));     // power cell
  p.add(box(0.05, 0.05, 0.06, 0x1ad0ff, 0, 0.03, -0.92));     // muzzle emitter (cyan)
  return -0.94;
}

function buildLMG(p: THREE.Group): number {
  p.add(box(0.18, 0.14, 0.50, 0x2a2f36, 0, 0, 0));            // bulky body
  p.add(box(0.11, 0.11, 0.24, 0x3a434d, 0, -0.02, 0.32));     // stock
  p.add(box(0.06, 0.06, 0.62, 0x141821, 0, 0.02, -0.46));     // heavy barrel
  p.add(box(0.05, 0.05, 0.30, 0x0e1116, 0, 0.02, -0.74));     // barrel shroud tip
  p.add(box(0.16, 0.20, 0.14, 0x232931, 0, -0.15, 0.06));     // box magazine (drum-ish)
  p.add(box(0.08, 0.14, 0.10, 0x232931, 0, -0.12, 0.20));     // grip
  p.add(box(0.10, 0.05, 0.18, 0x18181d, 0, 0.10, -0.10));     // top rail
  p.add(box(0.02, 0.06, 0.02, 0xf5d442, 0, 0.14, -0.24));     // front sight
  p.add(box(0.16, 0.03, 0.10, 0x2a2f36, 0, -0.09, -0.30));    // bipod folded
  return -0.78;
}

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
