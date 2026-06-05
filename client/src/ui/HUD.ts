/**
 * HUD — DOM-side game UI: health, ammo, hitmarker, killfeed, damage flash.
 *
 * Subscribes to the event bus and the per-frame game state. Throttled where
 * it makes sense so we don't thrash layout every frame.
 */

import type { Health } from '../entities/Health';
import type { WeaponInventory } from '../weapons/WeaponInventory';
import type { AbilityRunner } from '../classes/AbilityRunner';
import type { PlayerController } from '../entities/PlayerController';
import { Game } from '../core/Game';

const KILLFEED_MAX = 5;
const KILLFEED_TTL = 5000; // ms

export class HUD {
  private playerHealth: Health;
  private inventory: WeaponInventory;
  private abilities: AbilityRunner;
  private player: PlayerController;

  private hpFill: HTMLElement;
  private hpNum: HTMLElement;
  private ammoCur: HTMLElement;
  private ammoMax: HTMLElement;
  private ammoWeapon: HTMLElement;
  private reloadIndicator: HTMLElement;
  private hitmarker: HTMLElement;
  private damageFlash: HTMLElement;
  private killfeed: HTMLElement;
  private crosshair: HTMLElement;
  private scopeOverlay: HTMLElement;
  private slotChips: HTMLElement[];
  private spawnProtect: HTMLElement;
  private matchScore: HTMLElement;
  private msYouKills: HTMLElement;
  private msGoal: HTMLElement;
  private msLeader: HTMLElement;
  private respawnCountdown: HTMLElement;
  private rcTimer: HTMLElement;
  /** Wall-clock ms when our death animation started; 0 = not dead. */
  private deathStartedAt = 0;
  private abilityPill: HTMLElement;
  private apName: HTMLElement;
  private apFill: HTMLElement;
  private apCharges: HTMLElement;
  private apDots: HTMLElement[];

  private lastHp = -1;
  private lastAmmo = -1;
  private lastAmmoMax = -1;
  private lastWeaponId = '';
  private lastScoped = false;
  private lastSlot = -1;
  private lastInvuln = false;
  private lastClassId = '';
  private lastCharges = -1;
  private lastActive = false;
  private hitmarkerTimer: number | null = null;
  private damageFlashTimer: number | null = null;

  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.playerHealth = game.playerActor.health;
    this.inventory = game.inventory;
    this.abilities = game.abilities;
    this.player = game.player;
    const bus = game.bus;

    this.hpFill = document.getElementById('hp-fill')!;
    this.hpNum = document.getElementById('hp-num')!;
    this.ammoCur = document.getElementById('ammo-cur')!;
    this.ammoMax = document.getElementById('ammo-max')!;
    this.ammoWeapon = document.getElementById('ammo-weapon')!;
    this.reloadIndicator = document.getElementById('reload-indicator')!;
    this.hitmarker = document.getElementById('hitmarker')!;
    this.damageFlash = document.getElementById('damage-flash')!;
    this.killfeed = document.getElementById('killfeed')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.scopeOverlay = document.getElementById('scope-overlay')!;
    this.slotChips = Array.from(document.querySelectorAll<HTMLElement>('.slot-chip'));
    this.spawnProtect = document.getElementById('spawn-protect')!;
    this.matchScore = document.getElementById('match-score')!;
    this.msYouKills = document.getElementById('ms-you-kills')!;
    this.msGoal = document.getElementById('ms-goal')!;
    this.msLeader = document.getElementById('ms-leader')!;
    this.respawnCountdown = document.getElementById('respawn-countdown')!;
    this.rcTimer = document.getElementById('rc-timer')!;
    this.abilityPill = document.getElementById('ability-pill')!;
    this.apName = this.abilityPill.querySelector('.ap-name') as HTMLElement;
    this.apFill = this.abilityPill.querySelector('.ap-cd-fill') as HTMLElement;
    this.apCharges = this.abilityPill.querySelector('.ap-charges') as HTMLElement;
    this.apDots = Array.from(this.abilityPill.querySelectorAll<HTMLElement>('.ap-dot'));

    // Player-shot hits → hitmarker (local-only event).
    bus.on('hitConfirm', ({ isHeadshot }) => this.flashHitmarker(isHeadshot));

    // Damage taken → red vignette.
    bus.on('damage', ({ targetId }) => {
      if (this.game.isLocalPlayer(targetId)) this.flashDamage();
    });

