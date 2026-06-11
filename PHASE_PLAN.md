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

## Phase 14 — Arena Pickups & Power-ups (v0.14.0)

Krunker/Quake arenas live or die on **moment-to-moment map control** — health
packs, armour shards, and timed power-ups that turn a flat duel into a fight
over *territory*. Phase 14 adds that layer: floating, glowing pickups that
respawn on a timer, with two instant pickups (health / armour-overshield) and
two timed buffs (Quad-style damage / Haste speed). It deepens combat without
touching the protocol — **solo combat + Gun Game only**, disabled in Practice
and MP (server-authoritative, no desync risk), no new deps.

Why this drives the goal: pickups extend average session length (territory
fights = more engagement = more natural ad breakpoints at match end), and the
"power-up online" rush is one of the catchiest feelings in arena shooters.

Guiding constraint: **no protocol changes, no new deps, typecheck + build green
each step, solo + MP both keep working.**

- **14A — Pickup primitives.** `Health` gains an `shield` field (overshield):
  `takeDamage` drains shield before HP; `reset()` clears it; migration-safe
  (default 0, bots never set it). `Weapon` gains a `damageMultiplier` (default
  1.0) applied in `computeDamage`; `WeaponInventory.setDamageMultiplier` mirrors
  the existing `reloadMultiplier` plumbing (re-applied on `setPrimary`). Both
  controllers gain `powerupSpeedMultiplier` (default 1.0) multiplied into the
  ground accelerate call — kept in sync client/server, stays 1.0 in MP.
- **14B — Pickup entity + manager.** New `entities/Pickup.ts` (floating, spinning,
  glowing icon mesh + pad ring; collected→hidden→respawn timer). New
  `core/Pickups.ts` manager: spawns from per-map definitions, proximity-collects
  vs the player, runs respawn + active-buff timers, applies effects, fires
  bus + SFX. Player-only for v1.
- **14C — Map spawn data.** `MapMeta.pickupSpawns?: PickupSpawn[]` + per-map
  tables for Sandstone and Industrial (health/armour low, buffs at contested
  spots). Practice = none.
- **14D — HUD.** Overshield segment on the HP bar + a power-up chip row
  (icon + countdown ring) for active Damage/Haste. New CSS.
- **14E — Audio + docs.** New sound ids (`pickup_health`, `pickup_armor`,
  `pickup_power`, `pickup_haste`, `powerup_expire`); README catalog + version
  bump to v0.14.0.

### Status log
- ✅ Phase 14A — Pickup primitives. DONE (typecheck client+server green).
  `Health.shield` (drained before HP in takeDamage, cleared in reset()).
  `Weapon.damageMultiplier` applied in computeDamage; `WeaponInventory`
  stores + re-applies it across weapon swaps via `setDamageMultiplier`.
  `powerupSpeedMultiplier` added to BOTH controllers (client multiplied into
  the ground accelerate call; server mirror stays 1.0 — kept in sync).
- ✅ Phase 14B — Pickup entity + manager. DONE. `entities/Pickup.ts` (spinning,
  bobbing icon + ground ring + additive glow sprite; collect→dim+hide→respawn).
  `core/Pickups.ts` `PickupManager` — builds from a spawn table, proximity
  collection (1.5m radius + 1.9m vertical window so lower-floor pads aren't
  grabbed from above), instant pickups only taken when useful, timed-buff
  countdown/expiry, `PickupHost`-decoupled. Wired into Game: host impl,
  `syncPickups()` (live only in solo combat — empty in MP/Practice), update in
  tick (gated), `cancelBuffs()` on respawn, rebuild on setMode/setMap/onMpChanged.
- ✅ Phase 14C — Map spawn data. DONE. `MapMeta.pickupSpawns` + `PickupSpawn`
  type; Sandstone (6 pads: health/armour mid-quadrant, Damage/Haste flanking the
  plaza tower) + Industrial (6 pads: ground health/armour, Damage on L2 catwalk
  apex y=8.2, Haste on L1 y=4.2). Practice = none.
- ✅ Phase 14D — HUD. DONE. Overshield bar (`#shield-bar`/`#shield-fill`) above
  the HP bar, shown only while shield>0; power-up chip row (`#powerup-chips`)
  with two reused chips (Damage/Haste — icon + countdown + progress bar), driven
  by `PickupManager.onBuffsChanged`. CSS added. Client build green, app ~63.5 KB.
- ✅ Phase 14E — Audio + docs. DONE. 5 new sound ids added to AudioManager
  catalog (silent until .wav drop-in); README header/status/deliverables + audio
  catalog + Phase 13/14 sections; client+server bumped to v0.14.0 (+ menu
  subtitle/footer). Typecheck (client+server) + client build all green.

### Phase 14 COMPLETE — Arena pickups & power-ups shipped, solo + MP intact, no protocol change.

---

## Phase 15 — Killstreak Reward Perks (v0.15.0)

The Announcer shouts your streak; Phase 15 makes streaks *pay off* with concrete
gameplay perks — the "I'm on fire, keep pushing" loop that lengthens sessions
(more engagement → more ad breakpoints). Solo combat + Gun Game only (MP is
server-authoritative; client-side buffs would desync), no protocol change, no
new deps. Reuses the Phase 14 buff infrastructure so there's a single owner of
the damage/speed multipliers.

