/**
 * Duel — solo 1v1 gauntlet ("win the next duel").
 *
 * A pure-skill ladder: you face a single opponent in a fair 1v1. Win and you
 * advance to the next, tougher rival; lose a single duel and the run ends on a
 * results card (a natural ad breakpoint) showing your win streak and your
 * persistent personal best. It's the most direct expression of the core
 * competitive loop — the constant desire to win the next fight.
 *
 * Why it's low-risk + self-contained (the Onslaught pattern):
 *   - SOLO only. No protocol / server / controller changes.
 *   - Reuses the existing bot-vs-player AI verbatim — each opponent is an
 *     ordinary Bot that doesn't auto-respawn, so its death IS a player frag and
 *     XP / stats / killfeed / announcer / mastery all "just work".
 *   - Owns the bot roster only while it runs (Game.setSurvivalActive parks the
 *     base bots; clearSurvivalBots disposes the opponent between duels).
 *
 * Lifecycle: main.ts calls start()/stop(); Game.tick calls update(dt) for the
 * intro/intermission pacing; this controller subscribes to the `kill` bus to
 * decide who won each duel.
 */

import type { Game } from '../core/Game';
import type { BotDifficulty, GameDifficulty } from '../entities/Bot';

const INTRO_SEC = 1.4;          // pause before duel 1 (orient + banner)
const INTERMISSION_SEC = 2.2;   // pause between duels (heal + banner)
const PB_KEY = 'ilc.duel.best';

/** Rival callsigns, cycled by duel number so each opponent reads distinct. */
const RIVALS = [
  'Rookie', 'Maverick', 'Blaze', 'Talon', 'Reaper', 'Onyx', 'Vortex',
  'Wraith', 'Sabre', 'Nemesis', 'Phantom', 'Titan', 'Apex', 'Omega',
];

export interface DuelResult {
  wins: number;          // duels won this run (= win streak)
  duelsFaced: number;    // opponents faced (wins + 1 on a loss)
  best: number;          // personal best win streak AFTER this run
  isNewBest: boolean;
  xpEarned: number;      // bonus XP banked this run (per-duel win bonuses)
  lastRival: string;     // who beat you
}

type Phase = 'idle' | 'intro' | 'dueling' | 'intermission' | 'over';

export class Duel {
  private game: Game;
  private unsub: (() => void) | null = null;

  active = false;
  private phase: Phase = 'idle';
  private duelNum = 0;            // current opponent number (1-based)
  private wins = 0;              // duels won so far this run
  private runXp = 0;
  private timer = 0;
  private currentRival = '';

  /** HUD ticker: current duel number, win streak, best. */
  onState?: (duelNum: number, wins: number, best: number) => void;
  /** Fired at the START of each duel — drives the center-screen banner. */
  onDuelStart?: (duelNum: number, rival: string, tier: string) => void;
  /** Fired when you WIN a duel — drives a short "DUEL WON" flash. */
  onDuelWon?: (wins: number) => void;
  /** Fired when the run ends (you lost a duel) — drives the results card. */
  onEnd?: (result: DuelResult) => void;

  constructor(game: Game) {
    this.game = game;
  }

  /** Begin a fresh gauntlet (also used by "Play Again"). */
  start() {
    if (!this.unsub) {
      this.unsub = this.game.bus.on('kill', (e) => this.onKill(e.attackerId, e.targetId));
    }
    this.active = true;
    this.duelNum = 0;
    this.wins = 0;
    this.runXp = 0;
    this.game.setSurvivalActive(true);
    this.game.clearSurvivalBots();
    this.game.healPlayerFull();
    this.phase = 'intro';
    this.timer = INTRO_SEC;
    this.emitState();
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
    if (this.phase === 'intro' || this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this.beginDuel();
    }
  }

  /** Spawn the next opponent: a single bot whose tier / HP / AI skill all
   *  escalate with the duel number, dropped at the spawn farthest from you. */
  private beginDuel() {
    this.duelNum++;
    this.game.clearSurvivalBots();
    this.game.healPlayerFull();
    this.game.respawnPlayer();

    const tier = this.tierFor(this.duelNum);
    const skill = this.skillFor(this.duelNum);
    const hp = Math.min(100 + (this.duelNum - 1) * 10, 180);
    this.currentRival = RIVALS[(this.duelNum - 1) % RIVALS.length];
    // Late-gauntlet rivals glow crimson so the danger reads at a glance.
    const fearsome = this.duelNum >= 6;

    const spawn = this.game.survivalSpawns(1)[0];
    if (!spawn) { this.endRun(); return; }

    this.game.spawnSurvivalBot(tier, spawn, {
      maxHp: hp,
      name: this.currentRival,
      skill,
      ...(fearsome ? { bodyColor: 0x7a0f1a, headColor: 0x4a0a12, emissive: 0xff2030 } : {}),
    });

    this.phase = 'dueling';
    this.onDuelStart?.(this.duelNum, this.currentRival, this.tierLabel(tier, skill));
    this.emitState();
  }

  private onKill(attackerId: string, targetId: string) {
    if (!this.active) return;

    // You died → you lost this duel → the run is over (single elimination).
    if (this.game.isLocalPlayer(targetId)) {
      this.endRun();
      return;
    }

    // Your opponent died → duel won. (Only react while actually dueling so a
    // stray late event can't double-count.)
    if (this.phase === 'dueling' && this.game.isLocalPlayer(attackerId)) {
      this.wins++;
      const bonus = 30 + this.duelNum * 20;
      this.game.account.awardXP(bonus);
      this.runXp += bonus;
      this.onDuelWon?.(this.wins);
      this.phase = 'intermission';
      this.timer = INTERMISSION_SEC;
      this.emitState();
    }
  }

  private endRun() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.game.clearSurvivalBots();

    const prevBest = Number(localStorage.getItem(PB_KEY) ?? 0);
    const isNewBest = this.wins > prevBest;
    if (isNewBest) localStorage.setItem(PB_KEY, String(this.wins));
    // A new best win-streak may have just earned a Duelist medal tier.
    this.game.account.checkAchievements();

    this.onEnd?.({
      wins: this.wins,
      duelsFaced: this.duelNum,
      best: Math.max(prevBest, this.wins),
      isNewBest,
      xpEarned: this.runXp,
      lastRival: this.currentRival,
    });
  }

  /** Bot brain tier ramps: brawler → engager → predictor. */
  private tierFor(n: number): BotDifficulty {
    if (n <= 1) return 'wanderer';
    if (n <= 3) return 'engager';
    return 'predictor';
  }

  /** Global AI-feel skill ramps independently of the menu difficulty — Duel is
   *  its own escalating challenge. */
  private skillFor(n: number): GameDifficulty {
    if (n <= 2) return 'easy';
    if (n <= 5) return 'normal';
    return 'hard';
  }

  private tierLabel(tier: BotDifficulty, skill: GameDifficulty): string {
    const t = tier === 'predictor' ? 'ELITE' : tier === 'engager' ? 'VETERAN' : 'ROOKIE';
    return `${t} · ${skill.toUpperCase()}`;
  }

  private emitState() {
    this.onState?.(this.duelNum, this.wins, Math.max(Duel.personalBest(), this.wins));
  }

  /** Current best win streak (for menu/profile display). */
  static personalBest(): number {
    return Number(localStorage.getItem(PB_KEY) ?? 0);
  }
}
