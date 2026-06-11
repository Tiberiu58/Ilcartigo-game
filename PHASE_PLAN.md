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

## Phase 14 — Solo match flow + win/lose stakes (v0.14.0)

Solo Combat (vs bots) was endless — no winner, no stakes, and crucially **no
post-match ad breakpoint**. Most casual traffic plays solo, so wiring a real
match ending here is the single highest-leverage revenue move *and* a Krunker-feel
upgrade (every match now resolves to VICTORY/DEFEAT). Self-contained, client-only,
no protocol change, MP untouched.

- **Solo combat now ends.** First participant (you OR a bot) to reach
  `Game.soloKillGoal` (20) wins → the existing post-match overlay fires with the
  scoreboard + the **post-match ad slot** (`Ads.refreshSlot('postmatch')`). MP
  match-end stays server-authoritative; Gun Game keeps its ladder win; Practice
  never ends. Decided in `Game`'s kill handler, guarded by `!mp && mode==='combat'
  && !matchEnded`.
- **`Game.currentKillGoal()`** — returns the solo goal (20) or the MP goal (30)
  for the current context. The Tab scoreboard goal + the HUD ticker goal both read
  it, so solo and MP each show the right target.
- **Score ticker now shows in solo combat too** (was MP-only). Leader name uses
  the friendly bot label (e.g. "Engager Bot") via `HUD.killerName`, so the ticker
  reads "leader: Engager Bot (12)" instead of a raw id.
- **`Game.restartSoloMatch()`** — Play Again in solo now clears the score, resets
  the local streak, respawns every bot, and re-drops the player, so each round
  starts even (previously only the score map was cleared). Gun Game still also
  re-seeds its ladder.
- **Punchier result + friendly names.** Post-match title is now `VICTORY` /
  `DEFEAT` (was the flat "MATCH OVER"); the winner line + scoreboard rows resolve
  bot/MP ids through `participantName` (handle / "Predictor Bot" / short tag).
- Version bumped to v0.14.0 (client + server + menu subtitle/footer). Typecheck
  (client + server) + client build all green; app chunk ~61.7 KB gzip.

### Phase 14 COMPLETE — solo match flow shipped, MP + Gun Game + Practice intact, no protocol change.

---

## Phase 15 — One Shot (OHKO) mode (v0.15.0)

A second new mode — the classic instagib/"one hit knockout". Fast, brutal, and
instantly readable, it's one of the most popular Krunker modes. Implemented as a
**modifier on Combat** (not a separate `GameMode`), so the score ticker,
match-end, post-match overlay, and Play Again all reuse the combat path for free
— minimal surface area, lowest risk. Solo-only, client-only, no protocol change.

- **Every hit is lethal.** New `Weapon.damageMultiplier` static (default 1, no
  effect anywhere) is multiplied into `computeDamage`. The variant sets it to
  100 so any clean hit kills — applied to **all** weapons (player + bots) so
  everyone dies in one shot. Harmless in MP: the client never lands authoritative
  damage on remotes (server runs hitscan), and the multiplier is force-reset to 1
  whenever the variant is off / on entering MP / on quit.
- **`Game.oneShot` flag + `Game.setOneShot(on)`** flip the multiplier. The player
  is armed with a **sniper** on entry for the instagib feel; their chosen loadout
  weapon is restored on quit (same path Gun Game uses). The sniper persists across
  respawns (respawnPlayer doesn't touch the inventory).
- **New "💥 One Shot (vs Bots)" menu button** → `startOneShot()` (calls
  `startGame('combat')` to reset state, then enables the variant). A hot-red
  **ONE SHOT badge** sits where the Practice badge does. `setMode` early-returns
  on combat→combat, so the flag is reset explicitly in `startGame` rather than via
  `setMode`.
- Reuses the Phase 14 solo match flow: first to 20 kills wins → VICTORY/DEFEAT +
  ad breakpoint. Typecheck (client + server) + client build green; app chunk
  ~61.8 KB gzip; no new deps.

### Phase 15 COMPLETE — One Shot shipped as a combat modifier, MP + other modes intact, no protocol change.

---

## Phase 16 — Post-match progression celebration (v0.16.0)

The post-match overlay is the game's prime ad breakpoint, but it only showed a
flat XP total. Phase 16 makes finishing a match *feel* rewarding — an animated
level + XP bar and a LEVEL UP / NEW BEST STREAK callout — which keeps players on
the (ad-bearing) screen a beat longer and reinforces the progression loop that
brings them back. Pure client-side, no protocol change.

- **Animated level + XP bar** on the post-match card: shows your level, XP into
  the level, and a gold bar that fills 0 → current every time the screen appears
  (reset-reflow-set trick on the CSS width transition).
- **Celebration callout** — a popped, glowing line for the best thing that
  happened this match: a **LEVEL UP** (beats everything) else a **NEW BEST
  STREAK**. Computed from a `captureMatchStart()` snapshot (level + best streak)
  taken at every match start (solo, One Shot, Gun Game, MP connect, Play Again,
  MP MatchReset), compared against the post-award account state.
- New DOM (`pm-progress`/`pm-callout`/`pm-xp-bar`) + CSS (bar, fill transition,
  callout pop keyframes). Typecheck (client + server) + build green; app chunk
  ~62.0 KB gzip; no new deps.

### Phase 16 COMPLETE — post-match progression celebration shipped, all modes intact, no protocol change.

---

## Phase 17 — Rank identity (v0.17.0)

Levels existed but were invisible outside the settings page — players had no
climbable *identity*. Phase 17 maps level → a named rank tier (Rookie → Bronze →
Silver → Gold → Platinum → Diamond → Master → Legend) and surfaces it where it
motivates: the menu, the scoreboard, and the post-match screen. A clear ladder to
climb is a proven retention hook (more sessions → more ad impressions). Pure
client-side, no protocol change.

- **`Account.rank` getter + `RANK_TIERS` / `rankForLevel`** — 8 tiers, each with a
  name + signature colour + minLevel. Early tiers come every couple of levels
  (rewarding); the top tiers are a long chase.
- **Main-menu profile chip** — name · rank · level, in a rounded pill under the
  title. Updates on boot and on any `account.onChange` (XP, name, unlocks). Rank
  colour drives a CSS custom property + glow.
- **Scoreboard badge** — the local player's row is prefixed with their coloured
  rank name (bots/remotes have no local rank, so they're unbadged).
- **Post-match** — the progression block's level row now leads with the coloured
  rank badge.
- Typecheck (client + server) + build green; app chunk ~62.4 KB gzip; no new deps.

### Phase 17 COMPLETE — rank identity shipped across menu/scoreboard/post-match, all modes intact, no protocol change.

---

## Phase 18 — In-match level-up / rank-up toast (v0.18.0)

Phases 16–17 added levels + ranks, but the *moment* of leveling up was only ever
seen on the post-match screen. Phase 18 surfaces it live: when a kill pushes you
over a level boundary, a toast pops under the score ticker — and a **rank-up**
(crossing into Bronze/Silver/… ) takes the headline in the new rank's colour. A
mid-fight dopamine hit that rewards staying in the match. Pure client-side, no
protocol change.

- **`Game.onLevelUp(level, newRank|null)`** — the per-kill XP award now snapshots
  level + rank name before `awardXP(10)` and fires the callback when the level
  increases; `newRank` is set only when the tier also changed.
- **Dedicated `#levelup-toast`** (separate from the kill announcer so they never
  collide on the same kill): "LEVEL UP · Lv N", or "RANK UP · {RANK}" in the rank
  colour. Pops via a keyframe, plays the kill-feedback sting, auto-hides after
  2.6 s; lives inside `#hud` so it's gone on the menu / post-match.