- **15A — Reward ladder + effect plumbing.** `core/StreakRewards.ts`
  (`STREAK_REWARDS` 3/5/7 + `StreakRewards` manager, bus-driven, `StreakRewardHost`
  interface). Resupply (full heal + reload), Overcharge (+50 shield + 1.4× dmg
  8s), Frenzy (heal + 1.5× dmg + 1.3× speed 10s). `PickupManager.grantDamage/
  grantHaste` (shared buff timers), `Weapon.refill()` + `WeaponInventory.refillAll()`.
- **15B — Wiring + gating.** Game owns `streakRewards`, host applies heal/shield/
  buffs, `syncPickups()` flips `setEnabled(live)` (solo combat only). Streak resets
  on death (bus) + solo Play Again.
- **15C — Reward toast UI.** `ui/RewardToast.ts` + `#streak-reward` DOM/CSS —
  separate node from the Announcer banner so reward + streak callout coexist.
  3 new sound ids reserved. Version → v0.15.0, README + docs.

### Status log
- ✅ Phase 15A/B/C — DONE (typecheck client+server + client build green; app
  ~64.3 KB gzip). Reward ladder applies perks through the shared pickup buff
  timers (no multiplier fights). Solo-only gating via `setEnabled` from
  `syncPickups`; resets on death + Play Again. Separate reward toast avoids
  Announcer-banner contention. Headless gameplay (watching the toast fire at a
  real 3-kill streak) not run in this environment — logic is deterministic +
  fully typechecked, mirrors the verified GunGame/Pickups patterns.

### Phase 15 COMPLETE — Killstreak reward perks shipped, solo + MP intact, no protocol change.

---

## Phase 16 — Blitz (Time Attack) mode (v0.16.0)

A second NEW MODE — mode variety is the #1 replay driver. Blitz is a 2-minute
score-attack FFA vs bots: most kills when the clock hits zero wins. Self-
contained, solo for v1, no protocol/MP changes. Reuses the authoritative-feeling
post-match overlay (standings from matchKills/matchDeaths), bots, pickups, and
killstreak rewards (all live since Blitz is an `isCombatMode`).

- **Match clock** (`Game.blitzTimeLeft`, default 120s, `ilc.blitzSeconds`
  override). Ticks only while pointer-locked (pause-aware) + not over. On 0,
  `endBlitz()` picks the top-kills winner (ties → local) and fires `onMatchEnded`.
- **`GameMode` extended** to `'combat' | 'practice' | 'gungame' | 'blitz'`;
  `isCombatMode` includes blitz. `setMode` arms the clock; `restartBlitz()` for
  Play Again.
- **HUD ticker** (`#blitz-ticker`) — clock (red-blinks ≤15s) + your kills + live
  leader, rendered in main.ts `onFrame`. New "⏱ Blitz" menu button + CSS.
- Verified: typecheck (client+server) + client build green; app ~64.7 KB gzip.
  Headless gameplay (watching the full 2-min clock + match-end) not run here —
  logic is deterministic + typechecked; reuses the verified post-match path.

### Phase 16 COMPLETE — Blitz Time-Attack mode shipped, solo + MP intact, no protocol change.

---

## Phase 17 — Marksman + LMG weapons (v0.17.0)

More loadout variety drives replay value. Two new weapons, fully self-contained
(config data + a procedural box viewmodel each), live in every mode.

- **Marksman (DMR, `dmr`)** — semi-auto precision: 50 dmg (2-shot body), 2.0×
  head (1-shot headshot), tight spread, light scope (FOV 55), 4.5 RPS. Bridges
  AR↔Sniper.
- **LMG (`lmg`)** — automatic suppression: 60-round mag, 18 dmg, 11 RPS, heavy
  recoil climb, slow bloom recovery, 3.4s reload. Uptime over burst.
- Wiring: `WEAPON_LIBRARY` (+2), `Viewmodel` builders `buildDMR`/`buildLMG` (+
  registered in the exhaustive `WEAPON_BUILDERS`), GunGame `WEAPON_LABEL` (+2,
  exhaustive), `fire_dmr`/`fire_lmg` sound ids, two loadout buttons, server
  `VALID_WEAPONS` (+2 so MP accepts the picks; MP damage stays on the existing
  flat model — a pre-existing simplification, out of scope here). Bots unchanged
  (fixed weapons). Typecheck (client+server) + build green; app ~65.1 KB gzip.

### Phase 17 COMPLETE — Marksman + LMG shipped, solo + MP intact, no protocol change.

---

## Phase 18 — Instagib mode (v0.18.0)

A fourth solo mode — Quake/Krunker one-shot-one-kill. Pure aim, fully self-
contained, no protocol/MP change.

- **`World.instagib`** flag read by `Weapon.computeDamage` (returns lethal for
  any hit). Uniform for player + bots (fair). Set solo-only in `syncPickups`.
- **Pickups + killstreak rewards disabled** in Instagib (moot when everything
  one-shots) — `syncPickups` excludes the mode.
- `GameMode` += `'instagib'`; `isCombatMode` covers it (bots/spawns/spawn-
  protection apply — 2s spawn shield still protects). New "⚡ Instagib" menu
  button + `#instagib-badge` top-center + CSS.
- Verified: typecheck (client+server) + build green; app ~65.2 KB gzip. Headless
  gameplay not run here; logic is a one-line damage short-circuit + mode plumbing
  mirroring the verified Blitz/Gun Game patterns.

### Phase 18 COMPLETE — Instagib mode shipped, solo + MP intact, no protocol change.


