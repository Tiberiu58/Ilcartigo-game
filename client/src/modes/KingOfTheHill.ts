/**
 * King of the Hill (KOTH) — solo zone-control mode.
 *
 * The classic objective loop arena shooters live on: a glowing capture zone (the
 * "hill") sits on the map; stand inside it — alone — to bank control points
 * toward YOUR score. If only enemies are inside, they bank toward the ENEMY
 * score; if both sides are inside it's CONTESTED and nobody scores. First side to
 * the goal wins → a results card (a natural ad breakpoint). The hill periodically
 * RELOCATES to a fresh spot, forcing map movement and a constant fight for
 * position — the "constant desire to win the next duel" pillar made spatial.
 *
 * Why this is low-risk + self-contained (mirrors the Onslaught/Duel pattern):
 *   - SOLO only. No protocol / server / controller changes. KOTH is a normal
 *     combat mode (`isCombatMode('koth')` is true), so the base bot roster runs,
 *     bots + player respawn on the usual loops, and every frag flows through the
 *     existing kill bus (XP, mastery, killfeed, announcer all "just work").
 *   - The zone is the ONLY new state: a render marker added to the scene + a
 *     score tally this controller owns. It never touches damage, networking, or
 *     the movement controllers.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) for the
 * scoring + relocation + zone animation. The controller subscribes to the `kill`
 * bus only to tally this run's eliminations for the results card.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';

const GOAL = 100;            // points to win
const SCORE_RATE = 7;        // points/sec for uncontested control (~14s clean cap)
const RELOCATE_SEC = 22;     // the hill jumps to a fresh spot this often (banked
                             // score persists, so a clean hold can win a zone;
                             // contesting enemies are what stretch a match out)
const HILL_RADIUS = 5;       // capture radius (metres, horizontal)
const VERT_TOL = 3.0;        // vertical tolerance so slightly-raised ground counts
const BEST_KEY = 'ilc.koth.best';    // fastest win time (seconds)
const WINS_KEY = 'ilc.koth.wins';    // lifetime KOTH wins (menu badge)

/** Who currently controls the hill this frame. */
export type HillControl = 'neutral' | 'you' | 'enemy' | 'contested';

export interface KothResult {
  won: boolean;
  yourScore: number;     // 0..GOAL
  enemyScore: number;    // 0..GOAL
  kills: number;         // your eliminations this run
  timeSec: number;       // match length
  xpEarned: number;      // bonus XP banked this run
  isNewBest: boolean;    // fastest win record (only meaningful on a win)
}

type Phase = 'idle' | 'fighting' | 'over';

export class KingOfTheHill {
  private game: Game;
  private unsub: (() => void) | null = null;

  active = false;
  private phase: Phase = 'idle';

  private yourScore = 0;
  private enemyScore = 0;
  private kills = 0;
  private runXp = 0;
  private elapsed = 0;
  private relocateTimer = 0;
  private control: HillControl = 'neutral';

  // Zone state.
  private center = new THREE.Vector3(0, 0.5, 0);
  private group: THREE.Group | null = null;
  private mats: THREE.Material[] = [];
  private wallMat: THREE.MeshBasicMaterial | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private spin = 0;
  private pulse = 0;

