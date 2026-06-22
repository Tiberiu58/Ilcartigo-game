/**
 * Onslaught — solo wave-survival mode ("how long can you last?").
 *
 * The most addictive high-score loop in arena shooters: endless waves of bots,
 * each bigger and meaner than the last. You have a small pool of LIVES; clearing
 * a wave fully heals you and banks escalating XP. Run ends when the lives run
 * out → a results card (a natural ad breakpoint) showing the wave you reached,
 * total frags, and your persistent personal best.
 *
 * Why this is low-risk + self-contained:
 *   - SOLO only. No protocol / server / controller changes.
 *   - Reuses the existing bot-vs-player AI verbatim (wave bots are normal Bots
 *     that simply don't auto-respawn). Every wave-bot death IS a player kill,
 *     so combat XP / stats / killfeed / announcer all "just work".
 *   - Owns the bot roster only while it runs (Game.setSurvivalActive), parking
 *     the persistent base bots and disposing its own wave bots between runs.
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) for wave
 * pacing + respawn timing; this controller subscribes to the `kill` bus to drive
 * wave-clear + lives logic.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { BotDifficulty } from '../entities/Bot';

const START_LIVES = 3;
const BREATHER_SEC = 3.0;       // pause between waves (banner + heal + reload)
const RESPAWN_SEC = 1.6;        // delay before a life is spent and you drop back in
const MAX_WAVE_BOTS = 8;        // hard cap so the arena never floods
const BOSS_EVERY = 5;          // every Nth wave is a boss wave
const PB_KEY = 'ilc.onslaught.best';

export interface OnslaughtResult {
  wave: number;          // highest wave reached
  kills: number;         // total frags this run
  best: number;          // personal best wave AFTER this run
  isNewBest: boolean;
  xpEarned: number;      // bonus XP banked this run (wave-clear bonuses)
}

type Phase = 'idle' | 'breather' | 'fighting' | 'respawning' | 'over';

export class Onslaught {
  private game: Game;
  private unsub: (() => void) | null = null;

  active = false;
  private phase: Phase = 'idle';
  private wave = 0;
  private lives = START_LIVES;
  private kills = 0;
  private runXp = 0;
  private timer = 0;            // counts down breather / respawn windows

  /** HUD ticker update: current wave, lives left, enemies remaining. */
  onState?: (wave: number, lives: number, enemiesLeft: number) => void;
  /** Fired at the START of each wave — drives a center-screen "WAVE n" banner.
   *  `isBoss` lets the banner shout "BOSS WAVE". */
  onWaveStart?: (wave: number, enemyCount: number, isBoss: boolean) => void;
  /** Fired when the run ends (lives exhausted) — drives the results card. */
  onEnd?: (result: OnslaughtResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a fresh run (also used by "Play Again"). */
  start() {
    if (!this.unsub) {
      this.unsub = this.game.bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
    }
    this.active = true;
    this.wave = 0;
    this.lives = START_LIVES;
    this.kills = 0;
    this.runXp = 0;
    this.game.setSurvivalActive(true);
    this.game.clearSurvivalBots();
    this.game.healPlayerFull();
    // Short breather before wave 1 so the player can orient.
    this.phase = 'breather';
    this.timer = 1.2;
    this.emitState(0);
  }

  /** End the run + tear down. Called on quit-to-menu / mode switch. */
  stop() {
    this.active = false;
    this.phase = 'idle';
    this.unsub?.();
    this.unsub = null;
    this.game.setSurvivalActive(false);
  }

  update(dt: number) {
    if (!this.active) return;

    if (this.phase === 'breather') {
      this.timer -= dt;
      if (this.timer <= 0) this.beginWave();
      return;
    }

    if (this.phase === 'respawning') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.game.respawnPlayer();
        this.phase = 'fighting';
        this.emitState();
      }
      return;
    }
  }

  /** Spawn the next wave. Count + difficulty + HP all escalate with the wave
   *  number; every 5th wave is a BOSS WAVE — a tanky emissive elite leading a
   *  smaller pack. */
  private beginWave() {
    this.wave++;
    const isBoss = this.wave % BOSS_EVERY === 0;
    // Regular-bot HP creeps up so late waves stay threatening (capped).
    const hp = Math.min(100 + (this.wave - 1) * 8, 180);

    const count = isBoss
      ? Math.min(MAX_WAVE_BOTS, 3 + Math.floor(this.wave * 0.6))   // fewer adds on boss waves
      : Math.min(MAX_WAVE_BOTS, 2 + Math.floor(this.wave * 1.2));
    const spawns = this.game.survivalSpawns(count);

    for (let i = 0; i < count; i++) {
      const pos = spawns[i] ?? new THREE.Vector3(0, 0.5, 0);
      if (isBoss && i === 0) {
        // The boss: high HP, predictor brain, dark-crimson emissive glow.
        this.game.spawnSurvivalBot('predictor', pos, {
          maxHp: 220 + this.wave * 12,
          bodyColor: 0x7a0f1a, headColor: 0x4a0a12, emissive: 0xff2030, elite: true,
        });
      } else {
        this.game.spawnSurvivalBot(this.waveDifficulty(i), pos, { maxHp: hp });
      }
    }
    this.phase = 'fighting';
    this.onWaveStart?.(this.wave, count, isBoss);
    this.emitState();
  }

  /**
   * Difficulty mix per wave: early waves are mostly wanderers; mid waves add
   * engagers; late waves sprinkle in predictors. `i` staggers the mix within a
   * single wave so it's not a uniform block.
   */
  private waveDifficulty(i: number): BotDifficulty {
    const w = this.wave;
    const roll = Math.random() + i * 0.05;
    if (w >= 6) return roll < 0.4 ? 'predictor' : roll < 0.8 ? 'engager' : 'wanderer';
    if (w >= 3) return roll < 0.15 ? 'predictor' : roll < 0.6 ? 'engager' : 'wanderer';
    return roll < 0.25 ? 'engager' : 'wanderer';
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.active) return;

    // Player died — spend a life (or end the run).
    if (this.game.isLocalPlayer(targetId)) {
      this.lives--;
      if (this.lives <= 0) {
        this.endRun();
      } else if (this.phase === 'fighting') {
        this.phase = 'respawning';
        this.timer = RESPAWN_SEC;
      }
      this.emitState();
      return;
    }

    // A wave bot died (every wave-bot death is a player frag).
    if (this.game.isLocalPlayer(attackerId)) {
      this.kills++;
    }
    // Wave cleared?
    if (this.phase === 'fighting' && this.game.livingSurvivalBots() === 0) {
      this.clearWave();
    }
    this.emitState();
  }

  /** Wave fully eliminated: heal, bank a scaling bonus, breather → next wave.
   *  Boss waves pay double. */
  private clearWave() {
    this.game.healPlayerFull();
    const isBoss = this.wave % BOSS_EVERY === 0;
    const bonus = (25 + this.wave * 15) * (isBoss ? 2 : 1);
    this.game.account.awardXP(bonus);
    this.runXp += bonus;
    this.phase = 'breather';
    this.timer = BREATHER_SEC;
  }

  private endRun() {
    this.phase = 'over';
    // Wave bots can keep shooting a corpse behind the results card — clear them.
    this.game.clearSurvivalBots();

    const prevBest = Number(localStorage.getItem(PB_KEY) ?? 0);
    const isNewBest = this.wave > prevBest;
    if (isNewBest) localStorage.setItem(PB_KEY, String(this.wave));
    // A new best-wave may have just earned a Survivor medal tier.
    this.game.account.checkAchievements();

    this.onEnd?.({
      wave: this.wave,
      kills: this.kills,
      best: Math.max(prevBest, this.wave),
      isNewBest,
      xpEarned: this.runXp,
    });
  }

  private emitState(enemiesOverride?: number) {
    const enemies = enemiesOverride ?? this.game.livingSurvivalBots();
    this.onState?.(this.wave, this.lives, enemies);
  }

  /** Current run's personal-best wave (for menu/profile display). */
  static personalBest(): number {
    return Number(localStorage.getItem(PB_KEY) ?? 0);
  }
}
