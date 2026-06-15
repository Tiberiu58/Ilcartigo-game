/**
 * Survival — "Last Stand", a wave-based horde mode (a la Krunker's Hordes /
 * CoD Zombies). SOLO vs bots, fully self-contained, no protocol / MP changes.
 *
 * Loop: clear a wave of bots → short intermission (a natural ad breakpoint) →
 * a bigger, harder wave. There is NO respawn — one death ends the run. You
 * chase a personal best (highest wave + score), which is the retention hook
 * that brings players back (and back = ad impressions).
 *
 * Like GunGame this is bus-driven and decoupled via a small `SurvivalHost`
 * interface — the only engine surfaces it touches are the kill bus + the host
 * (spawn/clear wave bots, heal the player, play SFX). The UI (HUD ticker,
 * intermission overlay, game-over card) is owned by main.ts via callbacks, so
 * this file stays pure logic + trivially testable.
 *
 * Timing of the inter-wave break is driven by the UI: we fire `onWaveCleared`
 * with a suggested intermission length, and main.ts calls `startNextWave()`
 * when its countdown ends (or the player clicks "Next wave"). That keeps the
 * "show an ad / let the player breathe" policy in the UI layer where it belongs.
 */

import type { GameEventBus } from '../core/events';
import type { BotDifficulty } from '../entities/Bot';

/** Seconds of breathing room between waves (UI countdown + ad breakpoint). */
export const INTERMISSION_SECONDS = 6;

/** Per-difficulty score awarded for a kill (tougher bot = more points). */
const KILL_SCORE: Record<BotDifficulty, number> = {
  wanderer: 100,
  engager: 150,
  predictor: 250,
};
/** Bonus points for a headshot kill. */
const HEADSHOT_BONUS = 75;

/** Max ms between kills to keep a combo alive. */
const COMBO_WINDOW_MS = 3000;

/**
 * Score multiplier for the current combo length (consecutive fast kills).
 * Rewards aggression — the core of the Survival score chase.
 */
export function comboMultiplier(combo: number): number {
  if (combo >= 12) return 4;
  if (combo >= 8) return 3;
  if (combo >= 5) return 2;
  if (combo >= 3) return 1.5;
  return 1;
}

/** The minimal surface Survival needs from the engine. Keeps it decoupled. */
export interface SurvivalHost {
  isLocalPlayer(id: string): boolean;
  /** Spawn one wave bot of the given difficulty; returns its id. */
  spawnBot(difficulty: BotDifficulty): string;
  /** Dispose all current wave bots. */
  clearWaveBots(): void;
  /** Heal the player by `fraction` of their max HP (0..1). */
  healPlayer(fraction: number): void;
  /** True while the player is alive (used to ignore stray late kill events). */
  playerAlive(): boolean;
  /** Fire a one-shot SFX by id (best-effort; silent if asset missing). */
  playSound(id: string): void;
}

/** Snapshot pushed to the HUD ticker on every change. */
export interface SurvivalHud {
  wave: number;
  score: number;
  enemiesRemaining: number;
  /** Current combo length (consecutive fast kills). */
  combo: number;
  /** Active score multiplier from the combo. */
  multiplier: number;
}

export class Survival {
  private host: SurvivalHost;
  private unsub: (() => void) | null = null;

  private running = false;
  private wave = 0;
  private score = 0;
  /** id → difficulty for the current wave's bots; presence means "still alive". */
  private waveBots = new Map<string, BotDifficulty>();
  /** Combo state — consecutive kills within COMBO_WINDOW_MS keep it building. */
  private combo = 0;
  private lastKillAt = 0;

  /** Per-frame HUD push (wave / score / enemies-left). */
  onHud?: (hud: SurvivalHud) => void;
  /** A new wave just spawned. */
  onWaveStart?: (wave: number, enemyCount: number) => void;
  /** A wave was cleared. UI runs the intermission countdown then calls
   *  startNextWave(). `bonus` was already added to the score. */
  onWaveCleared?: (wave: number, bonus: number, intermissionSeconds: number) => void;
  /** Fired on a kill that lands at multiplier > 1 — drives the combo flash. */
  onCombo?: (combo: number, multiplier: number) => void;
  /** The run ended (player died). */
  onGameOver?: (wave: number, score: number) => void;