  /** HUD ticker: your score, enemy score, goal, current control state. */
  onState?: (your: number, enemy: number, goal: number, control: HillControl) => void;
  /** Control flipped to a new owner — drives a center-screen capture banner. */
  onControlChange?: (control: HillControl) => void;
  /** The hill relocated — drives a "ZONE RELOCATED" flash. */
  onZoneMove?: () => void;
  /** Run ended (someone hit the goal) — drives the results card. */
  onEnd?: (result: KothResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a fresh round (also used by "Play Again"). */
  start() {
    if (!this.unsub) {
      this.unsub = this.game.bus.on('kill', (e) => {
        if (!this.active) return;
        if (e.attackerId !== e.targetId && this.game.isLocalPlayer(e.attackerId)) this.kills++;
      });
    }
    this.active = true;
    this.phase = 'fighting';
    this.yourScore = 0;
    this.enemyScore = 0;
    this.kills = 0;
    this.runXp = 0;
    this.elapsed = 0;
    this.relocateTimer = RELOCATE_SEC;
    this.control = 'neutral';
    this.game.matchEnded = false;

    this.buildZone();
    this.center.copy(this.pickAnchor(null));
    this.syncZonePos();
    this.emitState();
  }

  /** End the round + tear down. Called on quit-to-menu / mode switch. */
  stop() {
    this.active = false;
    this.phase = 'idle';
    this.unsub?.();
    this.unsub = null;
    this.disposeZone();
  }

  update(dt: number) {
    if (!this.active) return;

    // Animate the marker regardless of phase (so it spins on the results card too).
    if (this.group) {
      this.spin += dt;
      this.pulse += dt;
      this.group.rotation.y = this.spin * 0.6;
      const p = 0.5 + Math.sin(this.pulse * 3) * 0.12;
      if (this.wallMat) this.wallMat.opacity = 0.16 + p * 0.12;
      if (this.beamMat) this.beamMat.opacity = 0.22 + p * 0.16;
    }

    if (this.phase !== 'fighting') return;

    this.elapsed += dt;

    // Relocate the hill on a timer — forces a fresh fight for position.
    this.relocateTimer -= dt;
    if (this.relocateTimer <= 0) {
      this.relocateTimer = RELOCATE_SEC;
      this.center.copy(this.pickAnchor(this.center));
      this.syncZonePos();
      this.setControl('neutral', false);   // a moved zone starts uncontested
      this.onZoneMove?.();
    }

    // Occupancy: is the (living) player inside? Is any (living) bot inside?
    const playerInside = !this.game.playerActor.health.dead && this.inside(this.game.player.pos);
    let enemyInside = false;
    for (const b of this.game.bots) {
      if (!b.active || b.health.dead) continue;
      if (this.inside(b.group.position)) { enemyInside = true; break; }
    }

    // Resolve control + bank points.
    let control: HillControl;
    if (playerInside && enemyInside) control = 'contested';
    else if (playerInside) control = 'you';
    else if (enemyInside) control = 'enemy';
    else control = 'neutral';
    this.setControl(control, true);

    if (control === 'you') this.yourScore = Math.min(GOAL, this.yourScore + SCORE_RATE * dt);
    else if (control === 'enemy') this.enemyScore = Math.min(GOAL, this.enemyScore + SCORE_RATE * dt);

    this.emitState();

    if (this.yourScore >= GOAL) this.endRun(true);
    else if (this.enemyScore >= GOAL) this.endRun(false);
  }

  /** Zone descriptor for the minimap (world x/z, radius, current control). */
  zoneInfo(): { x: number; z: number; radius: number; control: HillControl } | null {
    if (!this.active) return null;
    return { x: this.center.x, z: this.center.z, radius: HILL_RADIUS, control: this.control };
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private inside(p: THREE.Vector3): boolean {
    const dx = p.x - this.center.x;
    const dz = p.z - this.center.z;
    if (dx * dx + dz * dz > HILL_RADIUS * HILL_RADIUS) return false;
    return Math.abs(p.y - this.center.y) <= VERT_TOL;
  }

  private setControl(c: HillControl, notify: boolean) {
    if (c === this.control) return;
    this.control = c;
    this.recolor();
    // Only announce a genuine takeover (you/enemy) — neutral/contested are quiet.
    if (notify && (c === 'you' || c === 'enemy')) this.onControlChange?.(c);
  }

  private endRun(won: boolean) {
    this.phase = 'over';
    this.game.matchEnded = true;

    // Completion bonus on top of the per-kill XP already banked during the run.
    const bonus = won ? 120 : 30;
    this.game.account.awardXP(bonus);
    this.runXp += bonus;

    const timeSec = this.elapsed;
    let isNewBest = false;
    if (won) {
      const prevWins = Number(localStorage.getItem(WINS_KEY) ?? 0);
      localStorage.setItem(WINS_KEY, String(prevWins + 1));
      const prevBest = Number(localStorage.getItem(BEST_KEY) ?? 0);
      isNewBest = prevBest === 0 || timeSec < prevBest;
      if (isNewBest) localStorage.setItem(BEST_KEY, String(Math.round(timeSec)));
    }

    this.onEnd?.({
      won,
      yourScore: Math.round(this.yourScore),
      enemyScore: Math.round(this.enemyScore),
      kills: this.kills,
      timeSec,
      xpEarned: this.runXp,
      isNewBest,
    });
  }

  private emitState() {
    this.onState?.(Math.floor(this.yourScore), Math.floor(this.enemyScore), GOAL, this.control);
  }

  // ─── zone placement ───────────────────────────────────────────────────────

  /** True if x/z sits clear of any tall static solid (same test as power-ups). */
  private clearOf(x: number, z: number): boolean {
    for (const s of this.game.world.staticSolids) {
      if (s.max.y <= 0.6) continue;               // floor/ground boxes don't block
      if (x > s.min.x - 0.5 && x < s.max.x + 0.5 &&
          z > s.min.z - 0.5 && z < s.max.z + 0.5) return false;
    }
    return true;
  }

  /**
   * Candidate hill anchors: the map centre plus each FFA spawn pulled toward
   * centre (contested space), filtered to clear ground. Derived fresh each pick
   * so a map change is picked up automatically.
   */
  private candidates(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const spawns = this.game.mapSpawns;
    const yRef = spawns.length ? spawns[0].y : 0.5;
    if (this.clearOf(0, 0)) out.push(new THREE.Vector3(0, yRef, 0));   // centre
    for (const s of spawns) {
      const x = s.x * 0.5, z = s.z * 0.5;             // half-way to centre
      if (this.clearOf(x, z)) out.push(new THREE.Vector3(x, s.y, z));
    }
    // Fallback: if everything got filtered (shouldn't happen), use raw spawns.
    if (out.length === 0) for (const s of spawns) out.push(s.clone());
    return out;
  }

  /** Pick the next hill anchor — the candidate FARTHEST from `avoid` (so the
   *  zone visibly travels), or a random one on the first placement. */
  private pickAnchor(avoid: THREE.Vector3 | null): THREE.Vector3 {
    const cands = this.candidates();
    if (cands.length === 0) return new THREE.Vector3(0, 0.5, 0);
    if (!avoid) return cands[Math.floor(Math.random() * cands.length)];
    let best = cands[0], bestD = -Infinity;
    for (const c of cands) {
      const d = (c.x - avoid.x) ** 2 + (c.z - avoid.z) ** 2;
      if (d > bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // ─── zone visual ──────────────────────────────────────────────────────────

  private buildZone() {
    if (this.group) return;
    const g = new THREE.Group();

    // Translucent capture cylinder (open-ended walls).
    this.wallMat = new THREE.MeshBasicMaterial({
      color: 0xdfe7ff, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(HILL_RADIUS, HILL_RADIUS, 3.6, 40, 1, true),
      this.wallMat,
    );
    wall.position.y = 1.8;
    g.add(wall);

    // Bright ground ring marking the footprint.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xdfe7ff, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(HILL_RADIUS - 0.35, HILL_RADIUS, 48),
      this.ringMat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    // A central beam pillar so the objective reads from across the map.
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xdfe7ff, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 6, 16, 1, true),
      this.beamMat,
    );
    beam.position.y = 3;
    g.add(beam);

    this.mats = [this.wallMat, this.ringMat, this.beamMat];
    this.group = g;
    this.game.scene.add(g);
    this.recolor();
  }

  private syncZonePos() {
    if (this.group) this.group.position.set(this.center.x, this.center.y - 0.5, this.center.z);
  }

  private recolor() {
    const color = this.controlColor();
    for (const m of this.mats) (m as THREE.MeshBasicMaterial).color.setHex(color);
  }

  private controlColor(): number {
    switch (this.control) {
      case 'you': return 0x39e0a0;       // teal-green
      case 'enemy': return 0xff4d4d;     // red
      case 'contested': return 0xffc23a; // amber
      default: return 0xdfe7ff;          // neutral white-blue
    }
  }

  private disposeZone() {
    if (!this.group) return;
    this.game.scene.remove(this.group);
    this.group.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.mats = [];
    this.wallMat = this.ringMat = this.beamMat = null;
    this.group = null;
  }

  /** Lifetime KOTH wins (for the menu button badge). */
  static wins(): number {
    return Number(localStorage.getItem(WINS_KEY) ?? 0);
  }
  /** Fastest win time in seconds (0 = none yet). */
  static bestTime(): number {
    return Number(localStorage.getItem(BEST_KEY) ?? 0);
  }
}
