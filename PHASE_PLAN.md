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

## Phase 14 — Arsenal: MP weapon authority + Marksman (v0.14.0)

Weapon choice is core to the Krunker feel, but online it didn't matter: the
server hardcoded **AR damage (24, ×1.8, a single ray) for every weapon**, so a
sniper didn't one-shot, a shotgun fired one pellet, and an SMG melted like a
rifle. Phase 14 makes the server run the TTK each loadout implies, and adds a
new precision rifle to deepen the arsenal. **No protocol change** (weaponId was
already on the wire); solo + MP both intact.

- **14A — Per-weapon authoritative damage.** New `WEAPON_STATS` table on the
  server mirroring every client `WeaponConfig` (damage / headshot / range /
  falloff / pellets / spread). `onFire` reworked to:
  - resolve the weapon the shooter is *allowed* to fire (their primary, or the
    always-available pistol) and **fall back to the primary** if a client claims
    a stronger gun than it holds (anti-spoof);
  - cast **N pellets** per trigger pull (shotgun = 9) with a server-side spread
    sampler (`perturb`, mirroring `Weapon.firePellet`), nearest-hit per pellet;
  - apply **linear distance falloff** per ray (`computeWeaponDamage`) and
    aggregate damage per target across pellets.
  Verified with a headless two-client smoke test booting the real server:
  sniper **60** (was a flat 24), SMG **5.6**, AR falloff **28.3**, Marksman
  **46.3**, and the spoof case (hold SMG, claim sniper) correctly applies SMG.
- **14B — Marksman (DMR).** A 5th primary between the AR's spray and the Sniper's
  slow one-shot: semi-auto (4.5 RPS), 2-shot body, near-lethal headshot (×2.0,
  96 dmg), very low spread, gentle long-range falloff, no scope. Adds
  `MARKSMAN_CONFIG` (client) mirrored by `WEAPON_STATS.marksman` (server), a
  distinct DMR viewmodel (long receiver + low-profile optic), the Marksman
  loadout button, the Gun Game ladder label, and a `fire_marksman` sound id
  (silent until a wav lands). The `Record<WeaponId>` types compiler-forced
  completeness across viewmodel + ladder.
- **14C — Polish + docs.** Bumped client + server to **v0.14.0** (+ menu
  subtitle/footer), README Phase 14 section + audio-catalog entry, this log.
  Client typecheck + build green (app chunk ~61.8 KB gzip); server typecheck
  green.

### Phase 14 COMPLETE — weapons finally matter in MP + a new precision rifle, no protocol change, solo + MP intact.

---

## Phase 15 — Weapon Mastery progression (v0.15.0)

Now that weapons matter (Phase 14), give each gun its own **progression to
chase** — a per-weapon mastery badge that climbs with lifetime kills, plus a
one-time XP bonus at every tier-up. More reasons to keep playing each weapon =
longer sessions = more ad impressions. Self-contained, client-side,
**migration-safe**, works in solo + MP (kill events already carry `weaponId`).
No protocol change.

- **Account.** New `weaponKills: Record<string, number>` (migration-safe load +
  sanitizer). New `MASTERY_TIERS` ladder — **Bronze 25 / Silver 100 / Gold 300 /
  Diamond 750 / Master 1500** kills, each with an escalating one-time XP reward
  (100→2000). `recordKill(isHeadshot, weaponId?)` now increments the per-weapon
  count, awards the bonus on a tier crossing, and returns a `MasteryUp`
  descriptor. New `weaponMastery(id)` snapshot (tier / next / progress) for the
  UI. Verified with a 15-check headless logic test (boundaries, no-up-before-25,
  up-at-25, +100 XP, snapshot fields, lifetime kills still counted).
- **Tier-up feedback.** New `masteryUp` bus event + `mastery_up` sound id
  (silent until a wav lands). New `ui/MasteryToast.ts` — a light toast that
  slides in from the right ("BRONZE Mastery · Marksman · +100 XP"), queued so
  rapid tier-ups don't clobber. Distinct from the center-screen Announcer so it
  never steals the moment-to-moment focus.
- **Profile tab.** New "Weapon Mastery" grid under Lifetime Stats — every weapon
  with its badge, current tier, a progress bar toward the next tier, and the
  kill goal ("142 / 300 → Gold" or "MAXED").
- **Polish.** Bumped client + server to **v0.15.0** (+ menu subtitle/footer),
  README Phase 15 section + audio-catalog entry. Client typecheck + build green
  (app chunk ~62.9 KB gzip); server typecheck green.

### Phase 15 COMPLETE — per-weapon mastery progression + tier-up rewards, solo + MP, no protocol change.

