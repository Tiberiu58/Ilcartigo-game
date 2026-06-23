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
/** Health fraction at/below which the low-HP danger vignette + heartbeat kick in. */
const LOW_HP_RATIO = 0.3;

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
  private lowHpVignette: HTMLElement;
  private matchScore: HTMLElement;
  private msYouKills: HTMLElement;
  private msGoal: HTMLElement;
  private msLeader: HTMLElement;
  private respawnCountdown: HTMLElement;
  private rcTimer: HTMLElement;
  private rcRecap: HTMLElement;
  private rcKiller: HTMLElement;
  private rcWeapon: HTMLElement;
  /** Wall-clock ms when our death animation started; 0 = not dead. */
  private deathStartedAt = 0;
  private abilityPill: HTMLElement;
  private apName: HTMLElement;
  private apFill: HTMLElement;
  private apCharges: HTMLElement;
  private apDots: HTMLElement[];
  private utilityPill: HTMLElement;
  private upFill: HTMLElement;
  private buffTray: HTMLElement;
  /** Live buff pills keyed by kind, so we only build DOM on activation. */
  private buffPills = new Map<string, { el: HTMLElement; bar: HTMLElement }>();
  private killBanner: HTMLElement;
  private kbTag: HTMLElement;
  private kbName: HTMLElement;
  private killBannerTimer: number | null = null;

  // Hit-combo counter — mirrors the rising-hitmarker chain (consecutive landed
  // hits within a short window) as a visible "x3"+ meter by the crosshair.
  private hitCombo!: HTMLElement;
  private comboCount = 0;
  private comboLastMs = 0;
  private comboHideTimer: number | null = null;

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
  private crosshairFbTimer: number | null = null;

  /** Low-HP danger state. Vignette shows + a heartbeat throbs below threshold. */
  private lowHp = false;
  private lastHeartbeatAt = 0;

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
    this.lowHpVignette = document.getElementById('lowhp-vignette')!;
    this.matchScore = document.getElementById('match-score')!;
    this.msYouKills = document.getElementById('ms-you-kills')!;
    this.msGoal = document.getElementById('ms-goal')!;
    this.msLeader = document.getElementById('ms-leader')!;
    this.respawnCountdown = document.getElementById('respawn-countdown')!;
    this.rcTimer = document.getElementById('rc-timer')!;
    this.rcRecap = document.getElementById('rc-recap')!;
    this.rcKiller = document.getElementById('rc-killer')!;
    this.rcWeapon = document.getElementById('rc-weapon')!;
    this.abilityPill = document.getElementById('ability-pill')!;
    this.apName = this.abilityPill.querySelector('.ap-name') as HTMLElement;
    this.apFill = this.abilityPill.querySelector('.ap-cd-fill') as HTMLElement;
    this.apCharges = this.abilityPill.querySelector('.ap-charges') as HTMLElement;
    this.apDots = Array.from(this.abilityPill.querySelectorAll<HTMLElement>('.ap-dot'));
    this.utilityPill = document.getElementById('utility-pill')!;
    this.upFill = this.utilityPill.querySelector('.up-fill') as HTMLElement;
    this.buffTray = document.getElementById('buff-tray')!;
    this.killBanner = document.getElementById('kill-banner')!;
    this.kbTag = document.getElementById('kb-tag')!;
    this.kbName = document.getElementById('kb-name')!;
    this.hitCombo = document.getElementById('hit-combo')!;

    // Player-shot hits → hitmarker (local-only event) + combo meter.
    bus.on('hitConfirm', ({ isHeadshot }) => {
      this.flashHitmarker(isHeadshot);
      this.crosshairFeedback(isHeadshot ? 'head' : 'hit');
      this.bumpCombo();
    });

    // Damage taken → red vignette.
    bus.on('damage', ({ targetId }) => {
      if (this.game.isLocalPlayer(targetId)) this.flashDamage();
    });

    // Kills → killfeed. Shortens MP socket ids to a 6-char tag for readability.
    bus.on('kill', (e) => {
      const killer = this.game.isLocalPlayer(e.attackerId) ? 'YOU' : this.game.displayNameFor(e.attackerId);
      const victim = this.game.isLocalPlayer(e.targetId)   ? 'YOU' : this.game.displayNameFor(e.targetId);
      this.pushKill(killer, victim, e.weaponId, e.isHeadshot);

      // Kill-confirm marker + "ELIMINATED {name}" banner when YOU got the kill
      // (not a suicide/fall).
      if (this.game.isLocalPlayer(e.attackerId) && !this.game.isLocalPlayer(e.targetId)) {
        this.flashKillMarker();
        this.crosshairFeedback('kill');
        this.showKillBanner(this.game.displayNameFor(e.targetId), e.isHeadshot);
      }

      // Death → start respawn countdown. Cleared when HP comes back.
      if (this.game.isLocalPlayer(e.targetId)) {
        this.deathStartedAt = performance.now();
        this.showRecap(e.attackerId, e.weaponId, e.isHeadshot);
        this.resetCombo();   // dying breaks the hit chain
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
    this.tickUtilityPill();
    this.tickBuffs();
    this.tickCrosshairSpread();
    this.tickLowHp();
    this.tickMatchScore();
    this.tickRespawnCountdown();
  }

  /** Grenade readiness pill — solo only (grenades are disabled in MP). The fill
   *  empties on throw and refills over the cooldown; 'ready' class when full. */
  private tickUtilityPill() {
    const show = this.game.mp === null;
    if (!show) {
      if (!this.utilityPill.classList.contains('hidden')) this.utilityPill.classList.add('hidden');
      return;
    }
    this.utilityPill.classList.remove('hidden');
    const f = this.game.grenadeReadyFraction;
    this.upFill.style.transform = `scaleX(${f.toFixed(3)})`;
    this.utilityPill.classList.toggle('ready', f >= 1);
  }

  /** Arena power-up tray — one pill per active buff with a draining timer bar.
   *  DOM is built on activation and torn down on expiry; only bar widths + the
   *  seconds label change per frame. */
  private tickBuffs() {
    const buffs = this.game.powerupBuffs();
    const seen = new Set<string>();
    for (const b of buffs) {
      seen.add(b.kind);
      let pill = this.buffPills.get(b.kind);
      if (!pill) {
        const el = document.createElement('div');
        el.className = `buff-pill buff-${b.kind}`;
        const label = b.kind === 'damage' ? '🔥 OVERCHARGE'
          : b.kind === 'haste' ? '⚡ RAPID FIRE'
          : '🛡 OVERSHIELD';
        el.innerHTML =
          `<div class="bp-row"><span class="bp-name">${label}</span>` +
          `<span class="bp-time"></span></div><div class="bp-bar"><div class="bp-fill"></div></div>`;
        this.buffTray.appendChild(el);
        pill = { el, bar: el.querySelector('.bp-fill') as HTMLElement };
        this.buffPills.set(b.kind, pill);
      }
      pill.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, b.frac)).toFixed(3)})`;
      const t = pill.el.querySelector('.bp-time') as HTMLElement;
      t.textContent = `${Math.ceil(b.seconds)}s`;
    }
    // Remove pills whose buff expired.
    for (const [kind, pill] of this.buffPills) {
      if (!seen.has(kind)) {
        pill.el.remove();
        this.buffPills.delete(kind);
      }
    }
  }

  /**
   * Low-HP danger feedback. Below LOW_HP_RATIO of max (and alive), a pulsing
   * red vignette shows and a slow heartbeat SFX throbs — tension you feel
   * without looking at the HP bar. Heartbeat cadence tightens as HP drops.
   */
  private tickLowHp() {
    const max = this.playerHealth.max || 1;
    const ratio = this.playerHealth.current / max;
    const critical = !this.playerHealth.dead && this.playerHealth.current > 0 && ratio <= LOW_HP_RATIO;
    if (critical !== this.lowHp) {
      this.lowHp = critical;
      this.lowHpVignette.classList.toggle('hidden', !critical);
    }
    if (!critical) return;
    // Heartbeat: ~0.95s at the threshold, tightening toward ~0.5s near death.
    const t = Math.max(0, Math.min(1, ratio / LOW_HP_RATIO));
    const interval = 500 + t * 450;
    const now = performance.now();
    if (now - this.lastHeartbeatAt >= interval) {
      this.lastHeartbeatAt = now;
      this.game.audio.play('heartbeat', 0.7);
    }
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
    const rootStyle = getComputedStyle(document.documentElement);
    // Dynamic crosshair can be disabled in settings (--ch-dynamic: 0) for a
    // fixed reticle. When off, the gap is just the user's chosen baseline.
    const dynamicOn = rootStyle.getPropertyValue('--ch-dynamic').trim() !== '0';
    let dynamicPx = 0;
    if (dynamicOn) {
      const w = this.inventory.current;
      const baseR = Math.max(w.config.baseSpread, w.spread);
      const r = baseR * this.player.stanceAccuracyPenalty();
      dynamicPx = Math.min(18, Math.max(0, r * 140));
    }
    // Read baseline once (cheap — getComputedStyle returns a CSSOM string).
    const baseStr = rootStyle.getPropertyValue('--ch-gap-base').trim();
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
    // FFA match ticker — shown in both solo and online combat (TDM/Gun Game
    // have their own tickers; practice has none).
    const showIt = this.game.mode === 'combat';
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
      this.msLeader.textContent = `leader: ${this.game.displayNameFor(leaderId)} (${leaderKills})`;
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
    this.hitmarker.classList.remove('fade', 'kill');
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

  /** Bigger red X stamped over the crosshair the moment you confirm a kill. */
  private flashKillMarker() {
    this.hitmarker.classList.remove('fade', 'headshot');
    this.hitmarker.classList.add('kill');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (this.hitmarkerTimer !== null) window.clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => {
      this.hitmarker.classList.remove('show');
      this.hitmarker.classList.add('fade');
    }, 140);
  }

  /**
   * Flashy "ELIMINATED {name}" prompt below the crosshair on each local kill —
   * the Krunker "you got 'em" readout. Headshots stamp a hotter accent. The
   * pop animation restarts on each kill so rapid frags re-trigger cleanly.
   */
  private showKillBanner(victimName: string, isHeadshot: boolean) {
    this.kbTag.textContent = isHeadshot ? 'HEADSHOT' : 'ELIMINATED';
    this.kbName.textContent = victimName.toUpperCase();
    this.killBanner.classList.toggle('headshot', isHeadshot);
    this.killBanner.classList.remove('hidden');
    this.killBanner.style.animation = 'none';
    void this.killBanner.offsetWidth;   // reflow so the pop restarts
    this.killBanner.style.animation = '';
    if (this.killBannerTimer !== null) window.clearTimeout(this.killBannerTimer);
    this.killBannerTimer = window.setTimeout(() => this.killBanner.classList.add('hidden'), 1200);
  }

  /**
   * Brief crosshair recolour + scale pop on a confirmed hit. White = body,
   * gold = headshot, red = kill. Clears back to the user's chosen colour after
   * a short window. Kill feedback lasts a touch longer so it reads as the
   * bigger event. Edge classes are cleared first so rapid hits restart cleanly.
   */
  private crosshairFeedback(kind: 'hit' | 'head' | 'kill') {
    const ch = this.crosshair;
    ch.classList.remove('ch-fb-hit', 'ch-fb-head', 'ch-fb-kill', 'ch-pop');
    void ch.offsetWidth;
    ch.classList.add(`ch-fb-${kind}`, 'ch-pop');
    if (this.crosshairFbTimer !== null) window.clearTimeout(this.crosshairFbTimer);
    this.crosshairFbTimer = window.setTimeout(() => {
      ch.classList.remove('ch-fb-hit', 'ch-fb-head', 'ch-fb-kill', 'ch-pop');
    }, kind === 'kill' ? 170 : 90);
  }

  /**
   * Hit-combo meter — counts consecutive landed hits within the same ~1.1 s
   * window as the rising hitmarker, surfacing it as a "x3"+ counter by the
   * crosshair (gold → hot orange ≥6 → violet blaze ≥10). Hidden below x3 so it
   * only ever celebrates a real streak, and auto-hides after a gap.
   */
  private bumpCombo() {
    const now = performance.now();
    this.comboCount = (now - this.comboLastMs < 1100) ? this.comboCount + 1 : 1;
    this.comboLastMs = now;
    if (this.comboCount >= 3) {
      this.hitCombo.textContent = `x${this.comboCount}`;
      this.hitCombo.classList.toggle('hot', this.comboCount >= 6);
      this.hitCombo.classList.toggle('blaze', this.comboCount >= 10);
      this.hitCombo.classList.remove('hidden', 'hc-pop');
      void this.hitCombo.offsetWidth;
      this.hitCombo.classList.add('hc-pop');
    }
    if (this.comboHideTimer !== null) window.clearTimeout(this.comboHideTimer);
    this.comboHideTimer = window.setTimeout(() => this.resetCombo(), 1150);
  }

  private resetCombo() {
    this.comboCount = 0;
    this.hitCombo.classList.add('hidden');
    this.hitCombo.classList.remove('hot', 'blaze');
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

  /**
   * Populate the death recap line ("ELIMINATED BY {name} · {WEAPON}"). Hidden
   * for attacker-less deaths (falls) or the theoretical self-kill so we never
   * print "eliminated by YOU". A headshot kill is flagged on the weapon tag.
   */
  private showRecap(attackerId: string, weaponId: string, isHeadshot: boolean) {
    if (!attackerId || this.game.isLocalPlayer(attackerId)) {
      this.rcRecap.classList.add('hidden');
      return;
    }
    this.rcKiller.textContent = this.killerName(attackerId);
    this.rcWeapon.textContent = ` · ${weaponId.toUpperCase()}${isHeadshot ? ' · HS' : ''}`;
    this.rcRecap.classList.remove('hidden');
  }

  /** Friendly name for whoever killed us: a bot's callsign, or a short MP id.
   *  (Never the local player — guarded by the caller.) */
  private killerName(id: string): string {
    return this.game.displayNameFor(id);
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

