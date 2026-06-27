/**
 * King of the Hill — solo zone-control mode ("hold the hill").
 *
 * The classic objective format arena shooters live on: a glowing zone sits on
 * the map and whoever stands in it ALONE banks control time. You vs the bots —
 * first side to reach the target hold time wins. The hill relocates every ~30 s
 * so you can't just camp one spot; the bots are lured to contest it. Ends on a
 * results card (a natural ad breakpoint) with your longest single hold + a
 * persistent best.
 *
 * Why it's low-risk + self-contained:
 *   - Runs as a COMBAT mode (`'koth'` ∈ isCombatMode) — the base 3-bot roster,
 *     normal kills/XP/announcer/respawn all "just work", no special-casing.
 *   - SOLO only. No protocol / server / controller changes.
 *   - Bots contest the zone via one additive `Bot.lurePoint` field (null in
 *     every other mode → patrol behaviour unchanged).
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt).
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import { ObjectiveMarker } from '../ui/ObjectiveMarker';

const HILL_RADIUS = 5.0;          // metres; control radius (XZ)
const TARGET_SECONDS = 60;        // control time to win (or lose, if the bots reach it)
const RELOCATE_SECONDS = 30;      // the hill moves this often
const PB_KEY = 'ilc.koth.bestHold';

/** Who controls the hill this frame. */
export type HillControl = 'you' | 'enemy' | 'contested' | 'empty';

const CONTROL_COLOR: Record<HillControl, number> = {
  you:       0x35d0c4, // teal — you hold it solo
  enemy:     0xff5a52, // red — the bots hold it
  contested: 0xffc24a, // gold — both inside, nobody scores
  empty:     0x88a0b8, // cool grey-blue — uncontested
};

/** CSS colour strings for the on-screen marker, mirroring CONTROL_COLOR. */
const MARKER_COLOR: Record<HillControl, string> = {
  you: '#35d0c4', enemy: '#ff5a52', contested: '#ffc24a', empty: '#9fb0c6',
};

export interface KothResult {
  won: boolean;
  youHeld: number;       // total seconds you controlled
  enemyHeld: number;     // total seconds the bots controlled
  longestHold: number;   // best single uninterrupted hold this run
  kills: number;         // frags this run
  best: number;          // persistent longest-hold record AFTER this run
  isNewBest: boolean;
  xpEarned: number;
}

export class KingOfTheHill {
  private game: Game;
  private unsub: (() => void) | null = null;

  active = false;
  private center = new THREE.Vector3(0, 0, 0);
  private anchors: THREE.Vector3[] = [];
  private anchorIdx = 0;

  private youHeld = 0;
  private enemyHeld = 0;
  private currentHold = 0;     // your current uninterrupted hold streak
  private longestHold = 0;
  private kills = 0;
  private relocateTimer = 0;
  private control: HillControl = 'empty';
  private ended = false;

  // Visual: a flat ring + a translucent light pillar, recoloured by control.
  private group: THREE.Group | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private pillarMat: THREE.MeshBasicMaterial | null = null;
  private spin = 0;

  /** On-screen "find the hill" indicator (pip / edge arrow). */
  private marker: ObjectiveMarker | null = null;

