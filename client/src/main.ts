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
 *   ilc.fov ilc.sens ilc.class ilc.primary ilc.map ilc.gfx
 *   ilc.ch.color ilc.ch.size ilc.ch.thickness ilc.ch.gap ilc.ch.outline ilc.ch.dot
 */

import { Game } from './core/Game';
import { HUD } from './ui/HUD';
import { Announcer } from './ui/Announcer';
import { RewardToast } from './ui/RewardToast';
import { DamageDirection } from './ui/DamageDirection';
import { GunGame } from './modes/GunGame';
import { MultiplayerSession } from './networking/MultiplayerSession';
import { CosmeticsUI } from './ui/CosmeticsUI';
import { ProfileUI } from './ui/ProfileUI';
import { Ads } from './ads/Ads';
import type { WeaponId } from './weapons/Weapon';

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
const menuBlitz = document.getElementById('menu-blitz') as HTMLButtonElement;
const menuInstagib = document.getElementById('menu-instagib') as HTMLButtonElement;
const menuPractice = document.getElementById('menu-practice') as HTMLButtonElement;
const menuSettings = document.getElementById('menu-settings') as HTMLButtonElement;
const menuAbout = document.getElementById('menu-about') as HTMLButtonElement;
const practiceBadge = document.getElementById('practice-badge')!;
const instagibBadge = document.getElementById('instagib-badge')!;
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
const ui = new HUD(game);
const announcer = new Announcer(game.bus, game.audio, (id) => game.isLocalPlayer(id));
const damageDir = new DamageDirection(game);
void damageDir;

// Killstreak reward toast (Phase 15) — solo combat only. StreakRewards (in
// Game) applies the gameplay perk + fires this for the visual notice.
const rewardToast = new RewardToast();
game.streakRewards.onReward = (r) => rewardToast.show(r);

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

// Blitz (Time Attack) ticker elements.
const blitzTicker = document.getElementById('blitz-ticker')!;
const bzClock = document.getElementById('bz-clock')!;
const bzKills = document.getElementById('bz-kills')!;
const bzLeader = document.getElementById('bz-leader')!;

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

function startGame(mode: 'combat' | 'practice' | 'gungame' | 'blitz' | 'instagib' = 'combat') {
  // Tear down any active MP session before going single-player.
  if (game.mp) {
    game.mp.disconnect();
    game.mp = null;
    onlineBadge.classList.add('hidden');
  }
  game.setMode(mode);
  announcer.reset();
  game.streakRewards.reset();

  // Gun Game: start a fresh ladder for the player + all active bots, and show
  // the tier ticker. Other modes hide it. (Started AFTER setMode so the player
  // weapon swap lands on the live inventory.)
  if (mode === 'gungame') {
    const participants = [game.localPlayerId(), ...game.bots.map((b) => b.id)];
    gunGame.start(participants);
    ggTicker.classList.remove('hidden');
  } else {
    ggTicker.classList.add('hidden');
  }

  // Blitz: show the match-clock ticker (setMode armed the clock). Hidden else.
  blitzTicker.classList.toggle('hidden', mode !== 'blitz');

  practiceBadge.classList.toggle('hidden', mode !== 'practice');
  instagibBadge.classList.toggle('hidden', mode !== 'instagib');
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
  mainMenu.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  game.input.requestPointerLock();
}

function quitToMenu() {
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
  instagibBadge.classList.add('hidden');
  onlineBadge.classList.add('hidden');
  ggTicker.classList.add('hidden');
  blitzTicker.classList.add('hidden');
  // Restore the player's chosen loadout weapon (Gun Game overwrote it).
  game.setPlayerPrimaryWeapon((localStorage.getItem('ilc.primary') ?? 'ar') as WeaponId);
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
// Recover from a corrupt localStorage value.
if (savedMap !== 'sandstone' && savedMap !== 'industrial') {
  localStorage.setItem('ilc.map', 'sandstone');
}
game.setCombatMap(savedMap === 'sandstone' || savedMap === 'industrial' ? savedMap : 'sandstone');

// Loadout selector — clicking a weapon button updates the primary slot and
// triggers a viewmodel swap so the player sees the change preview on PLAY.
const loadoutBtns = document.querySelectorAll<HTMLButtonElement>('.loadout-btn:not([data-map])');
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
    game.mp?.sendHello();
  });
});
// Apply the saved loadout on boot.
if (savedPrimary !== 'ar') {
  game.inventory.setPrimary(savedPrimary);
  game.viewmodel.swapTo(savedPrimary);
}