- Also caught + fixed a latent bug Phase 14 exposed: `setMode` early-returns on a
  same-mode transition (combat→quit→combat), so `resetMatchScore` wasn't running
  on a fresh start — a second solo match would inherit stale kills + the
  `matchEnded` flag and never end. `startGame`/`startOnline` now reset the score +
  streak explicitly. (Shipped as its own commit before this phase.)
- Typecheck (client + server) + build green; app chunk ~62.6 KB gzip; no new deps.

### Phase 18 COMPLETE — live level-up/rank-up toast shipped, all modes intact, no protocol change.

---

## Phase 19 — Skill-based XP + floating "+XP" popups (v0.19.0)

XP was a flat 10/kill. Phase 19 makes it skill-weighted and *visible*: headshots
pay a bonus, and every kill floats a "+XP" popup by the crosshair (Krunker's
"+score" feel). Faster, skill-correlated leveling → more level-up toasts → more
reasons to keep playing. Pure client-side, no protocol change.

- **`Game.KILL_XP` (10) + `HEADSHOT_BONUS_XP` (5)** — the per-kill award is now
  `10 (+5 on a headshot)`. `Game.matchKillXp` accumulates the accurate per-match
  kill XP (bonuses included), reset with the match score and read by the
  post-match breakdown (was a naive `kills × 10`).
