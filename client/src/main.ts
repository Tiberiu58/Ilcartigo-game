/**
 * ILCARTIGO entrypoint — DOM wiring for menu, HUD, selectors, lifecycle.
 *
 * Lifecycle:
 *   1. Page loads → Main Menu visible, game canvas behind it.
 *   2. PLAY / Practice Range → menu hides, mode is set, pointer lock requested.
 *   3. Esc / pointer-lock loss → in-game pause overlay shows.
 *   4. Quit to Menu → state preserved; main menu re-appears.
 *   5. Settings → modal page above main menu OR pause overlay. Esc returns
 *      to whichever called it.
 *
 * Persistent settings (all under the `ilc.*` localStorage prefix):
 *   ilc.fov ilc.sens ilc.class ilc.primary ilc.map ilc.gfx ilc.difficulty
 *   ilc.ch.color ilc.ch.size ilc.ch.thickness ilc.ch.gap ilc.ch.outline ilc.ch.dot
 */

import { Game } from './core/Game';
import { HUD } from './ui/HUD';
import { Announcer } from './ui/Announcer';
import { RampageFX } from './ui/RampageFX';
import { DamageDirection } from './ui/DamageDirection';
import { GunGame } from './modes/GunGame';
import { Onslaught, type OnslaughtResult } from './modes/Onslaught';
import { Duel, type DuelResult } from './modes/Duel';
import { ProgressionFX } from './ui/ProgressionFX';
import { Minimap } from './ui/Minimap';
import { Nameplates } from './ui/Nameplates';
import { MultiplayerSession } from './networking/MultiplayerSession';
import { CosmeticsUI } from './ui/CosmeticsUI';
import { ProfileUI } from './ui/ProfileUI';
import { CrateUI } from './ui/CrateUI';
import { Ads } from './ads/Ads';
import { AimLab, DRILLS, type AimLabResult, type DrillId } from './modes/AimLab';
import { ScorePopup } from './ui/ScorePopup';
import { preloadWeaponModels } from './weapons/WeaponModels';
import { LOGIN_REWARDS } from './account/Account';
import { WEAPON_LIBRARY, type WeaponId } from './weapons/Weapon';
import { weaponSkinsFor } from './account/Cosmetics';

// ─── Device gate — abort early on touch/mobile or browsers without pointer-lock.
// FPS games are unplayable without a mouse. Show a friendly notice instead of
// silently breaking. Override with ?nodetect=1 for dev/testing.
(() => {
  const override = new URLSearchParams(location.search).has('nodetect');
  if (override) return;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth < 900;
  const noPointerLock = !('requestPointerLock' in HTMLElement.prototype);
  // A precise pointer (mouse / trackpad) anywhere on the device means it's
  // playable even if it also has a touchscreen (hybrid laptops). iPads /
  // phones expose only a coarse pointer → no fine pointer → gated, even in
  // landscape where they're wide enough to dodge the isNarrow check (audit #11).
  const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  const touchOnly = hasTouch && !hasFinePointer;
  if ((hasTouch && isNarrow) || touchOnly || noPointerLock) {
    document.getElementById('mobile-gate')?.classList.remove('hidden');
    // Stop the rest of main.ts from running by throwing. The thrown error is
    // intentional — it short-circuits module evaluation so Game never starts.
    throw new Error('ILCARTIGO: desktop required');
  }
})();
import type { ClassId } from './classes/types';
import type { MapId } from './maps/Map';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const mainMenu = document.getElementById('main-menu')!;
const pauseOverlay = document.getElementById('pause-overlay')!;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const menuPlay = document.getElementById('menu-play') as HTMLButtonElement;
const menuOnline = document.getElementById('menu-online') as HTMLButtonElement;
const menuGungame = document.getElementById('menu-gungame') as HTMLButtonElement;
const menuTdm = document.getElementById('menu-tdm') as HTMLButtonElement;
const menuOnslaught = document.getElementById('menu-onslaught') as HTMLButtonElement;
const menuDuel = document.getElementById('menu-duel') as HTMLButtonElement;
const menuPractice = document.getElementById('menu-practice') as HTMLButtonElement;
const menuAimlab = document.getElementById('menu-aimlab') as HTMLButtonElement;
const menuSettings = document.getElementById('menu-settings') as HTMLButtonElement;
const menuAbout = document.getElementById('menu-about') as HTMLButtonElement;
const practiceBadge = document.getElementById('practice-badge')!;
const onlineBadge = document.getElementById('online-badge')!;
const onlineCount = document.getElementById('online-count')!;
const backToMenu = document.getElementById('back-to-menu') as HTMLButtonElement;
const pauseSettingsBtn = document.getElementById('pause-settings-btn') as HTMLButtonElement;
const settingsPage = document.getElementById('settings-page')!;
const settingsCloseBtn = document.getElementById('settings-close-btn') as HTMLButtonElement;
const fovSlider = document.getElementById('fov-slider') as HTMLInputElement;
const fovVal = document.getElementById('fov-val')!;
const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
const sensVal = document.getElementById('sens-val')!;
const dbgFps = document.getElementById('dbg-fps')!;
const dbgSpeed = document.getElementById('dbg-speed')!;
const dbgState = document.getElementById('dbg-state')!;
const dbgPos = document.getElementById('dbg-pos')!;

// Scoreboard (hold TAB).
const scoreboard = document.getElementById('scoreboard')!;
const sbBody = document.getElementById('sb-body')!;
const sbMode = document.getElementById('sb-mode')!;
const sbGoal = document.getElementById('sb-goal')!;
let scoreboardOpen = false;

const game = new Game(canvas);
game.aimLab = new AimLab(game);
game.onslaught = new Onslaught(game);
game.duel = new Duel(game);
const ui = new HUD(game);
const announcer = new Announcer(game.bus, game.audio, (id) => game.isLocalPlayer(id));
// "ON FIRE" rampage aura — driven by the Announcer's streak (single source).
const rampage = new RampageFX();
announcer.onStreakChange = (streak) => rampage.setStreak(streak);
// Skill-shot callouts — inspect the live player/weapon state at kill time.
announcer.resolveKillStyle = (e) => {
  // NO SCOPE: a sniper kill landed without being scoped.
  if (e.weaponId === 'sniper' && !game.inventory.isScoped) return 'noscope';
  // AIRBORNE: you were off the ground when the kill landed.
  if (game.player.state === 'air') return 'airborne';
  // LONGSHOT: the lethal hit was far from you.
  if (e.hitPoint && game.player.pos.distanceTo(e.hitPoint) >= 45) return 'longshot';
  return null;
};
const damageDir = new DamageDirection(game);
void damageDir;
// Progression spectacle — rank badges (HUD + menu), level-up banner, +XP popups.
const progression = new ProgressionFX(game.account, game.audio, game.bus, (id) => game.isLocalPlayer(id));
void progression;

// Tactical minimap / radar (top-right).
const minimap = new Minimap(game, document.getElementById('minimap') as HTMLCanvasElement);
void minimap;

// Floating enemy nameplates (callsign + HP bar) over solo bots.
const nameplates = new Nameplates(game);

// Floating "+10 XP" toast on each local frag (visible progression). The kill
// effect / announcer handle the splashier feedback; this is the running tally.
game.bus.on('kill', (e) => {
  if (game.isLocalPlayer(e.attackerId) && !game.isLocalPlayer(e.targetId)) {
    ScorePopup.pop('+10 XP', 'xp');
  }
});

// ─── Gun Game mode ─────────────────────────────────────────────────────────
// Self-contained weapon-ladder mode (solo vs bots for v1). The host adapter
// exposes just the three engine surfaces GunGame needs.
const gunGame = new GunGame(game.bus, {
  isLocalPlayer: (id) => game.isLocalPlayer(id),
  setPlayerPrimaryWeapon: (id) => game.setPlayerPrimaryWeapon(id),
  playSound: (id) => game.audio.play(id as Parameters<typeof game.audio.play>[0]),
});
const ggTicker = document.getElementById('gungame-ticker')!;
const ggTierEl = document.getElementById('gg-tier')!;
const ggTotalEl = document.getElementById('gg-total')!;
const ggWeaponEl = document.getElementById('gg-weapon')!;
const ggPipsEl = document.getElementById('gg-pips')!;

