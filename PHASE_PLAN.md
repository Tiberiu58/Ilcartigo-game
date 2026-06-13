# ILCARTIGO — Phase 11+ Roadmap (autonomous build)

Goal: make the game **fun, catchy, Krunker-feel**, and **revenue-ready (AdSense)**.
Build steadily, one phase at a time, verifying (typecheck + build, headless tests where
possible) after each. Each phase is independently shippable.

Guiding principles:
- **Readable feedback** — every action has instant, juicy feedback (Krunker's core feel).
- **Visible progression** — players see themselves getting better/richer (levels, streaks, stats).
- **Natural ad breakpoints** — ads between matches / on the death+postmatch screen, never mid-combat.
- **Don't regress** — keep solo + MP + the audit fixes working. Typecheck + build green each phase.
- **No new heavy deps.** Stay within the current stack (Vite/TS/Three/Howler/socket.io).

---

## Phase A — Scoreboard (Tab) + live match HUD polish  ✅ shippable
The single most "Krunker" missing piece: hold **Tab** to see a full scoreboard.
- Tab-held overlay: rank, player name, kills, deaths, K/D, ping (MP). Works solo (you+bots) and MP.
- Sort by kills desc, highlight local player.
- Reuse `Game.matchKills/matchDeaths`; in MP pull from snapshot `kills` so it's authoritative.
- Polish the existing top-center match ticker.
Files: `index.html` (overlay DOM), `main.ts` (Tab key + render), `HUD.ts` (maybe), `site.css`/game css.

## Phase B — Killstreaks + "juice"  ✅ shippable
Krunker-style momentum feedback.
- Track consecutive kills without dying (local player). Announce streaks: Double Kill, Triple,
  Rampage, Unstoppable, Godlike — center-screen banner + escalating sound.
- Multi-kill timing window (kills within ~4s chain into Double/Triple/Multi).
- Hitmarker scale-up + sharper kill confirmation. Headshot = special marker + ding (already partly there).
- Low-HP vignette pulse.
Files: new `client/src/ui/Announcer.ts`, wire into `Game` kill bus, css, sounds catalog (already has hooks).

## Phase C — Footsteps + audio depth  ✅ shippable (finishes audit #footstep)
- Distance-throttled footstep emit in PlayerController (the audit's last unwired sound).
- Per-class footstep volume (Phantom silent, Ghost half) using existing passive fields.
- Remote-player footsteps (spatial) from snapshot movement.
Files: `PlayerController.ts`, `Game.ts`, `MultiplayerSession.ts`, `AudioManager.ts`.

## Phase D — Class selection in MP  ✅ shippable (closes a README limitation)
- Players already pick class in the menu (localStorage `ilc.class`); sync it over the wire.
- `ClientHello` already carries `classId` — make the menu selection actually flow to MP + verify
  abilities/passives work online for all 6 classes (server already validates classId).
- Show other players' class color/identity.
Files: `main.ts` (send hello on class change — already partly wired), verify server `onHello`.

## Phase E — Progression depth + stat tracking  ✅ shippable
Catchy long-term hooks + more reasons to come back.
- Persistent lifetime stats: total kills, deaths, K/D, matches, wins, best streak, headshots, playtime.
- Stats tab in settings (or new "Profile" panel). XP/level already exist — surface lifetime stats too.
- Daily challenge-lite (local): "get 20 kills", "win a match", "5 headshots" → bonus XP. No backend.
Files: `Account.ts` (extend persisted state, migration-safe), new `ProfileUI` / extend CosmeticsUI, css.

## Phase F — AdSense revenue integration  ✅ shippable (the money)
- Interstitial-style ad slot on the **post-match overlay** + **main menu** (natural breakpoints).
- Reserved, responsive ad containers that show a tasteful placeholder until a real `ca-pub` is set.
- Single config point for the publisher id; AdSense script loads only when id is real (not XXXX).
- Respect the existing cookie-consent banner on the website; add a minimal consent gate in-game.
Files: `index.html` (ad containers), new `client/src/ads/Ads.ts`, `main.ts` wiring, css.

## Phase G — UX / first-session catch (retention)  ✅ shippable
- Name entry (persisted) so the scoreboard shows a chosen handle, not a socket id.
- Quick "how to play" first-run card; settings to replay it.
- Crosshair/loadout quick-access; remember last loadout.
Files: `main.ts`, `index.html`, `Account.ts` (name), css.

## Phase H — README + version bump + polish sweep
- Update README with all new phases, bump to the appropriate version.
- Re-run the audit's remaining minor items (respawn-countdown race, iPad gate) if not already done.

---

### Status log
- ✅ Phase A — Tab scoreboard. DONE + browser-verified (sorted rows, K/D, bot names, "You" highlight, keyup hides). Dev-only `window.game` added for testing (stripped from prod).
- ✅ Phase B — Killstreak/multi-kill announcer. DONE + browser-verified (Double→Mega chain, streak milestones, headline/subline priority, death resets). 11 new sound ids (silent until .wav added). New `ui/Announcer.ts`.
- ✅ Phase C — Footsteps. DONE (typecheck + build clean, wiring verified). Local footsteps (distance-throttled stride, per-class volume via passive, crouch lengthens stride) + remote spatial footsteps in MP (RemotePlayer accumulator, cloak-silent, ignores teleports). Couldn't watch real footfalls in the throttled/lock-gated headless tab — accumulator is deterministic, will fire in a real session.
- ✅ Phase D — MP class selection. DONE + headless-verified. Found the client class flow was ALREADY wired (README's "locked to Vanguard" was stale). Real bugs fixed: two class PASSIVES were silently MP-broken because the server is authoritative but never applied them — Vanguard's +15 HP (server killed them at 100) and Engineer's -15% cooldown. Added CLASS_MAX_HP + CLASS_COOLDOWN_MULT server tables; smoke test confirms Vanguard=115 HP server-side + clean class-switch clamp.
- ✅ Phase E — Lifetime stats + daily challenges. DONE + browser-verified end-to-end. Account extended (migration-safe) with LifetimeStats (kills/deaths/hs/matches/wins/bestStreak/playtime) + daily challenges (seeded-per-day, 3 picked, baseline-captured-at-issue, claim grants bonus XP) + display name. New Profile settings tab (ProfileUI). Wired stat recording into Game kill/death/match-end + playtime tick. Caught+fixed a baseline off-by-one during verification. Claim flow confirmed (+300 XP). New `ui/ProfileUI.ts`.
- ✅ Phase F — AdSense. DONE + browser-verified. New `ads/Ads.ts` — single-config-point publisher id, slots at natural breakpoints (menu top/side + post-match), tasteful in-house placeholders until a real id is set (NO empty real units = policy-safe), no AdSense script loads in placeholder mode (verified), consent-aware npa fallback, refreshSlot on each post-match. Gate logic verified (placeholder→off, real id→on).
- ✅ Phase G — First-session UX. DONE + browser-verified. Name entry shipped in Phase E. Loadout persistence (class/primary/map) already existed. New: first-run "How to Play" card — auto-shows once for new players (gated by ilc.seenHowto), dismiss sets flag, replayable from a new "How to Play" main-menu button. Verified: auto-show, 8 control items, dismiss+flag, menu replay.
- ✅ Phase H — Polish + docs. DONE. Fixed respawn-countdown race (audit #10 — 0.25s grace before auto-clear) + iPad-landscape mobile gate (audit #11 — `(any-pointer: fine)` so touch-only tablets gated even when wide). Bumped client+server to v0.11.0 (+ menu subtitle/footer). README updated with the full Phase 11 section. Hit a UTF-8 BOM gotcha from PowerShell `Set-Content -Encoding utf8` corrupting package.json → rewrote both via Write (BOM-free); both validate + build clean.

### Phase 11 COMPLETE — all 8 sub-phases (A–H) + audit-fix round shipped, typecheck + build green, app chunk ~59 KB gzip.

---

## Phase 12 — Combat Feel & Feedback Juice (autonomous build, v0.12.0)

The single biggest gap between ILCARTIGO and Krunker right now is *moment-to-moment
combat feedback* — you can't tell where you're being shot from, low-HP has no
tension, death is abrupt, and there's only one cosmetic axis to chase. Phase 12
closes that, all client-side and low-risk (no protocol changes, solo + MP both
keep working), plus one new cosmetic track to deepen the unlock loop (retention →
ad revenue).

Guiding constraint: **no protocol changes, no new deps, typecheck + build green each step.**

- **12A — Directional damage indicators.** Red curved arcs around the crosshair
  pointing at whoever's shooting you (CoD/Krunker staple). Computed from the
  attacker's world position vs camera yaw. Works solo (bots) + MP (remotes).
  New `ui/DamageDirection.ts`, `Game.actorWorldPos()` resolver,
  `MultiplayerSession.getRemotePosition()`.
- **12B — Low-HP vignette + heartbeat.** Persistent pulsing red vignette + a
  throttled heartbeat SFX cue when HP drops under a threshold. Pure HUD + CSS.
- **12C — Death recap card.** "ELIMINATED BY {name} · {WEAPON}" on the death
  screen, folded into the respawn countdown. Captured from the lethal kill event.
- **12D — Tracer-colour cosmetics.** A new unlockable cosmetic axis (your bullet
  tracer colour). Extends the registry + Account + Cosmetics settings tab; the
  local player's tracers read the equipped colour. More to chase = more reasons
  to return.
- **12E — Announcer specials.** First Blood (first kill of a match), Revenge
  (kill whoever last killed you), Comeback (kill after a long death drought).
  Pure `Announcer.ts` extension on top of the existing streak/multi-kill system.

### Status log
- ✅ Phase 12A — Directional damage indicators. DONE (typecheck + build green). New `ui/DamageDirection.ts`; pooled red arcs rotate about screen centre to the attacker's bearing (camera-yaw projection). Attacker position via new `Game.actorWorldPos` (local/bot/MP-remote) + `MultiplayerSession.getRemotePosition`. Merges continuous fire, separate arcs for multiple attackers, skips attacker-less hits.
- ✅ Phase 12B — Low-HP vignette + heartbeat. DONE. Pulsing red `#lowhp-vignette` + throttled `heartbeat` SFX at ≤30% HP (cadence 500–950ms, tighter near death). HUD-driven, edge-toggled.
- ✅ Phase 12C — Death recap card. DONE. "ELIMINATED BY {name} · {WEAPON}(·HS)" inside the respawn countdown; resolves bot labels / short MP ids; hidden for falls.
- ✅ Phase 12D — Bullet-tracer cosmetics. DONE. `TRACERS` registry (6, 0–2000 XP) + `findTracer`/`DEFAULT_TRACER`. Account extended migration-safe (`unlockedTracers`/`equippedTracer`, default kept unlocked on old saves) with unlock/equip + `equippedTracerColor`. Game reads it for local tracers; new Cosmetics grid + tracer swatch CSS.
- ✅ Phase 12E — Announcer specials. DONE. First Blood (match-first kill via a `matchHadKill` flag read-before-set), Revenge (`lastKilledMeBy`), Comeback (`deathsSinceKill >= 3`). Specials headline, multi/streak subline; all reset in `reset()`.
- ✅ Phase 12F — Kill-confirm marker. DONE. Bigger glowing red X on confirmed kill; hit/headshot/kill state classes cleared between flashes.
- ✅ Phase 12 polish — Bumped client+server to v0.12.0 (+ menu subtitle/footer), README Phase 12 section + audio-catalog additions (heartbeat/first_blood/revenge/comeback), deliverables updated. Typecheck (client+server) + client build all green; app chunk ~61 KB gzip.

### Phase 12 COMPLETE — A–F + polish shipped, no protocol change, solo + MP intact.

---

## Phase 13 — Gun Game mode (v0.13.0)

The first NEW GAME MODE — mode variety is the #1 driver of replay value in arena
shooters (Krunker has a dozen). Self-contained, solo-vs-bots for v1, no protocol
or MP changes, fully browser-verified.

- **Weapon ladder** `smg → ar → shotgun → sniper → pistol` (`GUNGAME_LADDER`).
  Each kill advances the killer one rung; the player's gun visibly swaps in hand.
  First to land a kill on the FINAL rung (pistol) wins → post-match overlay.
- **New `modes/GunGame.ts`** — bus-driven, decoupled via a small `GunGameHost`
  interface (isLocalPlayer / setPlayerPrimaryWeapon / playSound). Tracks per-
  participant tiers; bots race too (their tier advances, weapon stays fixed for v1).
- **`GameMode` extended** to `'combat' | 'practice' | 'gungame'` + an `isCombatMode()`
  helper so bots/spawn-protection/map logic treat Gun Game like Combat.
- **New `Game.setPlayerPrimaryWeapon(id)`** — swaps primary + viewmodel. Pistol is
  special-cased (it's the secondary slot; `setPrimary` rejects it) → selects slot 1.
  **Caught + fixed during verification**: without this the final rung silently
  stayed on sniper.
- **HUD**: new top-center Gun Game ticker — "LVL n/5 · WEAPON" + filled pips.
  Shown only in gungame mode; hidden on quit/other modes.
- **Menu**: new "🔫 Gun Game (vs Bots)" button. Play Again restarts the ladder;
  Quit restores the player's chosen loadout weapon.
- Verified in-browser end-to-end: starts on SMG, climbs AR→SHOTGUN→SNIPER→PISTOL
  over 4 kills, 5th kill (on pistol) fires the win + post-match. Typecheck (client)
  + build green; app chunk ~61.6 KB gzip.

### Phase 13 COMPLETE — Gun Game shipped, solo + MP intact, no protocol change.

---

## Phase 14 — Time Attack mode (v0.14.0)

The second NEW GAME MODE — a **90-second score blitz**. Mode variety keeps the
game catchy, and a *timed* mode is the best revenue lever we have: short rounds
mean a fresh post-match overlay (our prime AdSense breakpoint) every ~90s
instead of every 30 kills. Self-contained, solo-vs-bots for v1, no protocol or
MP changes, mirrors the Gun Game module pattern.

- **The clock is the enemy.** Everyone keeps their chosen loadout; deaths cost
  nothing but respawn seconds. Most kills before the timer hits zero wins → the
  post-match overlay (reusing `matchKills` for the board, like Gun Game).
- **New `modes/TimeAttack.ts`** — bus-driven, decoupled via a small
  `TimeAttackHost` interface (isLocalPlayer / playSound). Tracks per-participant
  kills (bots race too). The countdown is **self-managed**: dt-accumulated,
  **pause-aware** (`setPaused`), driven by a once-per-frame `tick()` from
  `main.ts`'s `game.onFrame`. Suicide kills don't farm score. Winner = top
  kills, ties resolve in the local player's favour. `TIMEATTACK_DURATION = 90`,
  `TIMEATTACK_WARN_AT = 10`.
- **`GameMode` extended** to include `'timeattack'`; `isCombatMode()` now returns
  true for it so bots / spawn-protection / map logic treat it like Combat.
- **HUD**: new top-center Time Attack ticker — `M:SS · N kills`, tabular-nums
  clock. Final 10s adds a `.warn` state (red + pulsing) and an audible per-second
  `timer_tick` cue (new sound id, silent until the asset lands).
- **Pause integration**: the `onPointerLockChange` handler calls
  `timeAttack.setPaused(!locked)`, so the clock freezes on Esc / tab-out / the
  settings + post-match overlays and resumes cleanly on re-lock — a tabbed-out
  player can't lose the round to a clock that kept draining.
- **Menu**: new "⏱ Time Attack (vs Bots)" button (gold `#ffd24a` accent). Play
  Again restarts a fresh 90s round; Quit stops the clock + hides the ticker.
  Scoreboard mode label + goal now read mode-aware ("Time Attack · Bots" / "90s").
- **Verified**: headless logic test (kill counting, suicide-ignore, local-kills
  tick, pause-freeze no-drain, tie-favours-local + bot-leads winner resolution,
  match_end cue) all pass. Typecheck (client + server) + client build green; app
  chunk ~62.2 KB gzip. New `timer_tick.wav` added to the audio catalog.

### Phase 14 COMPLETE — Time Attack shipped, solo + MP intact, no protocol change.

---

## Phase 15 — Headhunter mode (v0.15.0)

The third NEW GAME MODE — a **precision / headshots-only** mode. Three modes now
cover three distinct skill axes: the **weapon ladder** (Gun Game), the **clock**
(Time Attack), and **aim** (Headhunter). Self-contained, solo-vs-bots for v1, no
protocol or MP changes, mirrors the Gun Game module pattern.

- **Only headshot kills score.** Body kills still drop the target (and still
  count toward Tab/lifetime stats) but don't advance your Headhunter score.
  First to `HEADHUNTER_GOAL = 10` headshot eliminations wins → post-match.
- **New `modes/Headhunter.ts`** — bus-driven, decoupled via a small
  `HeadhunterHost` interface (isLocalPlayer / playSound). Reads `KillEvent.
  isHeadshot` straight off the existing bus (no new event fields). Tracks
  per-participant headshot kills (bots race), suicides don't farm. Purely
  reactive — no per-frame tick needed, like Gun Game.
- **`GameMode`** extended with `'headhunter'`; `isCombatMode()` includes it.
- **HUD**: new top-center Headhunter ticker — "💀 HEADSHOTS n/10", with a brief
  scale `.bump` animation on each increment and a `hit_headshot` cue on score.
- **Menu**: new "💀 Headhunter (vs Bots)" button (pink `#ff5a8a` accent). Play
  Again restarts a fresh round; Quit hides the ticker. Mode-aware scoreboard
  label ("Headhunter · Bots" / "10 HS").
- **Verified**: headless logic test (body-kill no-score, headshot scores +
  local tick + cue, suicide-ignore, bots score, win-at-goal + stop-after-win,
  bot-can-win) all pass. Typecheck (client + server) + client build green; app
  chunk ~62.5 KB gzip. No new sound ids (reuses `hit_headshot` + `match_end`).

### Phase 15 COMPLETE — Headhunter shipped, solo + MP intact, no protocol change.

---

## Phase 16 — Game Modes hub (v0.16.0)

With three custom modes plus Classic/Online/Practice, the main menu had six play
buttons and was getting crowded. Phase 16 consolidates them into a Krunker-style
**mode picker** — cleaner UX, better mode discoverability (catch), and a new
natural ad breakpoint (revenue), with no gameplay risk.

- **New `#modes-overlay`** — a modal hub opened from a single "🎮 Game Modes"
  main-menu button. The two primary entry points (▸ Play vs Bots, ⌬ Play Online)
  and Practice stay on the main menu for one-click access; the hub presents all
  six modes as **cards** with icons, one-line descriptions, and tags.
- **Data-driven routing.** Each `.mode-card` carries `data-mode`; a single
  delegated handler routes to `startOnline()` (online) or `startGame(mode)` for
  the rest. Removing the three per-mode buttons + their individual listeners in
  favour of this keeps `main.ts` smaller as modes grow.
- **Closes cleanly**: × button, click-outside-card, and Esc all dismiss the hub
  (Esc handler extended; the existing menu-state guards already keep Tab/pause
  from firing while it's open).
- **Ad slot**: a 728×90 `data-ad-slot="modes"` lives in the hub (new `'modes'`
  entry in `AD_CONFIG.slots`), `refreshSlot`'d on open — placeholder until a real
  publisher id is set, exactly like the other slots (policy-safe).
- **Verified**: typecheck (client + server) + client build green; all six card
  routes validated; no dangling references to the removed buttons. App chunk
  ~62.6 KB gzip.

### Phase 16 COMPLETE — Game Modes hub shipped, solo + MP intact, no protocol change.

---

## Phase 17 — Personal bests + per-mode records (v0.17.0)

The three new modes needed a reason to replay them beyond a single round. Phase
17 adds a **personal-records** retention loop — chase your best — surfaced where
players already look (the Modes hub) and celebrated where it lands hardest (the
post-match screen). Pure Account + UI; zero gameplay/protocol/MP risk.

- **`Account` extended (migration-safe)** with `modeStats: Record<string,
  {bestKills, wins, plays}>`. New `recordModeResult(mode, kills, won)` updates
  plays/wins + the best-kills high-water mark and returns `{ newBest }`; new
  `modeStat(mode)` read accessor. Old saves missing the field load cleanly
  (verified), and `reset()` wipes it.
- **Post-match recording + celebration.** `showPostMatch` records the result for
  the current mode (online classic keyed as `'online'` so it doesn't conflate
  with solo classic) and, on a new best-kills record, flashes a gold
  "🏆 NEW PERSONAL BEST · N kills" line with a pop animation.
- **Modes hub stats.** Each mode card now shows a record line, refreshed every
  time the hub opens — Time Attack reads "🏆 Best N kills · NW", the others
  "NW · N played", unplayed modes "Not played yet".
- **Profile tab "Mode Records" section.** A per-mode breakdown (best/wins/plays)
  above Daily Challenges, re-rendered on every account change.
- **Verified**: headless Account test (first-result-is-best, lower-doesn't-beat,
  higher-sets-record, zero-kills-never-celebrated, persistence, old-save
  migration, reset-clears) all pass. Typecheck (client + server) + client build
  green; app chunk ~63.2 KB gzip. No new deps, no new sound ids.

### Phase 17 COMPLETE — Personal bests shipped, solo + MP intact, no protocol change.

---

## Phase 18 — Progression feedback: XP popups + level-up (v0.18.0)

The XP economy existed since Phase 9 but was **silent** — players never felt it.
Phase 18 surfaces it the Krunker way: the constant little dopamine hit of seeing
your XP tick up, and a celebration when you level. Progression you *feel* is what
brings players back (retention → ad revenue). Pure additive UI, zero
gameplay/protocol/MP risk.

- **New `ui/XpFeed.ts`** — purely reactive, decoupled. Listens to
  `account.onChange`, diffs XP + level against the last seen values. Positive XP
  deltas pop a "+N XP" floater (gated to when the HUD is up, so menus stay
  clean); negative deltas (spending on unlocks) are ignored. A level increase
  fires a full-screen "LEVEL UP — N" banner + `level_up` SFX, which sits above
  even the post-match overlay so a level earned by the win bonus still lands.
- Captures every XP source for free (kills +10, win +50, daily-challenge claims)
  since they all flow through `Account.xp`.
- New `xp_feed` + `levelup-banner` HUD DOM, rise/pop CSS animations, and a new
  `level_up` sound id (silent until the asset lands).
- **Verified**: headless test with DOM stubs (in-game popup fires, out-of-game
  suppressed, level boundary triggers banner + sound, spending XP pops nothing)
  all pass. Typecheck (client + server) + client build green; app chunk ~63.6 KB
  gzip.

### Phase 18 COMPLETE — XP feedback shipped, solo + MP intact, no protocol change.

---

## Phase 19 — Match-start mode intro (v0.19.0)

Rounds dropped you straight in with no sense of occasion or which mode you were
playing. Phase 19 adds a brief, **non-blocking center flash** on every round
start — the mode's name + its objective — the way Krunker announces each round.
Reinforces mode identity (you always know the rules), and gives each of the six
modes a distinct, satisfying entrance. Pure additive UI.

- **New `#mode-intro` HUD banner** + a `showModeIntro(key)` helper in `main.ts`
  with per-mode title/objective/accent-colour (matching the menu + ticker
  colours). 2s flash animation, `pointer-events: none` so it never blocks aim.
- Fires from every round-start path: `startGame` (all solo modes), `startOnline`,
  solo Play Again (reads `game.mode`), and MP `onMatchReset`.
- Copy: Free For All "First to 30 kills", Gun Game "Kill to upgrade · pistol
  wins", Time Attack "90 seconds · most kills wins", Headhunter "Headshots only ·
  first to 10", Practice "No threats · warm up", plus an Online variant.
- **Verified**: typecheck (client + server) + client build green; app chunk
  ~63.9 KB gzip. No new deps, no protocol/MP/gameplay changes.

### Phase 19 COMPLETE — Mode intro shipped, solo + MP intact, no protocol change.

---

## Phase 20 — Enemy nameplates + health bars (v0.20.0)

A Krunker staple for combat readability: a floating **name + health bar** above
each enemy so you can see who you're fighting and how close they are to dying.
You stop guessing whether one more shot finishes them.

- **New `ui/Nameplates.ts`** — world-space billboarded sprites (the proven
  DamageNumbers pattern), so they face the camera and are **occluded by walls**
  (`depthTest: true`) — you only read the health of enemies you can actually see,
  no wallhack. Pooled (8) with canvas textures redrawn only when a bot's HP
  changes, so per-frame cost is just repositioning.
- **Zero coupling into Bot.ts** — the manager pulls live state straight off
  `Game.bots` (position via `bot.group`, HP via `bot.health`) each frame. Hidden
  for dead/inactive bots and **entirely off in MP** (bots are inactive there), so
  it's a solo-only v1; remote plates can layer on later from snapshot data.
- HP bar colour ramps green → amber → red by remaining fraction; plates fade out
  past ~58 units and hide past 75. Wired into `Game` next to `dmgNumbers`
  (construct + `update()` in the render loop).
- **Verified**: typecheck (client + server) + client build green; app chunk
  ~64.6 KB gzip. No new deps, no protocol/MP/gameplay changes.

### Phase 20 COMPLETE — Enemy nameplates shipped, solo + MP intact, no protocol change.