- **`Game.onXpGain(amount, isHeadshot)`** → a floating `.xp-pop` ("+10" / gold
  "+15 HS") that rises + fades right of the crosshair; capped at 6 concurrent so
  a spree can't pile up DOM.
- Reset hygiene: `matchKillXp` clears in `resetMatchScore`; the MP MatchReset
  path now also calls `resetMatchScore` + clears the streak so rematches start
  clean (caught while wiring the accurate breakdown).
- Typecheck (client + server) + build green; app chunk ~62.8 KB gzip; no new deps.

### Phase 19 COMPLETE — skill XP + floating popups shipped, all modes intact, no protocol change.

---

## Phase 20 — Smarter pursuing bots (v0.20.0)

Solo combat is now the headline (real matches → post-match ad). It needs to *feel*
alive, but bots only stood and sidestepped — they never closed distance or hunted
you. Phase 20 gives them spatial intent so fights move around the arena. Client-
only (MP has no bots), no protocol change.

- **Range-keeping in ENGAGE** — bots hold a `PREFERRED_RANGE` (16 u, ±5 deadzone):
  they advance when too far and back off when crowded, on top of the existing
  sidestep. Fights now flow instead of being a stand-still trade.
- **Last-known-position hunting** — on losing line of sight, a bot remembers where
  it last saw you and moves there at a brisk pace (REPOSITION), giving up to IDLE
  patrol only once it arrives without re-acquiring. (The old REPOSITION just
  drifted to a fixed waypoint — the "hunt last known pos" the comment promised was
  never implemented.)
- Refactor: shared `moveToward(x, z, speed, dt)` powers patrol + hunt; reaction
  time, aim jitter, fire rate, and difficulty tiers are all unchanged, so the
  challenge curve only gets *more dynamic*, not harder/unfair. Hunt state clears on
  respawn.
- Typecheck (client + server) + build green; app chunk ~63.0 KB gzip; no new deps.

### Phase 20 COMPLETE — pursuing bot AI shipped, solo only, MP + protocol untouched.

---

## Phase 21 — Daily challenges at the post-match breakpoint (v0.21.0)

Daily challenges existed but were buried in a Settings tab — players rarely saw
them, so they didn't drive return visits. Phase 21 surfaces them on the post-match
overlay (the ad-bearing breakpoint everyone passes through): live progress bars +
inline **Claim** buttons. A claimable challenge sitting right there is a strong
"one more match / come back tomorrow" hook. Pure client-side, reuses existing
account APIs, no protocol change.

- **`#pm-challenges` strip** on the post-match card — renders `account.dailyChallenges`
  with the Profile tab's `.chal-row` markup (label, progress bar, `n/goal`, and a
  +reward / Claim / Claimed state). Since lifetime stats are recorded during/at
  match end, a just-completed challenge (e.g. "Win a match") shows ready-to-claim
  on the very screen you earned it.
- **Inline claim** — delegated click → `account.claimChallenge(id)` awards the
  bonus XP and re-renders the strip in place (button flips to "Claimed ✓"); the XP
  flows through `account.onChange` to the menu chip / Profile tab too.
- Typecheck (client + server) + build green; app chunk ~63.2 KB gzip; no new deps.

### Phase 21 COMPLETE — post-match daily challenges shipped, all modes intact, no protocol change.