gunGame.onLocalTierChange = (tier, total, label) => {
  ggTierEl.textContent = String(tier + 1);   // display 1-based
  ggTotalEl.textContent = String(total);
  ggWeaponEl.textContent = label;
  // Pips: filled up to and including the current rung.
  ggPipsEl.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="gg-pip${i <= tier ? ' on' : ''}"></span>`).join('');
};
gunGame.onWin = (winnerId) => {
  // Reuse the post-match overlay; it reads matchKills for the scoreboard.
  game.matchEnded = true;
  game.onMatchEnded?.(winnerId);
};

// ─── Team Deathmatch ticker ────────────────────────────────────────────────
const tdmTicker = document.getElementById('tdm-ticker')!;
const tdmBlueEl = document.getElementById('tdm-blue-score')!;
const tdmRedEl = document.getElementById('tdm-red-score')!;
const tdmGoalEl = document.getElementById('tdm-goal')!;
tdmGoalEl.textContent = String(Game.TDM_GOAL);
let lastTdmScore = '';
function updateTdmTicker() {
  const s = `${game.teamScore[0]}-${game.teamScore[1]}`;
  if (s === lastTdmScore) return;
  lastTdmScore = s;
  tdmBlueEl.textContent = String(game.teamScore[0]);
  tdmRedEl.textContent = String(game.teamScore[1]);
}

// ─── Onslaught (wave survival) mode ────────────────────────────────────────
const onsTicker = document.getElementById('onslaught-ticker')!;
const onsWaveN = document.getElementById('ons-wave-n')!;
const onsEnemiesN = document.getElementById('ons-enemies-n')!;
const onsLives = document.getElementById('ons-lives')!;
const onsBanner = document.getElementById('onslaught-banner')!;
const onsBannerN = document.getElementById('onb-wave-n')!;
const onsBannerSub = document.getElementById('onb-sub')!;
const onsResults = document.getElementById('onslaught-results')!;
const onrWave = document.getElementById('onr-wave')!;
const onrKills = document.getElementById('onr-kills')!;
const onrBest = document.getElementById('onr-best')!;
const onrXp = document.getElementById('onr-xp')!;
const onrNewBest = document.getElementById('onr-newbest')!;
const onrRetry = document.getElementById('onr-retry') as HTMLButtonElement;
const onrQuit = document.getElementById('onr-quit') as HTMLButtonElement;
let onsBannerTimer = 0;

game.onslaught!.onState = (wave, lives, enemies) => {
  onsWaveN.textContent = String(wave);
  onsEnemiesN.textContent = String(enemies);
  onsLives.textContent = '♥'.repeat(Math.max(0, lives));
};
game.onslaught!.onWaveStart = (wave, count, isBoss) => {
  onsBannerN.textContent = String(wave);
  onsBannerSub.textContent = isBoss ? '☠ BOSS WAVE ☠' : `${count} incoming`;
  onsBanner.classList.toggle('boss', isBoss);
  // Re-trigger the pop animation by toggling the class off→on.
  onsBanner.classList.remove('hidden');
  onsBanner.style.animation = 'none';
  void onsBanner.offsetWidth;        // reflow so the animation restarts
  onsBanner.style.animation = '';
  game.audio.play(isBoss ? 'match_end' : 'spawn_protect');
  window.clearTimeout(onsBannerTimer);
  onsBannerTimer = window.setTimeout(() => onsBanner.classList.add('hidden'), isBoss ? 2200 : 1500);
};
game.onslaught!.onEnd = (r: OnslaughtResult) => {
  onsTicker.classList.add('hidden');
  onsBanner.classList.add('hidden');
  showOnslaughtResults(r);
};

function showOnslaughtResults(r: OnslaughtResult) {
  game.audio.play('match_end');
  game.input.exitPointerLock();
  onrWave.textContent = String(r.wave);
  onrKills.textContent = String(r.kills);
  onrBest.textContent = String(r.best);
  onrXp.textContent = `+${r.xpEarned}`;
  onrNewBest.classList.toggle('hidden', !r.isNewBest);
  onsResults.classList.remove('hidden');
  hud.classList.add('hidden');
  Ads.refreshSlot('onslaught');
}

function stopOnslaught() {
  if (game.onslaught?.active) game.onslaught.stop();
  window.clearTimeout(onsBannerTimer);
  onsTicker.classList.add('hidden');
  onsBanner.classList.add('hidden');
  onsResults.classList.add('hidden');
}

onrRetry.addEventListener('click', () => {
  onsResults.classList.add('hidden');
  hud.classList.remove('hidden');
  onsTicker.classList.remove('hidden');
  game.resetMatchScore();
  announcer.reset();
  game.onslaught!.start();
  game.input.requestPointerLock();
});
onrQuit.addEventListener('click', () => {
  onsResults.classList.add('hidden');
  quitToMenu();
});

// ─── Duel (1v1 gauntlet) mode ──────────────────────────────────────────────
const duelTicker = document.getElementById('duel-ticker')!;
const duelNoN = document.getElementById('duel-no-n')!;
const duelStreakN = document.getElementById('duel-streak-n')!;
const duelBestN = document.getElementById('duel-best-n')!;
const duelBanner = document.getElementById('duel-banner')!;
const duelBannerMain = document.getElementById('dub-main')!;
const duelBannerSub = document.getElementById('dub-sub')!;
const duelResults = document.getElementById('duel-results')!;
const durWins = document.getElementById('dur-wins')!;
const durFaced = document.getElementById('dur-faced')!;
const durBest = document.getElementById('dur-best')!;
const durXp = document.getElementById('dur-xp')!;
const durSub = document.getElementById('dur-sub')!;
const durNewBest = document.getElementById('dur-newbest')!;
const durRetry = document.getElementById('dur-retry') as HTMLButtonElement;
const durQuit = document.getElementById('dur-quit') as HTMLButtonElement;
let duelBannerTimer = 0;

function flashDuelBanner(main: string, sub: string, won: boolean, hold: number) {
  duelBannerMain.textContent = main;
  duelBannerSub.textContent = sub;
  duelBanner.classList.toggle('won', won);
  duelBanner.classList.remove('hidden');
  duelBanner.style.animation = 'none';
  void duelBanner.offsetWidth;   // reflow so the pop animation restarts
  duelBanner.style.animation = '';
  window.clearTimeout(duelBannerTimer);
  duelBannerTimer = window.setTimeout(() => duelBanner.classList.add('hidden'), hold);
}

game.duel!.onState = (duelNum, wins, best) => {
  duelNoN.textContent = String(duelNum);
  duelStreakN.textContent = String(wins);
  duelBestN.textContent = String(best);
};
game.duel!.onDuelStart = (_duelNum, rival, tier) => {
  flashDuelBanner(`VS ${rival.toUpperCase()}`, tier, false, 1500);
  game.audio.play('spawn_protect');
};
game.duel!.onDuelWon = (wins) => {
  flashDuelBanner('DUEL WON', `streak ${wins}`, true, 1400);
  game.audio.play('match_end');
};
game.duel!.onEnd = (r: DuelResult) => {
  duelTicker.classList.add('hidden');
  duelBanner.classList.add('hidden');
  showDuelResults(r);
};

function showDuelResults(r: DuelResult) {
  game.audio.play('match_end');
  game.input.exitPointerLock();
  durWins.textContent = String(r.wins);
  durFaced.textContent = String(r.duelsFaced);
  durBest.textContent = String(r.best);
  durXp.textContent = `+${r.xpEarned}`;
  durSub.textContent = r.wins > 0
    ? `${r.lastRival.toUpperCase()} ended your run`
    : `${r.lastRival.toUpperCase()} got the better of you`;
  durNewBest.classList.toggle('hidden', !r.isNewBest);
  duelResults.classList.remove('hidden');
  hud.classList.add('hidden');
  Ads.refreshSlot('duel');
}

function stopDuel() {
  if (game.duel?.active) game.duel.stop();
  window.clearTimeout(duelBannerTimer);
  duelTicker.classList.add('hidden');
  duelBanner.classList.add('hidden');
  duelResults.classList.add('hidden');
}

durRetry.addEventListener('click', () => {
  duelResults.classList.add('hidden');
  hud.classList.remove('hidden');
  duelTicker.classList.remove('hidden');
  game.resetMatchScore();
  announcer.reset();
  game.duel!.start();
  game.input.requestPointerLock();
});
durQuit.addEventListener('click', () => {
  duelResults.classList.add('hidden');
  quitToMenu();
});

// Restore persisted settings.
const savedFov = Number(localStorage.getItem('ilc.fov') ?? 90);
const savedSens = Number(localStorage.getItem('ilc.sens') ?? 0.5);
fovSlider.value = String(savedFov);
sensSlider.value = String(savedSens);
fovVal.textContent = String(savedFov);
sensVal.textContent = savedSens.toFixed(2);
game.setFov(savedFov);
game.setSensitivity(savedSens);

fovSlider.addEventListener('input', () => {
  const v = Number(fovSlider.value);
  fovVal.textContent = String(v);
  game.setFov(v);
  localStorage.setItem('ilc.fov', String(v));
});

sensSlider.addEventListener('input', () => {
  const v = Number(sensSlider.value);
  sensVal.textContent = v.toFixed(2);
  game.setSensitivity(v);
  localStorage.setItem('ilc.sens', String(v));
});

// ─── Minimap + speed-lines toggles (General tab) ────────────────────────────
const optMinimap = document.getElementById('opt-minimap') as HTMLInputElement;
const optSpeedlines = document.getElementById('opt-speedlines') as HTMLInputElement;

const savedMinimap = (localStorage.getItem('ilc.minimap') ?? 'true') === 'true';
optMinimap.checked = savedMinimap;
minimap.setEnabled(savedMinimap);
optMinimap.addEventListener('change', () => {
  minimap.setEnabled(optMinimap.checked);
  localStorage.setItem('ilc.minimap', String(optMinimap.checked));
});

const optNameplates = document.getElementById('opt-nameplates') as HTMLInputElement;
const savedNameplates = (localStorage.getItem('ilc.nameplates') ?? 'true') === 'true';
optNameplates.checked = savedNameplates;
nameplates.setEnabled(savedNameplates);
optNameplates.addEventListener('change', () => {
  nameplates.setEnabled(optNameplates.checked);
  localStorage.setItem('ilc.nameplates', String(optNameplates.checked));
});

let speedLinesEnabled = (localStorage.getItem('ilc.speedlines') ?? 'true') === 'true';
optSpeedlines.checked = speedLinesEnabled;
document.body.classList.toggle('no-speedlines', !speedLinesEnabled);
optSpeedlines.addEventListener('change', () => {
  speedLinesEnabled = optSpeedlines.checked;
  document.body.classList.toggle('no-speedlines', !speedLinesEnabled);
  localStorage.setItem('ilc.speedlines', String(speedLinesEnabled));
});

// ─── Crosshair customizer ───────────────────────────────────────────────────
// All controls write to CSS custom properties on documentElement. The in-game
// crosshair, the preview crosshair, and any future scope reticle all read
// from the same vars.
const chColor = document.getElementById('ch-color') as HTMLInputElement;
const chColorVal = document.getElementById('ch-color-val')!;
const chSize = document.getElementById('ch-size') as HTMLInputElement;
const chSizeVal = document.getElementById('ch-size-val')!;
const chThickness = document.getElementById('ch-thickness') as HTMLInputElement;
const chThicknessVal = document.getElementById('ch-thickness-val')!;
const chGapBase = document.getElementById('ch-gap-base') as HTMLInputElement;
const chGapBaseVal = document.getElementById('ch-gap-base-val')!;
const chOutline = document.getElementById('ch-outline') as HTMLInputElement;
const chDot = document.getElementById('ch-dot') as HTMLInputElement;

function applyChVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

// Restore saved crosshair settings (defaults match the CSS :root values).
const savedChColor = localStorage.getItem('ilc.ch.color') ?? '#f5d442';
const savedChSize = Number(localStorage.getItem('ilc.ch.size') ?? 8);
const savedChThickness = Number(localStorage.getItem('ilc.ch.thickness') ?? 2);
const savedChGap = Number(localStorage.getItem('ilc.ch.gap') ?? 0);
const savedChOutline = (localStorage.getItem('ilc.ch.outline') ?? 'true') === 'true';
const savedChDot = (localStorage.getItem('ilc.ch.dot') ?? 'true') === 'true';

chColor.value = savedChColor;
chColorVal.textContent = savedChColor;
chSize.value = String(savedChSize);
chSizeVal.textContent = String(savedChSize);
chThickness.value = String(savedChThickness);
chThicknessVal.textContent = String(savedChThickness);
chGapBase.value = String(savedChGap);
chGapBaseVal.textContent = String(savedChGap);
chOutline.checked = savedChOutline;
chDot.checked = savedChDot;

applyChVar('--ch-color', savedChColor);
applyChVar('--ch-size', `${savedChSize}px`);
applyChVar('--ch-thickness', `${savedChThickness}px`);
applyChVar('--ch-gap-base', `${savedChGap}px`);
applyChVar('--ch-outline', savedChOutline ? '1' : '0');
applyChVar('--ch-dot', savedChDot ? 'block' : 'none');

chColor.addEventListener('input', () => {
  chColorVal.textContent = chColor.value;
  applyChVar('--ch-color', chColor.value);
  localStorage.setItem('ilc.ch.color', chColor.value);
});
chSize.addEventListener('input', () => {
  chSizeVal.textContent = chSize.value;
  applyChVar('--ch-size', `${chSize.value}px`);
  localStorage.setItem('ilc.ch.size', chSize.value);
});
chThickness.addEventListener('input', () => {
  chThicknessVal.textContent = chThickness.value;
  applyChVar('--ch-thickness', `${chThickness.value}px`);
  localStorage.setItem('ilc.ch.thickness', chThickness.value);
});
chGapBase.addEventListener('input', () => {
  chGapBaseVal.textContent = chGapBase.value;
  applyChVar('--ch-gap-base', `${chGapBase.value}px`);
  localStorage.setItem('ilc.ch.gap', chGapBase.value);
});
chOutline.addEventListener('change', () => {
  applyChVar('--ch-outline', chOutline.checked ? '1' : '0');
  localStorage.setItem('ilc.ch.outline', String(chOutline.checked));
});
chDot.addEventListener('change', () => {
  applyChVar('--ch-dot', chDot.checked ? 'block' : 'none');
  localStorage.setItem('ilc.ch.dot', String(chDot.checked));
});

// ─── Crosshair presets ──────────────────────────────────────────────────────
// One-click crosshair packs (Krunker-style). Each preset fills every control,
// updates the live + preview crosshair, and persists — so it behaves exactly
// as if the player had dialed each slider in by hand.
interface ChPreset {
  color: string; size: number; thickness: number; gap: number;
  outline: boolean; dot: boolean;
}
const CH_PRESETS: Record<string, ChPreset> = {
  classic: { color: '#f5d442', size: 8,  thickness: 2, gap: 0,  outline: true,  dot: true  },
  dot:     { color: '#ffffff', size: 2,  thickness: 2, gap: 20, outline: true,  dot: true  },
  cross:   { color: '#f5d442', size: 10, thickness: 2, gap: 4,  outline: true,  dot: false },
  tight:   { color: '#ff3b3b', size: 6,  thickness: 2, gap: 0,  outline: true,  dot: true  },
  open:    { color: '#ffffff', size: 12, thickness: 3, gap: 8,  outline: true,  dot: false },
  sniper:  { color: '#00ff66', size: 4,  thickness: 1, gap: 14, outline: true,  dot: true  },
  pro:     { color: '#00ff66', size: 7,  thickness: 2, gap: 3,  outline: false, dot: false },
  cyan:    { color: '#4ac8ff', size: 9,  thickness: 2, gap: 2,  outline: true,  dot: true  },
};

function applyCrosshairPreset(p: ChPreset) {
  chColor.value = p.color;        chColorVal.textContent = p.color;
  chSize.value = String(p.size);  chSizeVal.textContent = String(p.size);
  chThickness.value = String(p.thickness); chThicknessVal.textContent = String(p.thickness);
  chGapBase.value = String(p.gap); chGapBaseVal.textContent = String(p.gap);
  chOutline.checked = p.outline;
  chDot.checked = p.dot;

  applyChVar('--ch-color', p.color);
  applyChVar('--ch-size', `${p.size}px`);
  applyChVar('--ch-thickness', `${p.thickness}px`);
  applyChVar('--ch-gap-base', `${p.gap}px`);
  applyChVar('--ch-outline', p.outline ? '1' : '0');
  applyChVar('--ch-dot', p.dot ? 'block' : 'none');

  localStorage.setItem('ilc.ch.color', p.color);
  localStorage.setItem('ilc.ch.size', String(p.size));
  localStorage.setItem('ilc.ch.thickness', String(p.thickness));
  localStorage.setItem('ilc.ch.gap', String(p.gap));
  localStorage.setItem('ilc.ch.outline', String(p.outline));
  localStorage.setItem('ilc.ch.dot', String(p.dot));
}

document.querySelectorAll<HTMLButtonElement>('#ch-presets .ch-preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = CH_PRESETS[btn.dataset.preset ?? 'classic'];
    if (preset) applyCrosshairPreset(preset);
    game.audio.play('ui_click');
  });
});

// ─── Audio settings ─────────────────────────────────────────────────────────
const audioMaster = document.getElementById('audio-master') as HTMLInputElement;
const audioMasterVal = document.getElementById('audio-master-val')!;
const audioSfx = document.getElementById('audio-sfx') as HTMLInputElement;
const audioSfxVal = document.getElementById('audio-sfx-val')!;
const audioTestBtn = document.getElementById('audio-test-btn') as HTMLButtonElement;

audioMaster.value = String(game.audio.masterVolume);
audioMasterVal.textContent = `${Math.round(game.audio.masterVolume * 100)}%`;
audioSfx.value = String(game.audio.sfxVolume);
audioSfxVal.textContent = `${Math.round(game.audio.sfxVolume * 100)}%`;

audioMaster.addEventListener('input', () => {
  const v = Number(audioMaster.value);
  game.audio.setMasterVolume(v);
  audioMasterVal.textContent = `${Math.round(v * 100)}%`;
});
audioSfx.addEventListener('input', () => {
  const v = Number(audioSfx.value);
  game.audio.setSfxVolume(v);
  audioSfxVal.textContent = `${Math.round(v * 100)}%`;
});
audioTestBtn.addEventListener('click', () => {
  game.audio.play('ui_click');
});

// ─── Graphics quality ───────────────────────────────────────────────────────
const gfxSeg = document.getElementById('gfx-quality')!;
const savedGfx = (localStorage.getItem('ilc.gfx') ?? 'medium') as 'low' | 'medium' | 'high';
const gfxButtons = gfxSeg.querySelectorAll<HTMLButtonElement>('button[data-q]');
gfxButtons.forEach((b) => b.classList.toggle('selected', b.dataset.q === savedGfx));
game.setGraphicsQuality(savedGfx);
gfxButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const q = (btn.dataset.q ?? 'medium') as 'low' | 'medium' | 'high';
    gfxButtons.forEach((b) => b.classList.toggle('selected', b === btn));
    game.setGraphicsQuality(q);
    localStorage.setItem('ilc.gfx', q);
  });
});

function startGame(mode: 'combat' | 'practice' | 'gungame' | 'tdm' | 'onslaught' | 'duel' = 'combat') {
  stopAimLab();
  stopOnslaught();
  stopDuel();
  // Tear down any active MP session before going single-player.
  if (game.mp) {
    game.mp.disconnect();
    game.mp = null;
    onlineBadge.classList.add('hidden');
  }
  game.setMode(mode);
  announcer.reset();

  // Gun Game: start a fresh ladder for the player + all active bots, and show
  // the tier ticker. Other modes hide it. (Started AFTER setMode so the player
  // weapon swap lands on the live inventory.)
  if (mode === 'gungame') {
    const participants = [game.localPlayerId(), ...game.bots.filter((b) => b.active).map((b) => b.id)];
    gunGame.start(participants);
    ggTicker.classList.remove('hidden');
  } else {
    ggTicker.classList.add('hidden');
  }

  // Team Deathmatch: show the BLUE-vs-RED ticker; reset its cached display.
  if (mode === 'tdm') {
    lastTdmScore = '';
    updateTdmTicker();
    tdmTicker.classList.remove('hidden');
  } else {
    tdmTicker.classList.add('hidden');
  }

  // Onslaught: hand the bot roster to the survival controller + show its ticker.
  // Started AFTER setMode so the base bots are parked on the live map.
  if (mode === 'onslaught') {
    game.onslaught!.start();
    onsTicker.classList.remove('hidden');
  } else {
    onsTicker.classList.add('hidden');
  }

  // Duel: hand the roster to the gauntlet controller + show its ticker.
  if (mode === 'duel') {
    game.duel!.start();
    duelTicker.classList.remove('hidden');
  } else {
    duelTicker.classList.add('hidden');
  }

  practiceBadge.classList.toggle('hidden', mode !== 'practice');
  mainMenu.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  // Pointer-lock request must come from a user gesture — the click counts.
  game.input.requestPointerLock();
}

/**
 * Connect to the MP server and drop into the FFA room. Sandstone-only for v1.
 * Bots are skipped while game.mp is non-null (Game.tick gates on it).
 */
function startOnline() {
  stopAimLab();
  stopOnslaught();
  stopDuel();
  // Make sure single-player bots aren't running in the background. Don't
  // pre-pick the map — MultiplayerSession.handleWelcome adopts whichever
  // map the server is running, and preseting here would force a flicker
  // (build Sandstone → tear down → build Industrial) when the server is
  // on Industrial.
  game.setMode('combat');
  announcer.reset();
  // Build the MP session bound to the existing Game.
  const session = new MultiplayerSession(game);
  session.onWelcome = (m) => {
    onlineCount.textContent = String(m.players.length);
    onlineBadge.classList.remove('hidden');
  };
  session.onDisconnect = (r) => {
    console.warn('[mp] disconnected:', r);
    onlineBadge.classList.add('hidden');
    game.mp = null;
    // Bring single-player bots back online (they were hidden on connect).
    game.onMpChanged();
  };
  session.onMatchReset = () => {
    // Server started a fresh match. Dismiss the post-match overlay (whether or
    // not THIS client clicked Play Again) and drop back into play.
    hidePostMatch();
    announcer.reset();
    pmPlayAgain.disabled = false;
    pmPlayAgain.textContent = 'Play Again';
    game.input.requestPointerLock();
  };
  game.mp = session;
  // Hide/unregister single-player bots — they're not part of the MP scene.
  // Without this they stay rendered + damageable in MP (early-out in setMode
  // means the previous 'combat'→'combat' transition didn't disable them).
  game.onMpChanged();
  session.connect();
  // Poll-update the player count off the remotes map (cheap; runs at the
  // game's frame rate via game.onFrame).
  practiceBadge.classList.add('hidden');
  ggTicker.classList.add('hidden');
  tdmTicker.classList.add('hidden');
  mainMenu.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  game.input.requestPointerLock();
}

function quitToMenu() {
  stopAimLab();
  stopOnslaught();
  stopDuel();
  if (game.mp) {
    game.mp.disconnect();
    game.mp = null;
    // Re-enable bots so the next solo Play vs Bots session works.
    game.onMpChanged();
  }
  game.input.exitPointerLock();
  pauseOverlay.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  hud.classList.add('hidden');
  practiceBadge.classList.add('hidden');
  onlineBadge.classList.add('hidden');
  ggTicker.classList.add('hidden');
  tdmTicker.classList.add('hidden');
  onsTicker.classList.add('hidden');
  duelTicker.classList.add('hidden');
  refreshOnslaughtButton();
  refreshDuelButton();
  // Restore the player's chosen loadout weapon (Gun Game overwrote it).
  game.setPlayerPrimaryWeapon((localStorage.getItem('ilc.primary') ?? 'ar') as WeaponId);
  // Refresh the loadout card so mastery progress earned this match shows.
  renderWeaponStats((localStorage.getItem('ilc.primary') ?? 'ar') as WeaponId);
}

// Class selector. Selection persists in localStorage; takes effect immediately
// (and on respawn via Game.applyClassPassives).
const classBtns = document.querySelectorAll<HTMLButtonElement>('.class-btn');
const savedClass = (localStorage.getItem('ilc.class') ?? 'vanguard') as ClassId;
classBtns.forEach((btn) => {
  const id = (btn.dataset.class ?? 'vanguard') as ClassId;
  btn.classList.toggle('selected', id === savedClass);
  btn.addEventListener('click', () => {
    classBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    game.setClass(id);
    localStorage.setItem('ilc.class', id);
    // If we're in a live MP session, the server still thinks we're the old
    // class. Tell it the new pick or our ability triggers get rejected.
    game.mp?.sendHello();
  });
});
// Apply saved class on boot if it differs from the runner's initial pick.
if (savedClass !== game.abilities.classId) {
  game.setClass(savedClass);
}

// Map selector. Sandstone (open desert) and Industrial (rusty warehouse) are
// both fully playable; Practice Range is reached via its own button.
const mapBtns = document.querySelectorAll<HTMLButtonElement>('.loadout-btn[data-map]');
const savedMap = (localStorage.getItem('ilc.map') ?? 'sandstone') as MapId;
mapBtns.forEach((btn) => {
  const id = (btn.dataset.map ?? 'sandstone') as MapId;
  btn.classList.toggle('selected', id === savedMap);
  btn.addEventListener('click', () => {
    mapBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    game.setCombatMap(id);
    localStorage.setItem('ilc.map', id);
  });
});
// Recover from a corrupt localStorage value. Practice is reached via its own
// button, so it isn't a valid *combat* map selection.
const COMBAT_MAPS: MapId[] = ['sandstone', 'industrial', 'cobalt', 'overpass', 'frostline'];
if (!COMBAT_MAPS.includes(savedMap)) {
  localStorage.setItem('ilc.map', 'sandstone');
}
game.setCombatMap(COMBAT_MAPS.includes(savedMap) ? savedMap : 'sandstone');

// Bot difficulty selector — Easy / Normal / Hard. Scales the whole bot roster's
// AI feel (reaction, aim, lead, fire cadence). Persisted; applies live.
const diffBtns = document.querySelectorAll<HTMLButtonElement>('.loadout-btn[data-diff]');
const savedDiff = (localStorage.getItem('ilc.difficulty') ?? 'normal') as 'easy' | 'normal' | 'hard';
diffBtns.forEach((btn) => {
  const lvl = (btn.dataset.diff ?? 'normal') as 'easy' | 'normal' | 'hard';
  btn.classList.toggle('selected', lvl === savedDiff);
  btn.addEventListener('click', () => {
    diffBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    game.setDifficulty(lvl);
    localStorage.setItem('ilc.difficulty', lvl);
    game.audio.play('ui_click');
  });
});
game.setDifficulty(savedDiff === 'easy' || savedDiff === 'hard' ? savedDiff : 'normal');

// Weapon identity card — archetype + normalized stat bars, so the 7 guns read
// as distinct picks (a Krunker loadout staple). Pure UI off WEAPON_LIBRARY.
const WEAPON_ARCHETYPE: Record<WeaponId, string> = {
  ar: 'Versatile Rifle',
  smg: 'Run & Gun',
  sniper: 'One-Shot Sniper',
  shotgun: 'Close-Range Brawler',
  marksman: 'Precision DMR',
  lmg: 'Suppressive Fire',
  railgun: 'Piercing Beam',
  pistol: 'Sidearm',
};
const wsName = document.getElementById('ws-name')!;
const wsArch = document.getElementById('ws-arch')!;
const wsDmg = document.getElementById('ws-dmg') as HTMLElement;
const wsRof = document.getElementById('ws-rof') as HTMLElement;
const wsRange = document.getElementById('ws-range') as HTMLElement;
const wsMag = document.getElementById('ws-mag') as HTMLElement;
const wsMasteryKills = document.getElementById('ws-mastery-kills')!;
const wsMasteryNext = document.getElementById('ws-mastery-next')!;
const wsMasteryFill = document.getElementById('ws-mastery-fill') as HTMLElement;
function renderWeaponStats(id: WeaponId) {
  const c = WEAPON_LIBRARY[id];
  // Per-trigger-pull damage (shotgun fires multiple pellets at once).
  const dmg = c.baseDamage * (c.pellets ?? 1);
  const pct = (v: number, max: number) => `${Math.max(6, Math.min(100, Math.round((v / max) * 100)))}%`;
  wsName.textContent = c.displayName;
  wsArch.textContent = WEAPON_ARCHETYPE[id];
  wsDmg.style.width = pct(dmg, 95);            // shotgun ~90 maxes it
  wsRof.style.width = pct(c.fireRate, 15);     // SMG 14 near max
  wsRange.style.width = pct(c.falloffEnd, 150); // sniper saturates
  wsMag.style.width = pct(c.magSize, 60);      // LMG 60 maxes it

  // Mastery progress — lifetime kills toward the next mastery skin.
  const kills = game.account.weaponKillsFor(id);
  wsMasteryKills.textContent = String(kills);
  const tiers = weaponSkinsFor(id).filter((s) => s.killReq > 0).sort((a, b) => a.killReq - b.killReq);
  const next = tiers.find((s) => kills < s.killReq);
  const prevReq = [...tiers].reverse().find((s) => kills >= s.killReq)?.killReq ?? 0;
  if (next) {
    wsMasteryNext.textContent = `${next.displayName} · ${kills}/${next.killReq}`;
    const span = next.killReq - prevReq;
    wsMasteryFill.style.width = `${Math.max(4, Math.min(100, Math.round(((kills - prevReq) / span) * 100)))}%`;
  } else {
    wsMasteryNext.textContent = tiers.length ? '★ all skins unlocked' : '—';
    wsMasteryFill.style.width = tiers.length ? '100%' : '0%';
  }
}

// Loadout selector — clicking a weapon button updates the primary slot and
// triggers a viewmodel swap so the player sees the change preview on PLAY.
const loadoutBtns = document.querySelectorAll<HTMLButtonElement>('.loadout-btn:not([data-map]):not([data-diff])');
const savedPrimary = (localStorage.getItem('ilc.primary') ?? 'ar') as WeaponId;
loadoutBtns.forEach((btn) => {
  const id = (btn.dataset.weapon ?? 'ar') as WeaponId;
  btn.classList.toggle('selected', id === savedPrimary);
  btn.addEventListener('click', () => {
    loadoutBtns.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    const newId = game.inventory.setPrimary(id);
    game.viewmodel.swapTo(newId);
    localStorage.setItem('ilc.primary', newId);
    renderWeaponStats(newId);
    game.mp?.sendHello();
  });
});
// Apply the saved loadout on boot.
if (savedPrimary !== 'ar') {
  game.inventory.setPrimary(savedPrimary);
  game.viewmodel.swapTo(savedPrimary);
}
renderWeaponStats(savedPrimary);

menuPlay.addEventListener('click', () => startGame('combat'));
menuOnline.addEventListener('click', () => startOnline());
menuGungame.addEventListener('click', () => startGame('gungame'));
menuTdm.addEventListener('click', () => startGame('tdm'));
menuOnslaught.addEventListener('click', () => startGame('onslaught'));
menuDuel.addEventListener('click', () => startGame('duel'));
menuPractice.addEventListener('click', () => startGame('practice'));
menuAimlab.addEventListener('click', () => openAimlabSelect());
backToMenu.addEventListener('click', quitToMenu);

// ─── Aim Lab (Target Rush) ─────────────────────────────────────────────────
const aimlabSelect = document.getElementById('aimlab-select')!;
const alsBackBtn = document.getElementById('als-back') as HTMLButtonElement;
const aimlabHud = document.getElementById('aimlab-hud')!;
const alTime = document.getElementById('al-time')!;
const alScore = document.getElementById('al-score')!;
const alAcc = document.getElementById('al-acc')!;
const aimlabResults = document.getElementById('aimlab-results')!;
const alrDrill = document.getElementById('alr-drill')!;
const alrScore = document.getElementById('alr-score')!;
const alrAcc = document.getElementById('alr-acc')!;
const alrBest = document.getElementById('alr-best')!;
const alrXp = document.getElementById('alr-xp')!;
const alrNewbest = document.getElementById('alr-newbest')!;
const alrRetry = document.getElementById('alr-retry') as HTMLButtonElement;
const alrQuit = document.getElementById('alr-quit') as HTMLButtonElement;

/** Last drill played — drives the results card's Retry button. */
let lastDrill: DrillId = 'rush';

/** Refresh the Aim Lab menu button with the best across drills, so players see
 *  their target to beat without entering the mode. */
function refreshAimlabButton() {
  const best = Math.max(game.aimLab?.bestFor('rush') ?? 0, game.aimLab?.bestFor('precision') ?? 0);
  menuAimlab.textContent = best > 0 ? `✦ Aim Lab · best ${best}` : '✦ Aim Lab (Target Rush)';
}
refreshAimlabButton();

/** Surface the survival personal best on the Onslaught menu button. */
function refreshOnslaughtButton() {
  const best = Onslaught.personalBest();
  menuOnslaught.textContent = best > 0 ? `☠ Onslaught · best wave ${best}` : '☠ Onslaught (Survival)';
}
refreshOnslaughtButton();

/** Surface the duel win-streak personal best on the Duel menu button. */
function refreshDuelButton() {
  const best = Duel.personalBest();
  menuDuel.textContent = best > 0 ? `🎯 Duel · best streak ${best}` : '🎯 Duel (1v1 Gauntlet)';
}
refreshDuelButton();

/** Show the drill picker (from the main menu). */
function openAimlabSelect() {
  stopAimLab();
  for (const id of Object.keys(DRILLS) as DrillId[]) {
    const el = document.getElementById(`als-best-${id}`);
    if (el) el.textContent = String(game.aimLab?.bestFor(id) ?? 0);
  }
  mainMenu.classList.add('hidden');
  aimlabSelect.classList.remove('hidden');
  game.audio.play('ui_click');
}
function closeAimlabSelect() {
  aimlabSelect.classList.add('hidden');
}
aimlabSelect.querySelectorAll<HTMLButtonElement>('.als-card').forEach((card) => {
  card.addEventListener('click', () => {
    const drill = (card.dataset.drill ?? 'rush') as DrillId;
    closeAimlabSelect();
    startAimLab(drill);
  });
});
alsBackBtn.addEventListener('click', () => { closeAimlabSelect(); quitToMenu(); });

game.aimLab!.onTick = (timeLeft, score, accuracy) => {
  alTime.textContent = timeLeft.toFixed(1);
  alTime.classList.toggle('al-low', timeLeft <= 10);
  alScore.textContent = String(score);
  alAcc.textContent = `${Math.round(accuracy * 100)}%`;
};
game.aimLab!.onEnd = (r: AimLabResult) => {
  aimlabHud.classList.add('hidden');
  showAimLabResults(r);
};

/** Stop any running Aim Lab run and hide all of its UI. Safe to call anytime. */
function stopAimLab() {
  if (game.aimLab?.active) game.aimLab.stop();
  aimlabSelect.classList.add('hidden');
  aimlabHud.classList.add('hidden');
  aimlabResults.classList.add('hidden');
}

/** Launch (or restart) a drill run on the Practice arena. */
function startAimLab(drill: DrillId = 'rush') {
  lastDrill = drill;
  // Leave any MP session first.
  if (game.mp) {
    game.mp.disconnect();
    game.mp = null;
    onlineBadge.classList.add('hidden');
    game.onMpChanged();
  }
  hidePostMatch();
  aimlabSelect.classList.add('hidden');
  aimlabResults.classList.add('hidden');

  // Practice map (no bots), then drop the player into the aim arena.
  game.setMode('practice');
  announcer.reset();
  const c = game.aimLab!.arenaCenter;
  game.player.setPosition(c.x, c.y, c.z);

  game.aimLab!.start(drill);

  practiceBadge.classList.add('hidden');
  aimlabHud.classList.remove('hidden');
  mainMenu.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  game.input.requestPointerLock();
}

function showAimLabResults(r: AimLabResult) {
  game.audio.play('match_end');
  alrDrill.textContent = r.drillName;
  alrScore.textContent = String(r.score);
  alrAcc.textContent = `${Math.round(r.accuracy * 100)}%`;
  alrBest.textContent = String(r.best);
  alrXp.textContent = `+${r.xpEarned}`;
  alrNewbest.classList.toggle('hidden', !r.isNewBest);
  aimlabResults.classList.remove('hidden');
  hud.classList.add('hidden');
  refreshAimlabButton();
  Ads.refreshSlot('aimlab');
}

alrRetry.addEventListener('click', () => {
  aimlabResults.classList.add('hidden');
  startAimLab(lastDrill);
});
alrQuit.addEventListener('click', () => {
  aimlabResults.classList.add('hidden');
  quitToMenu();
});

// Resume: re-acquire pointer lock without re-running setMode (that would
// rebuild the map). The lock-change handler hides the pause overlay.
playBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  game.input.requestPointerLock();
});

// ─── Settings page lifecycle ────────────────────────────────────────────────
// Two callers: main menu Settings button, in-game pause Settings button.
// When the page closes (× button or Esc), we return to whichever called it.
type SettingsCaller = 'menu' | 'pause';
let settingsCaller: SettingsCaller = 'menu';

function openSettings(from: SettingsCaller) {
  settingsCaller = from;
  settingsPage.classList.remove('hidden');
}
function closeSettings() {
  settingsPage.classList.add('hidden');
  // We never auto-open the pause overlay from here — if the caller was 'pause',
  // the pause overlay is already underneath (we only added settings on top).
  // If the caller was 'menu', the main menu is still under us.
  if (settingsCaller === 'pause' && pauseOverlay.classList.contains('hidden')) {
    pauseOverlay.classList.remove('hidden');
  }
}

menuSettings.addEventListener('click', () => openSettings('menu'));
pauseSettingsBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');         // tuck pause underneath
  openSettings('pause');
});
settingsCloseBtn.addEventListener('click', closeSettings);

// Esc handling: when settings is open, Esc closes it instead of bubbling to
// pointer-lock change. Pointer-lock is already released (we're in a menu
// state), so Esc here is purely about UI navigation.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!settingsPage.classList.contains('hidden')) {
    e.preventDefault();
    closeSettings();
  }
});

// Scoreboard — hold TAB to show, release to hide. Only while actually in a
// game (HUD visible, not in a menu). preventDefault stops the browser from
// cycling focus. Repeated keydown events (held key) are ignored after the first.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Tab') return;
  // Don't hijack Tab while a menu/settings is focused.
  if (!mainMenu.classList.contains('hidden') || !settingsPage.classList.contains('hidden')) return;
  e.preventDefault();
  if (!scoreboardOpen) {
    scoreboardOpen = true;
    renderScoreboard();
    scoreboard.classList.remove('hidden');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code !== 'Tab') return;
  if (scoreboardOpen) {
    scoreboardOpen = false;
    scoreboard.classList.add('hidden');
  }
});

/** Friendly display name for a participant id (solo bots, MP socket ids, you). */
function participantName(id: string): string {
  if (game.isLocalPlayer(id)) return playerName();
  const bot = game.bots.find((b) => b.id === id);
  if (bot) return bot.name;
  // MP remote: short socket id.
  return id.length <= 8 ? id.toUpperCase() : id.slice(0, 6).toUpperCase();
}

/** The local player's chosen handle (from the account), or 'You' if unset. */
function playerName(): string {
  return game.account.name;
}

/**
 * Render the scoreboard from the current match tallies. Unifies solo + MP:
 * we gather every participant id we know about (bots, remotes, ourselves,
 * plus anyone in the kill/death maps) so the board is complete even before
 * anyone scores. Kills/deaths come from game.matchKills/matchDeaths, which in
 * MP are kept authoritative by the server (snapshot kills + MatchOver).
 */
function renderScoreboard() {
  if (game.mode === 'tdm' && !game.mp) {
    renderTdmScoreboard();
    return;
  }
  sbMode.textContent = game.mp ? 'Free-for-All · Online' : (game.mode === 'practice' ? 'Practice' : 'Free-for-All · Bots');
  sbGoal.textContent = String(Game.MATCH_KILL_GOAL);

  const ids = new Set<string>();
  // Always include the local player.
  ids.add(game.localPlayerId());
  // Solo bots (only active ones — TDM-only bots are dormant in FFA/Gun Game).
  if (!game.mp) for (const b of game.bots) if (b.active) ids.add(b.id);
  // MP remotes.
  if (game.mp) for (const id of game.mp.remoteIds) ids.add(id);
  // Anyone who already has a tally.
  game.matchKills.forEach((_, k) => ids.add(k));
  game.matchDeaths.forEach((_, k) => ids.add(k));

  type Row = { id: string; kills: number; deaths: number };
  const rows: Row[] = [];
  for (const id of ids) {
    rows.push({ id, kills: game.matchKills.get(id) ?? 0, deaths: game.matchDeaths.get(id) ?? 0 });
  }
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  sbBody.innerHTML = rows.map((r, i) => {
    const me = game.isLocalPlayer(r.id);
    const kd = r.deaths === 0 ? r.kills.toFixed(1) : (r.kills / r.deaths).toFixed(2);
    const lead = i === 0 && r.kills > 0 ? ' sb-lead' : '';
    return `<div class="sb-row${me ? ' sb-me' : ''}${lead}">
      <span class="sb-rank">${i + 1}</span>
      <span class="sb-name">${participantName(r.id)}</span>
      <span class="sb-k">${r.kills}</span>
      <span class="sb-d">${r.deaths}</span>
      <span class="sb-kd">${kd}</span>
    </div>`;
  }).join('');
}

/**
 * Team Deathmatch scoreboard — two team blocks (BLUE then RED), each with a
 * team-frag header and its members sorted by kills, the local player
 * highlighted. Reads game.teamScore + per-player matchKills/matchDeaths.
 */
function renderTdmScoreboard() {
  sbMode.textContent = 'Team Deathmatch · Bots';
  sbGoal.textContent = String(Game.TDM_GOAL);

  type Row = { id: string; kills: number; deaths: number };
  const teams: [Row[], Row[]] = [[], []];
  const ids = new Set<string>();
  ids.add(game.localPlayerId());
  for (const b of game.bots) if (b.active) ids.add(b.id);
  game.matchKills.forEach((_, k) => ids.add(k));
  game.matchDeaths.forEach((_, k) => ids.add(k));
  for (const id of ids) {
    const row = { id, kills: game.matchKills.get(id) ?? 0, deaths: game.matchDeaths.get(id) ?? 0 };
    teams[game.teamOf(id)].push(row);
  }
  for (const t of teams) t.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  const block = (team: 0 | 1) => {
    const label = team === 0 ? 'BLUE' : 'RED';
    const cls = team === 0 ? 'sb-team-blue' : 'sb-team-red';
    const head = `<div class="sb-team-head ${cls}"><span>${label} TEAM</span><span class="sb-team-score">${game.teamScore[team]}</span></div>`;
    const rows = teams[team].map((r) => {
      const me = game.isLocalPlayer(r.id);
      const kd = r.deaths === 0 ? r.kills.toFixed(1) : (r.kills / r.deaths).toFixed(2);
      return `<div class="sb-row${me ? ' sb-me' : ''}">
        <span class="sb-rank ${cls}">●</span>
        <span class="sb-name">${participantName(r.id)}</span>
        <span class="sb-k">${r.kills}</span>
        <span class="sb-d">${r.deaths}</span>
        <span class="sb-kd">${kd}</span>
      </div>`;
    }).join('');
    return head + rows;
  };

  sbBody.innerHTML = block(0) + block(1);
}

// Tab nav inside the settings page.
const settingsTabs = settingsPage.querySelectorAll<HTMLButtonElement>('.settings-tab');
const settingsPanes = settingsPage.querySelectorAll<HTMLElement>('.settings-pane');
settingsTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const id = tab.dataset.tab;
    settingsTabs.forEach((t) => t.classList.toggle('selected', t === tab));
    settingsPanes.forEach((p) => p.classList.toggle('selected', p.dataset.pane === id));
  });
});

menuAbout.addEventListener('click', () => {
  window.open('#about', '_self');
});

// ─── First-run "How to Play" card ──────────────────────────────────────────
const howtoOverlay = document.getElementById('howto-overlay')!;
const howtoDismiss = document.getElementById('howto-dismiss') as HTMLButtonElement;
const menuHowto = document.getElementById('menu-howto') as HTMLButtonElement;
const HOWTO_SEEN_KEY = 'ilc.seenHowto';

function showHowto() { howtoOverlay.classList.remove('hidden'); }
function hideHowto() {
  howtoOverlay.classList.add('hidden');
  localStorage.setItem(HOWTO_SEEN_KEY, '1');
}
howtoDismiss.addEventListener('click', () => { hideHowto(); game.audio.play('ui_click'); });
menuHowto.addEventListener('click', () => { showHowto(); game.audio.play('ui_click'); });
// Auto-show once for brand-new players (after the menu is up).
if (!localStorage.getItem(HOWTO_SEEN_KEY)) {
  showHowto();
}

// ─── Daily login reward ────────────────────────────────────────────────────
const dailyOverlay = document.getElementById('daily-overlay')!;
const dailyTrack = document.getElementById('daily-track')!;
const dailySub = document.getElementById('daily-sub')!;
const dailyClaim = document.getElementById('daily-claim') as HTMLButtonElement;
const dailyDismiss = document.getElementById('daily-dismiss') as HTMLButtonElement;
const menuDaily = document.getElementById('menu-daily') as HTMLButtonElement;

function renderDaily() {
  const st = game.account.dailyLoginStatus();
  dailyTrack.replaceChildren();
  for (let i = 0; i < LOGIN_REWARDS.length; i++) {
    const chip = document.createElement('div');
    chip.className = 'daily-day';
    if (i === st.cycleIndex) chip.classList.add(st.available ? 'today' : 'done');
    else if (i < st.cycleIndex) chip.classList.add('past');
    if (i === LOGIN_REWARDS.length - 1) chip.classList.add('jackpot');
    chip.innerHTML = `<span class="dd-label">Day ${i + 1}</span><span class="dd-xp">+${LOGIN_REWARDS[i]}</span>`;
    dailyTrack.appendChild(chip);
  }
  if (st.available) {
    dailySub.textContent = st.day > 1
      ? `${st.day}-day streak 🔥 — claim Day ${st.day}.`
      : `Welcome back — claim your Day 1 reward.`;
    dailyClaim.disabled = false;
    dailyClaim.textContent = `▸ Claim +${st.reward} XP`;
  } else {
    dailySub.textContent = `Claimed today — ${st.streak}-day streak 🔥. Come back tomorrow!`;
    dailyClaim.disabled = true;
    dailyClaim.textContent = 'Claimed ✓';
  }
}
function showDaily() { renderDaily(); dailyOverlay.classList.remove('hidden'); }
function hideDaily() { dailyOverlay.classList.add('hidden'); }

dailyClaim.addEventListener('click', () => {
  const res = game.account.claimDailyLogin();
  if (res) {
    game.audio.play('level_up');
    renderDaily();           // re-render to the claimed state (account.onChange also fires)
  } else {
    game.audio.play('ui_click');
  }
});
dailyDismiss.addEventListener('click', () => { hideDaily(); game.audio.play('ui_click'); });
menuDaily.addEventListener('click', () => { showDaily(); game.audio.play('ui_click'); });

// Auto-show once per session if a reward is waiting — but never on top of the
// first-run How-to card (brand-new players see that first; daily greets them
// next session).
if (localStorage.getItem(HOWTO_SEEN_KEY) && game.account.dailyLoginStatus().available) {
  showDaily();
}

// Pointer-lock change → toggle HUD vs pause overlay.
// We only show the pause overlay if we lost lock *during* a game (i.e. the
// main menu isn't visible). Otherwise the user is just clicking around the
// menu and we shouldn't pop the pause on top.
game.input.onPointerLockChange = (locked) => {
  hud.classList.toggle('hidden', !locked);
  if (!locked && mainMenu.classList.contains('hidden')) {
    pauseOverlay.classList.remove('hidden');
  } else if (locked) {
    pauseOverlay.classList.add('hidden');
  }
};

// ─── Speed lines ─────────────────────────────────────────────────────────────
// Radial streaks ramp in above bhop-tier speed. RUN_SPEED is 8.4 and the bhop
// hard-cap ~9.66, so we start the effect at ~10.5 (you have to actually be
// chaining jumps / sliding / Surging) and saturate around 18.
const SPEED_LINES_START = 10.5;
const SPEED_LINES_FULL = 18;
const SPEED_LINES_MAX_OP = 0.55;
const speedLinesEl = document.getElementById('speed-lines')!;
let lastSpeedOp = -1;
function updateSpeedLines(speed: number) {
  let op = 0;
  if (speedLinesEnabled && game.input.pointerLocked && speed > SPEED_LINES_START) {
    const t = Math.min(1, (speed - SPEED_LINES_START) / (SPEED_LINES_FULL - SPEED_LINES_START));
    op = +(t * SPEED_LINES_MAX_OP).toFixed(2);
  }
  if (op !== lastSpeedOp) {
    lastSpeedOp = op;
    speedLinesEl.style.setProperty('--speed-lines-op', String(op));
  }
}

// Throttle debug HUD updates to ~10Hz to avoid layout thrash.
let lastHudUpdate = 0;
game.onFrame = ({ fps, speed, state, pos }) => {
  ui.tick();
  minimap.tick();
  nameplates.update();
  updateSpeedLines(speed);
  if (game.mode === 'tdm') updateTdmTicker();
  const now = performance.now();
  if (now - lastHudUpdate < 100) return;
  lastHudUpdate = now;
  dbgFps.textContent = String(fps);
  dbgSpeed.textContent = speed.toFixed(1);
  dbgState.textContent = state;
  dbgPos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
  // MP player count badge update.
  if (game.mp && !onlineBadge.classList.contains('hidden')) {
    onlineCount.textContent = String(game.mp.playerCount);
  }
  // Keep the scoreboard live while it's held open (10Hz is plenty).
  if (scoreboardOpen) renderScoreboard();
};

// ─── Cosmetics + Profile tabs + account-linked behavior ────────────────────
const cosmeticsUI = new CosmeticsUI(game.account);
void cosmeticsUI;
const profileUI = new ProfileUI(game.account);
void profileUI;

// ─── Crates (spin-for-cosmetic reward loop) ────────────────────────────────
const crateUI = new CrateUI(game.account, game.audio);
const menuCrates = document.getElementById('menu-crates') as HTMLButtonElement;
function updateCratesButton() {
  const keys = game.account.crateKeys;
  const free = game.account.freeCrateAvailable();
  menuCrates.textContent = keys > 0
    ? `📦 Crates · ${keys} 🔑`
    : (free ? '📦 Crates · free crate ready' : '📦 Crates');
  menuCrates.classList.toggle('has-crate', keys > 0 || free);
}
menuCrates.addEventListener('click', () => {
  crateUI.open();
  Ads.refreshSlot('crate');
  game.audio.play('ui_click');
});
game.account.onChange(updateCratesButton);
updateCratesButton();

// Reset progression button — wipes XP + unlocks + equipped cosmetics after a
// confirm prompt. Useful for testing the unlock loop or for players who want
// to start over.
const resetBtn = document.getElementById('reset-progression') as HTMLButtonElement | null;
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset all progression? This wipes XP, unlocks, and equipped cosmetics. Cannot be undone.')) return;
    game.account.reset();
    // CosmeticsUI re-renders via account.onChange listener.
  });
}

// Re-send hello whenever the equipped skin changes — server needs the new
// skin id for snapshot.skinId, otherwise other players see the old color.
game.account.onChange(() => {
  game.mp?.sendHello();
  game.applyEquippedFinish();
});

// ─── Post-match overlay ────────────────────────────────────────────────────
const postmatchOverlay = document.getElementById('postmatch-overlay')!;
const pmTitle = document.getElementById('pm-title')!;
const pmWinnerLine = document.getElementById('pm-winner-line')!;
const pmScoreboardBody = document.getElementById('pm-scoreboard-body')!;
const pmXpEarned = document.getElementById('pm-xp-earned')!;
const pmUnlocks = document.getElementById('pm-unlocks')!;
// Match-summary strip (tyoq4q) + accolade flavour (p4aum5), merged into one card.
const pmSKills = document.getElementById('pm-s-kills')!;
const pmSDeaths = document.getElementById('pm-s-deaths')!;
const pmSKd = document.getElementById('pm-s-kd')!;
const pmSStreak = document.getElementById('pm-s-streak')!;
const pmSPlace = document.getElementById('pm-s-place')!;
const pmNewBest = document.getElementById('pm-newbest')!;
const pmScAccolade = document.getElementById('pm-sc-accolade')!;
const BEST_MATCH_KILLS_KEY = 'ilc.bestMatchKills';
const pmPlayAgain = document.getElementById('pm-play-again') as HTMLButtonElement;
const pmQuit = document.getElementById('pm-quit') as HTMLButtonElement;

/** Pick a punchy accolade for the player's match performance — pure flavour
 *  that makes the post-match scorecard feel earned. Ordered most → least
 *  impressive so the best-fitting title wins. */
function accoladeFor(youWon: boolean, rank: number, kills: number, deaths: number, kd: number): string {
  if (deaths === 0 && kills >= 5) return 'FLAWLESS';
  if (kd >= 3 && kills >= 6) return 'DOMINATING';
  if (youWon || rank === 1) return 'MVP';
  if (kills >= 15) return 'ON A TEAR';
  if (kd >= 2) return 'SHARPSHOOTER';
  if (rank > 0 && rank <= 3) return 'PODIUM FINISH';
  if (kills >= 8) return 'SOLID RUN';
  return 'GOOD FIGHT';
}

function showPostMatch(winnerId: string) {
  game.audio.play('match_end');
  game.input.exitPointerLock();
  // Build scoreboard from game.matchKills + matchDeaths (Game tracks both).
  const allIds = new Set<string>();
  game.matchKills.forEach((_, k) => allIds.add(k));
  game.matchDeaths.forEach((_, k) => allIds.add(k));
  // Also include living players from MP if any never killed/died.
  if (game.mp) {
    for (const id of game.mp.remoteIds) allIds.add(id);
    if (game.mp.myId) allIds.add(game.mp.myId);
  }

  type Row = { id: string; kills: number; deaths: number; kd: string; isYou: boolean };
  const rows: Row[] = [];
  for (const id of allIds) {
    const k = game.matchKills.get(id) ?? 0;
    const d = game.matchDeaths.get(id) ?? 0;
    const kd = d === 0 ? k.toFixed(1) : (k / d).toFixed(2);
    rows.push({ id, kills: k, deaths: d, kd, isYou: game.isLocalPlayer(id) });
  }
  rows.sort((a, b) => b.kills - a.kills);

  const myRank = rows.findIndex((r) => r.isYou) + 1;
  const myKills = rows.find((r) => r.isYou)?.kills ?? 0;

  // TDM result: winnerId is "team:N". Win is your team winning, not your rank.
  const tdmTeam = winnerId.startsWith('team:') ? Number(winnerId.slice(5)) : null;
  const youWon = tdmTeam !== null ? tdmTeam === game.playerActor.team : myRank === 1;

  // Lifetime career: count this finished match + win.
  game.account.recordMatchEnd(youWon);

  // Award end-of-match XP: 50 for a win. FFA also grants 25 for a top-3 finish.
  const xpBefore = game.account.xp;
  if (youWon) game.account.awardXP(50);
  else if (tdmTeam === null && myRank > 0 && myRank <= 3) game.account.awardXP(25);
  const xpDelta = game.account.xp - xpBefore;
  // Per-kill XP was already awarded as each kill happened. We total it for display.
  const xpFromKills = myKills * 10;
  pmXpEarned.textContent = String(xpDelta + xpFromKills);

  pmTitle.textContent = youWon ? 'VICTORY' : (tdmTeam !== null ? 'DEFEAT' : 'MATCH OVER');
  if (tdmTeam !== null) {
    const label = tdmTeam === 0 ? 'BLUE' : 'RED';
    pmWinnerLine.innerHTML = `<b>${label} TEAM WINS</b> · ${game.teamScore[0]}–${game.teamScore[1]}`;
  } else {
    pmWinnerLine.innerHTML = `winner: <b>${game.isLocalPlayer(winnerId) ? 'YOU' : game.displayNameFor(winnerId)}</b>`;
  }

  // Personal scorecard — placement + K/D + best-streak + a dynamic accolade.
  // Combines both routine branches' post-match work into one coherent strip:
  // the accolade flavour (FLAWLESS/MVP…) plus the full kills/deaths/KD/streak/
  // place summary. Keeps eyes on the ad-bearing screen a beat longer.
  const myRow = rows.find((r) => r.isYou);
  const myDeaths = myRow?.deaths ?? 0;
  const myKdNum = myDeaths === 0 ? myKills : myKills / myDeaths;
  const myKd = myDeaths === 0 ? myKills.toFixed(1) : (myKills / myDeaths).toFixed(2);
  const placeLabel = tdmTeam !== null ? (youWon ? 'WON' : 'LOST') : (myRank > 0 ? `#${myRank}` : '—');

  pmScAccolade.textContent = accoladeFor(youWon, myRank, myKills, myDeaths, myKdNum);
  pmSKills.textContent = String(myKills);
  pmSDeaths.textContent = String(myDeaths);
  pmSKd.textContent = myKd;
  pmSStreak.textContent = String(announcer.bestStreak);
  pmSPlace.textContent = placeLabel;

  // Build scoreboard rows.
  pmScoreboardBody.innerHTML = rows.map((r, i) => {
    const name = r.isYou ? 'YOU' : game.displayNameFor(r.id);
    return `<div class="pm-row ${r.isYou ? 'you' : ''}">
      <span>#${i + 1}</span>
      <span>${name}</span>
      <span>${r.kills}</span>
      <span>${r.deaths}</span>
      <span>${r.kd}</span>
    </div>`;
  }).join('');

  pmUnlocks.textContent = '';   // future: list newly-unlocked skins this match

  // NEW-BEST badge — most kills in a single match (FFA-style modes only; TDM is
  // team-scored, so a personal-kills record there is less meaningful but still
  // tracked). Persisted across sessions.
  const prevBest = Number(localStorage.getItem(BEST_MATCH_KILLS_KEY) ?? 0);
  const isNewBest = myKills > prevBest && myKills > 0;
  if (isNewBest) localStorage.setItem(BEST_MATCH_KILLS_KEY, String(myKills));
  pmNewBest.classList.toggle('hidden', !isNewBest);

  postmatchOverlay.classList.remove('hidden');
  hud.classList.add('hidden');
  // Request a fresh ad for the post-match slot (a natural breakpoint).
  Ads.refreshSlot('postmatch');
}