    // Kills → killfeed. Shortens MP socket ids to a 6-char tag for readability.
    bus.on('kill', (e) => {
      const killer = this.game.isLocalPlayer(e.attackerId) ? 'YOU' : shortId(e.attackerId);
      const victim = this.game.isLocalPlayer(e.targetId)   ? 'YOU' : shortId(e.targetId);
      this.pushKill(killer, victim, e.weaponId, e.isHeadshot);

      // Death → start respawn countdown. Cleared when HP comes back.
      if (this.game.isLocalPlayer(e.targetId)) {
        this.deathStartedAt = performance.now();
      }
    });
  }

  /** Called once per frame from Game.onFrame. */
  tick() {
    const hp = this.playerHealth.current;
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.hpFill.style.width = `${(hp / this.playerHealth.max) * 100}%`;
      this.hpNum.textContent = String(Math.ceil(hp));
    }

    const w = this.inventory.current;
    if (w.config.id !== this.lastWeaponId) {
      this.lastWeaponId = w.config.id;
      this.ammoWeapon.textContent = w.config.id.toUpperCase();
    }
    if (w.config.magSize !== this.lastAmmoMax) {
      this.lastAmmoMax = w.config.magSize;
      this.ammoMax.textContent = String(w.config.magSize);
    }
    const ammo = w.ammo;
    if (ammo !== this.lastAmmo) {
      this.lastAmmo = ammo;
      this.ammoCur.textContent = String(ammo);
      this.ammoCur.classList.toggle('low', ammo > 0 && ammo <= 5);
      this.ammoCur.classList.toggle('empty', ammo === 0);
    }
    this.reloadIndicator.classList.toggle('hidden', !w.isReloading);

    const scoped = this.inventory.isScoped;
    if (scoped !== this.lastScoped) {
      this.lastScoped = scoped;
      this.scopeOverlay.classList.toggle('hidden', !scoped);
      // Hide the regular crosshair while scoped — the scope has its own reticle.
      this.crosshair.style.visibility = scoped ? 'hidden' : '';
    }

    const slot = this.inventory.activeSlot;
    if (slot !== this.lastSlot) {
      this.lastSlot = slot;
      this.slotChips.forEach((c, i) => c.classList.toggle('active', i === slot));
    }

    // Spawn protection vignette — toggle on edges only, not every frame.
    const invuln = this.playerHealth.isInvulnerable;
    if (invuln !== this.lastInvuln) {
      this.lastInvuln = invuln;
      this.spawnProtect.classList.toggle('hidden', !invuln);
    }

    this.tickAbilityPill();
    this.tickCrosshairSpread();
    this.tickMatchScore();
    this.tickRespawnCountdown();
  }

  /**
   * Drive the crosshair gap from current effective spread.
   *
   * Effective spread = max(baseSpread, currentSpread) × stancePenalty. We map
   * radians to pixels via a tuned factor (140) so a 0.04-rad cone reads as
   * ~5.6 px of dynamic gap — visible without overpowering the dot.
   *
   * Final gap = user-chosen baseline (--ch-gap-base) + dynamic gap. We read
   * --ch-gap-base from the document root so settings + dynamic stack cleanly.
   */
  private tickCrosshairSpread() {
    const w = this.inventory.current;
    const baseR = Math.max(w.config.baseSpread, w.spread);
    const r = baseR * this.player.stanceAccuracyPenalty();
    const dynamicPx = Math.min(18, Math.max(0, r * 140));
    // Read baseline once (cheap — getComputedStyle returns a CSSOM string).
    const baseStr = getComputedStyle(document.documentElement).getPropertyValue('--ch-gap-base').trim();
    const baselinePx = parseFloat(baseStr) || 0;
    this.crosshair.style.setProperty('--ch-gap', `${(baselinePx + dynamicPx).toFixed(1)}px`);
  }

  /** Update the ability pill: class color, name, cooldown fill, charge dots. */
  private tickAbilityPill() {
    const cls = this.abilities.config;
    const ab = this.abilities.ability;

    if (cls.id !== this.lastClassId) {
      this.lastClassId = cls.id;
      // CSS var drives all the colored bits — one variable update propagates.
      const hex = '#' + cls.color.toString(16).padStart(6, '0');
      this.abilityPill.style.setProperty('--class-c', hex);
      this.apName.textContent = ab.displayName;
      // Show / hide charge dots depending on multi-charge ability.
      const multi = ab.maxCharges > 1;
      this.apCharges.classList.toggle('single', !multi);
      this.apDots.forEach((d, i) => d.classList.toggle('hidden', i >= ab.maxCharges));
    }

    // Cooldown ring: progress 0..1.
    const progress = Math.max(0, Math.min(1, ab.cooldownProgress));
    this.apFill.style.width = `${progress * 100}%`;

    if (ab.currentCharges !== this.lastCharges) {
      this.lastCharges = ab.currentCharges;
      this.apDots.forEach((d, i) => d.classList.toggle('spent', i >= ab.currentCharges));
    }

    if (ab.isReady && !this.abilityPill.classList.contains('ready')) {
      this.abilityPill.classList.add('ready');
    } else if (!ab.isReady && this.abilityPill.classList.contains('ready')) {
      this.abilityPill.classList.remove('ready');
    }
    if (ab.active !== this.lastActive) {
      this.lastActive = ab.active;
      this.abilityPill.classList.toggle('active', ab.active);
    }
  }

  /**
   * Match score ticker — shown only in MP combat. Pulls the local player's
   * kill count from game.matchKills and the current leader's count.
   */
  private tickMatchScore() {
    const showIt = this.game.mp !== null && this.game.mode === 'combat';
    if (!showIt) {
      if (!this.matchScore.classList.contains('hidden')) {
        this.matchScore.classList.add('hidden');
      }
      return;
    }
    this.matchScore.classList.remove('hidden');
    const myId = this.game.localPlayerId();
    const myKills = this.game.matchKills.get(myId) ?? 0;
    this.msYouKills.textContent = String(myKills);
    this.msGoal.textContent = String(Game.MATCH_KILL_GOAL);

    // Find current leader.
    let leaderId = myId;
    let leaderKills = myKills;
    for (const [id, k] of this.game.matchKills) {
      if (k > leaderKills) { leaderId = id; leaderKills = k; }
    }
    if (leaderId === myId) {
      this.msLeader.textContent = 'you lead';
    } else {
      this.msLeader.textContent = `leader: ${shortId(leaderId)} (${leaderKills})`;
    }
  }

  /**
   * Respawn countdown — shows the remaining time during the 1.8s death window.
   * In SOLO, deathStartedAt is set by the kill event listener; in MP, the
   * server respawns us but the HP transition through 0 still fires the kill
   * event so deathStartedAt is still set. We auto-clear when HP > 0 again.
   */
  private tickRespawnCountdown() {
    if (this.deathStartedAt === 0) {
      if (!this.respawnCountdown.classList.contains('hidden')) {
        this.respawnCountdown.classList.add('hidden');
      }
      return;
    }
    const elapsed = (performance.now() - this.deathStartedAt) / 1000;
    // Clear if we're alive again (server snapshot bumped HP back up, or solo
    // respawnPlayer ran) — but only after a short grace window. Without this,
    // an MP race where the kill event arrives a frame before HP actually drops
    // to 0 would blank the countdown the instant it started (audit #10).
    if (elapsed > 0.25 && this.playerHealth.current > 0 && !this.playerHealth.dead) {
      this.deathStartedAt = 0;
      this.respawnCountdown.classList.add('hidden');
      return;
    }
    const remaining = Math.max(0, 1.8 - elapsed);
    this.respawnCountdown.classList.remove('hidden');
    this.rcTimer.textContent = remaining.toFixed(1);
  }

  private flashHitmarker(isHeadshot: boolean) {
    this.hitmarker.classList.remove('fade');
    this.hitmarker.classList.toggle('headshot', isHeadshot);
    // Force reflow so re-adding the class restarts the transition.
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (this.hitmarkerTimer !== null) window.clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => {
      this.hitmarker.classList.remove('show');
      this.hitmarker.classList.add('fade');
    }, 80);
  }

  private flashDamage() {
    this.damageFlash.classList.remove('show');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('show');
    if (this.damageFlashTimer !== null) window.clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = window.setTimeout(() => {
      this.damageFlash.classList.remove('show');
    }, 40);
  }

  private pushKill(killer: string, victim: string, weaponId: string, isHeadshot: boolean) {
    const e = document.createElement('div');
    e.className = 'kf-entry';
    e.innerHTML = `
      <span class="kf-killer">${killer}</span>
      <span class="kf-wpn">[${weaponId}]</span>
      <span class="kf-victim">${victim}</span>
      ${isHeadshot ? '<span class="kf-head">HS</span>' : ''}
    `;
    this.killfeed.appendChild(e);
    while (this.killfeed.children.length > KILLFEED_MAX) {
      this.killfeed.removeChild(this.killfeed.firstChild!);
    }
    window.setTimeout(() => {
      if (e.parentElement) e.parentElement.removeChild(e);
    }, KILLFEED_TTL);
  }
}

/** Truncate long ids (socket ids in MP) to a readable 6-char tag. */
function shortId(id: string): string {
  return id.length <= 8 ? id.toUpperCase() : id.slice(0, 6).toUpperCase();
}