menuPlay.addEventListener('click', () => startGame('combat'));
menuOnline.addEventListener('click', () => startOnline());
menuGungame.addEventListener('click', () => startGame('gungame'));
menuBlitz.addEventListener('click', () => startGame('blitz'));
menuInstagib.addEventListener('click', () => startGame('instagib'));
menuPractice.addEventListener('click', () => startGame('practice'));
backToMenu.addEventListener('click', quitToMenu);

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
  if (bot) return bot.difficulty.charAt(0).toUpperCase() + bot.difficulty.slice(1) + ' Bot';
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
  sbMode.textContent = game.mp ? 'Free-for-All · Online' : (game.mode === 'practice' ? 'Practice' : 'Free-for-All · Bots');
  sbGoal.textContent = String(Game.MATCH_KILL_GOAL);

  const ids = new Set<string>();
  // Always include the local player.
  ids.add(game.localPlayerId());
  // Solo bots.
  if (!game.mp) for (const b of game.bots) ids.add(b.id);
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

// Throttle debug HUD updates to ~10Hz to avoid layout thrash.
let lastHudUpdate = 0;
game.onFrame = ({ fps, speed, state, pos }) => {
  ui.tick();
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

  // Blitz match-clock ticker.
  if (game.mode === 'blitz') {
    const t = Math.max(0, Math.ceil(game.blitzTimeLeft));
    const m = Math.floor(t / 60);
    const s = t % 60;
    bzClock.textContent = `${m}:${String(s).padStart(2, '0')}`;
    bzClock.classList.toggle('urgent', t <= 15);
    const myKills = game.matchKills.get(game.localPlayerId()) ?? 0;
    bzKills.textContent = String(myKills);
    // Leader = whoever has the most kills (bots get humanized names).
    let leadId = ''; let leadKills = -1;
    game.matchKills.forEach((k, id) => { if (k > leadKills) { leadKills = k; leadId = id; } });
    if (leadKills <= 0) {
      bzLeader.textContent = 'leader: —';
    } else {
      const name = game.isLocalPlayer(leadId) ? 'YOU' : participantName(leadId);
      bzLeader.textContent = `leader: ${name} (${leadKills})`;
    }
  }
};

// ─── Cosmetics + Profile tabs + account-linked behavior ────────────────────
const cosmeticsUI = new CosmeticsUI(game.account);
void cosmeticsUI;
const profileUI = new ProfileUI(game.account);
void profileUI;

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
game.account.onChange(() => game.mp?.sendHello());

// ─── Post-match overlay ────────────────────────────────────────────────────
const postmatchOverlay = document.getElementById('postmatch-overlay')!;
const pmTitle = document.getElementById('pm-title')!;
const pmWinnerLine = document.getElementById('pm-winner-line')!;
const pmScoreboardBody = document.getElementById('pm-scoreboard-body')!;
const pmXpEarned = document.getElementById('pm-xp-earned')!;
const pmUnlocks = document.getElementById('pm-unlocks')!;
const pmPlayAgain = document.getElementById('pm-play-again') as HTMLButtonElement;
const pmQuit = document.getElementById('pm-quit') as HTMLButtonElement;

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
  const youWon = myRank === 1;

  // Lifetime career: count this finished match + win.
  game.account.recordMatchEnd(youWon);

  // Award end-of-match XP per spec: 50 for win, 25 for top-3 (else 0).
  const xpBefore = game.account.xp;
  if (youWon) game.account.awardXP(50);
  else if (myRank > 0 && myRank <= 3) game.account.awardXP(25);
  const xpDelta = game.account.xp - xpBefore;
  // Per-kill XP was already awarded as each kill happened. We total it for display.
  const xpFromKills = myKills * 10;
  pmXpEarned.textContent = String(xpDelta + xpFromKills);

  pmTitle.textContent = youWon ? 'VICTORY' : 'MATCH OVER';
  pmWinnerLine.innerHTML = `winner: <b>${game.isLocalPlayer(winnerId) ? 'YOU' : winnerId.slice(0, 6)}</b>`;

  // Build scoreboard rows.
  pmScoreboardBody.innerHTML = rows.map((r, i) => {
    const name = r.isYou ? 'YOU' : r.id.slice(0, 6);
    return `<div class="pm-row ${r.isYou ? 'you' : ''}">
      <span>#${i + 1}</span>
      <span>${name}</span>
      <span>${r.kills}</span>
      <span>${r.deaths}</span>
      <span>${r.kd}</span>
    </div>`;
  }).join('');

  pmUnlocks.textContent = '';   // future: list newly-unlocked skins this match

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
    game.streakRewards.reset();
    // Gun Game: restart the weapon ladder from rung 0 for a fresh race.
    if (game.mode === 'gungame') {
      gunGame.start([game.localPlayerId(), ...game.bots.map((b) => b.id)]);
    }
    // Blitz: reset the match clock for a fresh 2-minute run.
    if (game.mode === 'blitz') {
      game.restartBlitz();
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

game.start();

// Dev-only: expose the game on window for debugging + automated checks. Vite
// strips this whole block from production builds (import.meta.env.DEV === false).
if (import.meta.env.DEV) {
  (window as unknown as { game: typeof game }).game = game;
}