function hidePostMatch() {
  postmatchOverlay.classList.add('hidden');
}

game.onMatchEnded = (winnerId) => showPostMatch(winnerId);

pmPlayAgain.addEventListener('click', () => {
  if (game.mp) {
    // MP: ask the SERVER to start a fresh match. We don't reset locally or
    // hide the overlay here — the server resets all players' scores and
    // broadcasts MatchReset, which dismisses the overlay on EVERY client in
    // lockstep (see session.onMatchReset below). This keeps clients in sync:
    // no more "I'm playing a fresh match while you're stuck on the scoreboard".
    game.mp.sendRematch();
    pmPlayAgain.disabled = true;
    pmPlayAgain.textContent = 'Waiting for match reset…';
  } else {
    // Solo: no server — reset locally and resume immediately.
    hidePostMatch();
    game.resetMatchScore();
    announcer.reset();
    // Gun Game: restart the weapon ladder from rung 0 for a fresh race.
    if (game.mode === 'gungame') {
      gunGame.start([game.localPlayerId(), ...game.bots.filter((b) => b.active).map((b) => b.id)]);
    }
    game.input.requestPointerLock();
  }
});
pmQuit.addEventListener('click', () => {
  hidePostMatch();
  quitToMenu();
});

// Initialize ads (mounts menu + post-match slots; loads AdSense only if a real
// publisher id is configured — otherwise tasteful placeholders).
Ads.init();

// Warm the FBX weapon models off the critical path. The viewmodel falls back to
// box geometry until each lands, then swaps the real model in (onModelReady).
preloadWeaponModels();

game.start();

// Dev-only: expose the game on window for debugging + automated checks. Vite
// strips this whole block from production builds (import.meta.env.DEV === false).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof game }).game = game;
}