  /** HUD ticker: your hold, enemy hold, target, who controls it now. */
  onState?: (youSec: number, enemySec: number, target: number, control: HillControl) => void;
  /** Fired when the hill moves — drives a center-screen "HILL MOVED" banner. */
  onRelocate?: () => void;
  /** Fired when the run ends — drives the results card. */
  onEnd?: (result: KothResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  start() {
    if (!this.unsub) {
      this.unsub = this.game.bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
    }
    this.active = true;
    this.ended = false;
    this.youHeld = 0;
    this.enemyHeld = 0;
    this.currentHold = 0;
    this.longestHold = 0;
    this.kills = 0;
    this.control = 'empty';
    this.spin = 0;

    // Candidate hill positions: this map's FFA spawn anchors (known clear of
    // geometry), spread out so successive hills aren't adjacent.
    const raw = this.game.mapAnchors();
    this.anchors = raw.length
      ? raw.map((v) => new THREE.Vector3(v.x, 0, v.z))
      : [new THREE.Vector3(0, 0, 0)];
    this.anchorIdx = Math.floor(this.anchors.length / 2) % this.anchors.length;

    this.buildVisual();
    if (!this.marker) this.marker = new ObjectiveMarker(() => new THREE.Vector3());
    this.placeHill(this.anchorIdx, false);
    this.relocateTimer = RELOCATE_SECONDS;
    this.emitState();
  }

  stop() {
    this.active = false;
    this.unsub?.();
    this.unsub = null;
    this.game.setBotLure(null);
    this.marker?.hide();
    this.disposeVisual();
  }

  /** Live hill state for HUD overlays (minimap circle). null when inactive. */
  hillInfo(): { x: number; z: number; radius: number; control: HillControl } | null {
    if (!this.active || this.ended) return null;
    return { x: this.center.x, z: this.center.z, radius: HILL_RADIUS, control: this.control };
  }

  update(dt: number) {
    if (!this.active || this.ended) return;

    // Spin/pulse the visual.
    this.spin += dt;
    if (this.group) this.group.rotation.y = this.spin * 0.5;

    // Relocation.
    this.relocateTimer -= dt;
    if (this.relocateTimer <= 0) {
      this.relocateTimer = RELOCATE_SECONDS;
      this.anchorIdx = (this.anchorIdx + 1 + Math.floor(Math.random() * (this.anchors.length - 1))) % this.anchors.length;
      this.placeHill(this.anchorIdx, true);
      this.currentHold = 0; // you must re-take the new ground
      this.onRelocate?.();
    }

    // Determine control.
    const next = this.computeControl();
    if (next !== this.control) {
      this.control = next;
      this.recolor(next);
    }

    if (next === 'you') {
      this.youHeld += dt;
      this.currentHold += dt;
      if (this.currentHold > this.longestHold) this.longestHold = this.currentHold;
    } else {
      this.currentHold = 0;
      if (next === 'enemy') this.enemyHeld += dt;
    }

    // On-screen objective indicator (pip / edge arrow), tinted by control.
    this.marker?.update(this.center, this.game.camera, MARKER_COLOR[next]);

    // Win / lose.
    if (this.youHeld >= TARGET_SECONDS) this.endRun(true);
    else if (this.enemyHeld >= TARGET_SECONDS) this.endRun(false);

    this.emitState();
  }

  /** Who's standing in the hill (alone) this frame. */
  private computeControl(): HillControl {
    const r2 = HILL_RADIUS * HILL_RADIUS;
    const youIn = !this.game.playerActor.health.dead && this.inHill(this.game.player.pos, r2);
    let enemyIn = false;
    for (const b of this.game.bots) {
      if (!b.active || b.health.dead) continue;
      if (this.inHill(b.group.position, r2)) { enemyIn = true; break; }
    }
    if (youIn && !enemyIn) return 'you';
    if (!youIn && enemyIn) return 'enemy';
    if (youIn && enemyIn) return 'contested';
    return 'empty';
  }

  private inHill(p: THREE.Vector3, r2: number): boolean {
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    return dx * dx + dz * dz <= r2;
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.active || this.ended) return;
    if (attackerId !== targetId && this.game.isLocalPlayer(attackerId)) this.kills++;
  }

  private placeHill(idx: number, announce: boolean) {
    const a = this.anchors[idx];
    this.center.set(a.x, 0, a.z);
    if (this.group) this.group.position.set(a.x, 0, a.z);
    // Re-point the bots at the (shared) hill centre so they contest it.
    this.game.setBotLure(this.center);
    if (announce) this.game.audio.play('jump_pad', 0.6);
  }

  private endRun(won: boolean) {
    this.ended = true;
    this.game.setBotLure(null);

    const prevBest = Number(localStorage.getItem(PB_KEY) ?? 0);
    const isNewBest = this.longestHold > prevBest;
    if (isNewBest) localStorage.setItem(PB_KEY, String(Math.round(this.longestHold)));

    const xp = won ? 120 + Math.floor(this.youHeld) : Math.floor(this.youHeld * 0.5);
    if (xp > 0) this.game.account.awardXP(xp);

    this.game.audio.play('match_end');
    this.onEnd?.({
      won,
      youHeld: this.youHeld,
      enemyHeld: this.enemyHeld,
      longestHold: this.longestHold,
      kills: this.kills,
      best: Math.max(prevBest, Math.round(this.longestHold)),
      isNewBest,
      xpEarned: xp,
    });
  }

  private emitState() {
    this.onState?.(this.youHeld, this.enemyHeld, TARGET_SECONDS, this.control);
  }

  // ── visual ─────────────────────────────────────────────────────────────────

  private buildVisual() {
    if (this.group) return;
    const g = new THREE.Group();

    // Flat ground ring (annulus) lying on the floor.
    const ringGeo = new THREE.RingGeometry(HILL_RADIUS - 0.35, HILL_RADIUS + 0.15, 48);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: CONTROL_COLOR.empty, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    // Translucent light pillar marking the volume.
    const pillarGeo = new THREE.CylinderGeometry(HILL_RADIUS, HILL_RADIUS, 4.0, 36, 1, true);
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: CONTROL_COLOR.empty, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeo, this.pillarMat);
    pillar.position.y = 2.0;
    g.add(pillar);

    this.group = g;
    this.game.scene.add(g);
  }

  private recolor(c: HillControl) {
    const col = CONTROL_COLOR[c];
    this.ringMat?.color.setHex(col);
    this.pillarMat?.color.setHex(col);
    if (this.pillarMat) this.pillarMat.opacity = c === 'contested' ? 0.16 : 0.1;
  }

  private disposeVisual() {
    if (!this.group) return;
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.ringMat?.dispose();
    this.pillarMat?.dispose();
    this.group = null;
    this.ringMat = null;
    this.pillarMat = null;
  }

  /** Persistent longest-hold record (for menu/profile display). */
  static personalBest(): number {
    return Number(localStorage.getItem(PB_KEY) ?? 0);
  }
}
