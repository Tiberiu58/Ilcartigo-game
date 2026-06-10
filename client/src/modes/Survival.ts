/**
 * Survival — the wave-based "horde" mode (a la Krunker's Zombies / CoD Survival).
 *
 * You vs an endless, escalating horde of bots. Clear a wave to earn a short
 * breather, then a bigger, nastier wave drops in. You have ONE life — die and
 * it's game over, with a score = kills*100 + wavesCleared*500 and a persisted
 * personal best. Pure score-chase: "how far can you get?".
 *
 * Why this mode fits the engine perfectly: the existing Bot AI *only ever
 * targets the player*, which is exactly the horde fantasy — no bot-vs-bot AI
 * work needed. Fully client-side, solo, self-contained, no protocol/MP changes.
 *
 * Decoupled like GunGame: the only engine surfaces it touches are the event bus
 * (kills), and a small `SurvivalHost` adapter (spawn/remove bots, spawn points,
 * player position, sound). Wired to the HUD ticker + wave banner + game-over
 * card by main.ts.
 */

import type { GameEventBus } from '../core/events';
import type { BotDifficulty } from '../entities/Bot';

/** The engine surface Survival needs. Keeps the mode testable + decoupled. */
export interface SurvivalHost {
  isLocalPlayer(id: string): boolean;
  /** Spawn a horde bot, returning its id. */
  spawnBot(difficulty: BotDifficulty, x: number, y: number, z: number): string;
  /** Dispose + remove a bot by id. */
  removeBot(id: string): void;
  /** Candidate spawn points (map FFA spawns). */
  getSpawnPoints(): ReadonlyArray<{ x: number; y: number; z: number }>;
  /** Local player's current XZ position (for picking far-away spawns). */
  getPlayerPos(): { x: number; z: number };
  /** Fire a one-shot SFX (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

export interface SurvivalResult {
  wave: number;
  kills: number;
  score: number;
}

/** Max bots alive at once — keeps it brutal-but-fair and performant. */
const MAX_CONCURRENT = 8;
/** Telegraph before the first wave drops (ms) — lets the player orient. */
const FIRST_WAVE_DELAY = 2200;
/** Breather + telegraph between waves (ms). */
const BREATHER = 2800;
/** How long a corpse lingers before it's disposed (ms) — lets the fall animate. */
const CORPSE_LINGER = 2200;

export class Survival {
  private host: SurvivalHost;
  private unsub: (() => void) | null = null;

  /** Ids of currently-living horde bots. */
  private alive = new Set<string>();
  private wave = 0;
  private kills = 0;
  private wavesCleared = 0;
  private active = false;
  /** Pending timers (wave spawns, corpse disposals) — cancelled on stop. */
  private timers = new Set<ReturnType<typeof setTimeout>>();

  /** HUD ticker update: current wave, enemies remaining, score. */
  onStateChange?: (wave: number, enemies: number, score: number) => void;
  /** Center-screen banner (wave incoming / cleared). */
  onBanner?: (text: string, sub: string) => void;
  /** Fired once when the player dies — show the game-over card. */
  onGameOver?: (result: SurvivalResult) => void;

  constructor(bus: GameEventBus, host: SurvivalHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
  }

  /** Current score. */
  get score(): number {
    return this.kills * 100 + this.wavesCleared * 500;
  }

  /** Begin a fresh run from wave 1. */
  start() {
    this.stop();            // clear any prior bots/timers/state
    this.active = true;
    this.wave = 0;
    this.kills = 0;
    this.wavesCleared = 0;
    this.onStateChange?.(1, 0, 0);
    this.onBanner?.('WAVE 1', 'GET READY');
    this.queueWave(1, FIRST_WAVE_DELAY);
  }

  /** Tear everything down: cancel timers, dispose all live bots, go inactive.
   *  Safe to call repeatedly (quit, game-over, restart). */
  stop() {
    this.active = false;
    this.clearTimers();
    for (const id of this.alive) this.host.removeBot(id);
    this.alive.clear();
  }

  /** Unsubscribe from the bus (full teardown). */
  dispose() {
    this.stop();
    this.unsub?.();
    this.unsub = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private queueWave(n: number, delayMs: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (this.active) this.spawnWave(n);
    }, delayMs);
    this.timers.add(t);
  }

  private spawnWave(n: number) {
    this.wave = n;
    const count = Math.min(MAX_CONCURRENT, 2 + n);
    const spawns = this.pickSpawns(count);
    for (let i = 0; i < count; i++) {
      const s = spawns[i % spawns.length];
      const id = this.host.spawnBot(this.pickDifficulty(n), s.x, s.y, s.z);
      this.alive.add(id);
    }
    this.host.playSound('spawn_protect');
    this.onBanner?.(`WAVE ${n}`, 'FIGHT');
    this.onStateChange?.(n, this.alive.size, this.score);
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.active) return;

    // Player died → one life only → game over.
    if (this.host.isLocalPlayer(targetId)) {
      this.gameOver();
      return;
    }

    // A horde bot died (always at the player's hand — bots only target you).
    if (!this.alive.has(targetId)) return;
    this.alive.delete(targetId);
    if (this.host.isLocalPlayer(attackerId)) this.kills++;

    // Let the corpse fall, then dispose it.
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.host.removeBot(targetId);
    }, CORPSE_LINGER);
    this.timers.add(t);

    this.onStateChange?.(this.wave, this.alive.size, this.score);

    // Wave cleared → breather → next wave.
    if (this.alive.size === 0) {
      this.wavesCleared++;
      this.host.playSound('kill_feedback');
      this.onBanner?.(`WAVE ${this.wave} CLEARED`, '+500 · GET READY');
      this.onStateChange?.(this.wave, 0, this.score);
      this.queueWave(this.wave + 1, BREATHER);
    }
  }

  private gameOver() {
    if (!this.active) return;
    this.active = false;
    this.clearTimers();
    // Clear the arena — dispose remaining attackers for a clean game-over view.
    for (const id of this.alive) this.host.removeBot(id);
    this.alive.clear();
    this.host.playSound('match_end');
    this.onGameOver?.({ wave: this.wave, kills: this.kills, score: this.score });
  }

  /** Pick `count` spawn points, farthest-from-player first (cycled if needed). */
  private pickSpawns(count: number): Array<{ x: number; y: number; z: number }> {
    const all = this.host.getSpawnPoints();
    if (all.length === 0) return [{ x: 0, y: 0.5, z: 0 }];
    const p = this.host.getPlayerPos();
    const sorted = [...all].sort((a, b) => {
      const da = (a.x - p.x) ** 2 + (a.z - p.z) ** 2;
      const db = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
      return db - da;
    });
    return sorted.slice(0, Math.max(count, sorted.length));
  }

  /** Difficulty mix shifts from easy → predictive as the wave number climbs. */
  private pickDifficulty(n: number): BotDifficulty {
    const r = Math.random();
    if (n <= 1) return r < 0.75 ? 'wanderer' : 'engager';
    if (n <= 3) return r < 0.4 ? 'wanderer' : r < 0.8 ? 'engager' : 'predictor';
    if (n <= 5) return r < 0.2 ? 'wanderer' : r < 0.6 ? 'engager' : 'predictor';
    return r < 0.3 ? 'engager' : 'predictor';
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