  constructor(bus: GameEventBus, host: SurvivalHost) {
    this.host = host;
    this.unsub = bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId, e.isHeadshot));
  }

  /** Begin a fresh run from wave 1. */
  start() {
    this.running = true;
    this.wave = 0;
    this.score = 0;
    this.combo = 0;
    this.lastKillAt = 0;
    this.host.clearWaveBots();
    this.waveBots.clear();
    this.startNextWave();
  }

  /** Stop the run and clear any live wave bots (quit to menu / mode switch). */
  stop() {
    this.running = false;
    this.waveBots.clear();
    this.host.clearWaveBots();
  }

  dispose() {
    this.unsub?.();
    this.unsub = null;
  }

  get isRunning(): boolean { return this.running; }
  get currentWave(): number { return this.wave; }
  get currentScore(): number { return this.score; }

  /**
   * Spawn the next wave. Called at run start and by the UI when the
   * intermission countdown elapses. Escalates count + difficulty with the wave.
   */
  startNextWave() {
    if (!this.running) return;
    this.host.clearWaveBots();   // safety: drop any corpses from the prior wave
    this.waveBots.clear();
    this.wave++;

    const difficulties = waveComposition(this.wave);
    for (const d of difficulties) {
      const id = this.host.spawnBot(d);
      this.waveBots.set(id, d);
    }
    this.onWaveStart?.(this.wave, difficulties.length);
    this.pushHud();
  }

  private onKill(attackerId: string, targetId: string, isHeadshot: boolean) {
    if (!this.running) return;

    // Player died → run over.
    if (this.host.isLocalPlayer(targetId)) {
      this.gameOver();
      return;
    }

    // A wave bot died — only the player can kill them, but guard anyway.
    const difficulty = this.waveBots.get(targetId);
    if (!difficulty) return;
    if (!this.host.isLocalPlayer(attackerId)) return;

    this.waveBots.delete(targetId);

    // Combo: consecutive kills inside the window build a score multiplier.
    const now = Date.now();
    this.combo = (now - this.lastKillAt <= COMBO_WINDOW_MS) ? this.combo + 1 : 1;
    this.lastKillAt = now;
    const mult = comboMultiplier(this.combo);

    const base = KILL_SCORE[difficulty] + (isHeadshot ? HEADSHOT_BONUS : 0);
    this.score += Math.round(base * mult);
    if (mult > 1) this.onCombo?.(this.combo, mult);
    this.pushHud();

    if (this.waveBots.size === 0) this.waveCleared();
  }

  private waveCleared() {
    // Reward clearing: a wave bonus + a half-heal of breathing room.
    const bonus = this.wave * 250;
    this.score += bonus;
    // The intermission (6s) outlasts the combo window — reset so the next wave
    // starts fresh rather than inheriting a stale combo.
    this.combo = 0;
    this.host.healPlayer(0.5);
    this.host.playSound('wave_clear');
    this.pushHud();
    this.onWaveCleared?.(this.wave, bonus, INTERMISSION_SECONDS);
  }

  private gameOver() {
    if (!this.running) return;
    this.running = false;
    this.host.playSound('game_over');
    this.onGameOver?.(this.wave, this.score);
  }

  private pushHud() {
    this.onHud?.({
      wave: this.wave,
      score: this.score,
      enemiesRemaining: this.waveBots.size,
      combo: this.combo,
      multiplier: comboMultiplier(this.combo),
    });
  }
}

/**
 * The bot roster for a given wave: count grows, and the difficulty mix shifts
 * from harmless Wanderers toward lethal Predictors as the waves climb.
 */
export function waveComposition(wave: number): BotDifficulty[] {
  // Count: 3 on wave 1, +1 every wave, soft-capped so late waves stay playable
  // on one map's spawn points.
  const count = Math.min(3 + (wave - 1), 10);

  // Difficulty weights ramp with the wave.
  const out: BotDifficulty[] = [];
  for (let i = 0; i < count; i++) {
    // Distribute tiers: early waves mostly wanderers; mid add engagers; late
    // add predictors. Deterministic-ish spread using the index + wave.
    const roll = (i * 7 + wave * 3) % 10;
    let d: BotDifficulty;
    if (wave <= 2) {
      d = roll < 8 ? 'wanderer' : 'engager';
    } else if (wave <= 4) {
      d = roll < 4 ? 'wanderer' : roll < 8 ? 'engager' : 'predictor';
    } else if (wave <= 7) {
      d = roll < 2 ? 'wanderer' : roll < 6 ? 'engager' : 'predictor';
    } else {
      d = roll < 4 ? 'engager' : 'predictor';
    }
    out.push(d);
  }
  return out;
}
