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

## Phase 13 — Spatial Awareness & Movement Juice (autonomous build, v0.13.0)

After Phase 12 closed the combat-*feedback* gap, the next biggest Krunker delta is
*spatial awareness* — you can't see the arena layout or where enemies are at a
glance — and the *movement* (already the best part of the game) has no visual
payoff when you're flying on a bhop chain. Phase 13 adds both, plus deepens the
options players keep coming back to tweak (retention → ad impressions).

Guiding constraint (unchanged): **no protocol changes, no new deps, typecheck +
build green each step, solo + MP both keep working.**

- **13A — Minimap / tactical radar.** Top-right canvas radar (the single most
  Krunker-defining missing HUD piece). North-up, whole-arena fit with aspect
  preserved. Draws the static collision footprint (walls/buildings/cover, tall
  boxes brighter), jump pads (yellow ticks), a teal heading-arrow for you, and
  red enemy dots — solo bots or MP remotes, hiding cloaked + dead. Pure client:
  reads `World.staticSolids` + `World.collectJumpPadAABBs()` (new read
  accessors), bot positions, and `MultiplayerSession.forEachRemoteBlip` (new).
  Geometry cache rebuilds only on map change; per-frame draw throttled to 25 Hz.
  New `ui/Minimap.ts`, `#minimap` canvas, General-tab toggle (`ilc.minimap`).
- **13B — Speed lines.** Radial motion streaks at the screen edges that ramp in
  above bhop-tier speed (start 10.5, saturate 18 u/s → max 0.55 opacity). Pure
  CSS overlay driven by `--speed-lines-op` from the frame loop — deliberately
  does NOT touch the camera FOV pipeline (managed in Game.tick) to stay safe.
  New `#speed-lines` element, General-tab toggle (`ilc.speedlines`).
- **13C — Bullet-impact FX.** Every shot that lands pops a small additive burst
  at the hit point — a warm dust puff on world geometry, a red spark on flesh
  (player/bot). Pooled (sparks fire on every shot) with one shared soft radial
  texture; 2–3 sprites per impact scatter + fade in ~0.18s. Works everywhere
  shots flow: local + bot shots via the `shot` bus event, MP remote shots via
  `MultiplayerSession.handleShot`. New `weapons/ImpactFX.ts`.
- **13D — Map health pickups.** Floating health pads (4 per combat map) restore
  +40 HP, then respawn after 12 s. The first real gameplay-loop addition since
  the class abilities — map control + a reason to keep moving, classic arena
  shooter. **Server-authoritative in MP** (the headline risk): server tracks
  availability, checks overlap each tick, heals the grabber's authoritative HP
  (only if hurt — no waste at full HP), broadcasts a `ServerPickupUpdate`, and
  restores all pads on rematch. **Client-local logic in solo** — identical
  overlap→heal→cooldown→respawn run by `PickupManager`. Protocol bumped to **v3**
  (`PickupState`, `ServerWelcome.pickups`, `ServerPickupUpdate`, `EV.Pickup`,
  mirrored in both Protocol.ts files). Shared placement/tuning in
  `maps/Pickups.ts` ⇆ `server/src/Pickups.ts` (MapCollision-style duplication).
  Local grab feedback: `pickup_health` SFX + a green `#heal-flash` vignette
  (dedicated element so it never collides with rush/ghost/kill pseudo-elements).

### Status log
- ✅ Phase 13A — Minimap/radar. DONE (client typecheck + build green; server tsc green). New `ui/Minimap.ts` (canvas radar, DPR-aware, north-up, aspect-fit, map-change-cached geometry). World gained `staticSolids` getter + `collectJumpPadAABBs()`; MultiplayerSession gained `forEachRemoteBlip`; Game gained `currentMapId`. Killfeed nudged below the radar so the two top-right HUD elements stack. Floor/ground boxes filtered (top ≤ 0.4m). Toggle in Settings → General, persisted.
- ✅ Phase 13B — Speed lines. DONE. `#speed-lines` conic-streak + edge-vignette overlay, opacity driven per-frame from horizontal speed; off-switch via `body.no-speedlines`. Toggle in Settings → General, persisted. No camera/FOV changes (kept the existing FOV pipeline untouched).
- ✅ Phase 13C — Bullet-impact FX. DONE (client tsc + build green). New `weapons/ImpactFX.ts` — pooled additive spark sprites (shared radial texture), warm dust on world hits / red sparks on flesh, scatter + fade ~0.18s. Hooked into the `shot` bus handler (local + bots) and `MultiplayerSession.handleShot` (MP remotes). App chunk ~62.7 KB gzip.
- ✅ Phase 13D — Map health pickups. DONE (client+server tsc + client build green; MP handshake validated by ad-hoc socket.io smoke test — Welcome carries 4 available pickups @ protocol v3, snapshots flow, two clients see each other, `tickPickups` survives ticks; temp test not committed). New `entities/PickupManager.ts` (solo-authoritative + MP-reflecting, map-change rebuild, bobbing green crystal+cross pads), shared `maps/Pickups.ts` ⇆ `server/src/Pickups.ts`, server `Room.tickPickups`/`broadcastPickup` + Welcome states + rematch restore, protocol v3 additions mirrored both sides + NetClient `onPickup`. `pickup_health` SFX id + `#heal-flash` green vignette. Full-HP players don't waste packs (guard mirrored client+server).
- ✅ Phase 13E — Polish + docs. DONE. Health pads now render on the minimap (green crosses, dimmed on cooldown) via `PickupManager.forEachPad`. Bumped client+server to v0.13.0 (+ menu subtitle/footer). README Phase 13 section + `pickup_health` audio-catalog entry + deliverables/status updated. Client+server tsc + client build green; app chunk ~64 KB gzip.

### Phase 13 COMPLETE — A–E shipped. Minimap + speed lines + impact FX (pure client) + map health pickups (protocol v3, server-authoritative MP + solo). Solo + MP both intact (smoke-tested).

---

## Phase 14 — Combat & Personalization Juice (autonomous build)

A deliberately **pure-client, zero-protocol** round to balance risk after the
v3 pickup change — small, high-feel touches that reinforce Krunker's instant
feedback + visible-progression loops (retention → ad impressions).

- **14A — Dynamic crosshair hit feedback.** The crosshair briefly recolours +
  scale-pops on a confirmed hit: white = body, gold = headshot, red = kill.
  Reinforces the existing hitmarker without overpowering it; reverts to the
  user's chosen colour. Pure CSS + a small HUD method off the hitConfirm / kill
  bus events.
- **14B — Floating score / heal popups.** A tasteful "+10 XP" gold toast on each
  local frag and a green "+40 HP" on a health-pack grab, drifting up + fading
  just right of centre — the running progression tally Krunker pops on every
  kill. New `ui/ScorePopup.ts` (static API), wired from the kill bus handler
  (main.ts) + `PickupManager.feedback`.

### Status log
- ✅ Phase 14A — Crosshair hit feedback. DONE (client tsc + build green). Transient `ch-fb-hit/head/kill` + `ch-pop` classes on `#crosshair`, cleared after 90/170 ms; HUD `crosshairFeedback()` off hitConfirm + local-kill events.
- ✅ Phase 14B — Score/heal popups. DONE. New `ui/ScorePopup.ts` static toaster (#score-popups, capped at 6, CSS rise+fade). "+10 XP" on local frags, "+40 HP" on grabs. App chunk ~64 KB gzip.
- ✅ Phase 14C — Weapon-finish cosmetics. DONE (client tsc + build green). New `FINISHES` registry (6, 0–2500 XP) emissive sheen over the viewmodel + `findFinish`/`DEFAULT_FINISH`. Account extended migration-safe (`unlockedFinishes`/`equippedFinish`, default kept unlocked on old saves) + `equippedFinishEmissive`. `Viewmodel.setFinish` applies emissive to every Lambert part, re-applied after each weapon rebuild; `Game.applyEquippedFinish` wired on boot + account change. New "Weapon Finish" grid in the Cosmetics tab. Deepens the unlock loop (retention → ad revenue).
- ✅ Phase 14 polish — Bumped client+server to v0.14.0 (+ menu subtitle/footer). README Phase 14 section + deliverables/status. Client+server tsc + client build green; app chunk ~64.5 KB gzip.

### Phase 14 COMPLETE — A–C + polish shipped, pure client, no protocol change, solo + MP intact.



---

## Integration consolidation (manual, by Claude — v0.14.0)

The autonomous routine pushed many parallel feature branches off the same base
instead of building on `main`, so they diverged + conflicted. This pass
hand-integrated the four strongest into one coherent `main`, verifying
typecheck + build after each branch:

- **Phase 13 — Gun Game** (weapon-ladder mode, written directly) — base for the rest.
- **lEs1h — Aim Lab** (Target Rush solo trainer + drills + crosshair presets + Profile PBs).
- **FuwnK — Rank ladder + weapon mastery** (rank badges, level-up FX, +XP popups,
  per-weapon mastery skins) — also brought the Marksman DMR + server-authoritative
  per-weapon damage (real MP combat-feel fix).
- **nP0CT — Minimap + FX + pickups** (tactical radar, bullet-impact sparks, score/heal
  popups, speed lines, map health pickups, weapon-finish cosmetics).

Conflict policy: kept all additive features; where two branches built the *same*
thing, kept one (lEs1h's crosshair presets over FuwnK's duplicate; nP0CT's
health-pickups over t2Opo's power-ups). **t2Opo deliberately NOT merged** — its
power-up system was architecturally incompatible with nP0CT's already-integrated
pickups (different Protocol `Pickup` payloads, `dmr` vs `marksman` weapon id) and
would have needed a from-scratch reconciliation. Its best parts (Marksman,
per-weapon damage) already arrived via FuwnK.

### Result: Gun Game · Aim Lab · rank ladder · weapon mastery · minimap · impact FX ·
### score popups · health pickups · weapon finishes — all on main, tsc + build green.

---

## Publication & Monetization round (manual, by Claude)

Shifted from feature-building to **going live**. No gameplay change in this
round — pure deploy/monetization infrastructure.

- **Combined Vercel deploy.** `vite.config.ts` gained a configurable `base`
  (`/play/` in prod, `/` in dev). New `build-static.sh` assembles `public/`
  (site at root + game at `/play/`); new `vercel.json` runs it, serves `public/`,
  long-caches `/play/assets/*`. `public/` gitignored. Local combined build
  verified (asset paths rewritten to `/play/assets/…`; fixed a Git-Bash
  `MSYS_NO_PATHCONV` leading-slash mangle).
- **Site + game deployed to Vercel** (preview URL; `ilcartigo.com` canonical kept
  for later cutover). MP server NOT auto-deployable here (needs the user's Fly
  login) → documented instead.
- **AdSense approval-ready.** New `website/ads.txt` (comment-only until a real
  `pub-` id). New `ADSENSE.md` — 3-edit switch-on checklist. Placeholders stay
  policy-safe (no real script loads pre-approval). Privacy policy + consent
  banner already satisfy Google's requirements.
- **`DEPLOY.md`** — full 3-piece runbook: Vercel (wired), Fly.io MP server
  (exact `flyctl` sequence + `CLIENT_ORIGIN`/`VITE_SERVER_URL` wiring), domain
  cutover, ops/rollback cheatsheet.
- README + this file updated for accounting.

### Pending on the user: `vercel login` (to run the deploy), `fly` steps for the
### MP server, an approved `ca-pub` id, and registering `ilcartigo.com`.

---

## Phase 15 — Team Deathmatch mode (autonomous build, v0.15.0)

The headline gap in the mode roster was a **team** mode — the most-played format
in Krunker/CS. Phase 15 ships **Team Deathmatch (TDM)** as a self-contained
**solo-vs-bots** mode: BLUE (you + 2 ally bots) vs RED (3 enemy bots), first team
to **50 frags** wins. It doubles as a big **bot-AI upgrade** — bots now fight
each other across team lines, so the arena finally feels alive even when you hang
back. **No protocol change** (MP stays FFA); solo + MP + Gun Game + Aim Lab all
keep working. Typecheck (client + server) + client build green; app chunk
~71.8 KB gzip.

Guiding constraint (unchanged): no protocol changes, no new deps, typecheck +
build green, never break solo / MP / the audit fixes.

**Core systems (low-level, behaviour-preserving for FFA):**
- **Unified bot targeting.** `Bot.update(dt, targets)` now takes a `BotTarget[]`
  and engages the nearest visible **enemy** (different team, alive, not cloaked,
  in range, with LoS). Game builds the list each tick: just the player in
  FFA/Gun Game (so behaviour is *identical* — the only enemy is you), player +
  all bots in TDM (so bots hunt the other team). Vectors are pooled in a cache to
  avoid per-frame allocation.
- **Team-aware friendly fire.** `World.raycast` gained an optional `friendlyTeam`
  param that skips same-team damageables — bullets pass through teammates
  (Krunker convention). Plumbed through `Weapon.ownerTeam` +
  `WeaponInventory.setOwnerTeam` (persisted across `setPrimary`). Set per-match by
  Game; `undefined` everywhere else = FFA (hit anyone but self).
- **`registerDamageable` is now idempotent** — TDM re-runs `syncBotState`, which
  could otherwise double-register a live bot and double its incoming damage.

**TDM mode (`'tdm'` GameMode, `isCombatMode` includes it):**
- **Roster.** Two extra bots (`sentinel`/`raider`) are created up front but stay
  dormant (hidden + unregistered) in Combat / Gun Game so those modes keep their
  original 3-bot feel; `syncBotState` activates the full 5 for a real **3-v-3**.
- **Teams.** `TDM_BOT_TEAM` maps each bot to BLUE/RED; player is always BLUE.
  Bots get a **team colour** (blue/red figure tint, restored to difficulty colour
  in FFA), a **home spawn** anchored on the map's existing `teamSpawns` (scatter +
  solid-nudge on respawn), and their weapon's friendly-fire team.
- **Scoring + win.** `Game.teamScore[2]`; the killer's team scores on every
  cross-team frag (`teamOf(id)` resolves player→0 / bot→team); first to
  `TDM_GOAL` (50) fires `onMatchEnded('team:N')`. `pickSafeSpawn` ignores allies
  in TDM (spawn near friends, away from enemies).

**UI / feel:**
- **HUD ticker** — `#tdm-ticker` "BLUE n vs m RED · first to 50", updated each
  frame, themed blue/red.
- **Scoreboard (Tab)** — TDM renders two team blocks (BLUE then RED) with a
  team-frag header each, members sorted by kills, you highlighted, dotted rank
  markers tinted by team.
- **Post-match** — winner line reads "BLUE/RED TEAM WINS · score–score";
  VICTORY/DEFEAT by *your team's* result (not your rank); win grants +50 XP.
- **Minimap** — allies draw blue, enemies red in TDM (all red in FFA).
- **Menu** — new "⚔ Team Deathmatch (vs Bots)" button (blue accent); ticker
  shown on start, hidden on quit / online / other modes; Play Again resets team
  scores and resumes.

### Status log
- ✅ Phase 15 — Team Deathmatch. DONE (client + server tsc + client build green).
  Low-level: unified `BotTarget` targeting (FFA behaviour preserved), team-aware
  `raycast`/`Weapon.ownerTeam`/`WeaponInventory.setOwnerTeam`, idempotent
  `registerDamageable`. Mode: `'tdm'` 3-v-3 with team colours, home spawns,
  friendly-fire, team scoring + 50-frag win, TDM scoreboard/ticker/post-match,
  team-coloured minimap. Two dormant TDM-only bots (sentinel/raider) keep
  FFA/Gun Game at their original 3-bot roster (filtered out of FFA scoreboard +
  Gun Game ladder). Version bumped to v0.15.0 (+ menu subtitle/footer).

### Phase 15 COMPLETE — solo TDM mode + bots-fight-bots AI, no protocol change,
### solo + MP + Gun Game + Aim Lab all intact.

---

## Phase 16 — Bot identity + difficulty selector (autonomous build, v0.16.0)

A pure-client, zero-protocol round that **broadens the audience** (Easy for new
players, Hard for veterans → longer sessions → more ad breakpoints) and makes
bots read like real opponents — both amplify every solo mode (FFA / TDM / Gun
Game). Typecheck (client + server) + client build green; app chunk ~72 KB gzip.

- **Bot difficulty (Easy / Normal / Hard).** A menu selector (persisted to
  `ilc.difficulty`) scales the whole roster's **AI feel** — reaction window, aim
  jitter cone, predictive lead, and fire cadence — via a `SKILL` table layered on
  each bot's per-tier preset. Deliberately scales the *feel*, not weapon stats, so
  there's no weapon rebuild and it applies live. `Bot.setDifficulty` +
  `Game.setDifficulty` (re-applied in `syncBotState` so freshly-activated TDM
  bots inherit it). Easy = slow + sloppy + barely leads; Hard = snappy, accurate,
  leads hard.
- **Humanized bot callsigns.** Each bot gets a stable callsign (Drifter / Viper /
  Specter / Bishop / Havoc) shown in the killfeed, scoreboard, and death recap —
  the *id* stays the scoring key. New `Game.displayNameFor(id)` unifies naming
  (local handle / bot callsign / short MP id); HUD killfeed + recap + main.ts
  scoreboard all route through it (replacing the old "Engager Bot" difficulty
  labels and raw short-ids for bots).

### Status log
- ✅ Phase 16 — Bot identity + difficulty. DONE (client + server tsc + client
  build green). `GameDifficulty` + `SKILL` modifier table in Bot; `setDifficulty`
  on Bot + Game; menu Easy/Normal/Hard selector (`data-diff`, excluded from the
  weapon-selector query) persisted + applied live + on boot. Bot callsigns via
  `BOT_CALLSIGN` + `Game.displayNameFor`, wired into HUD killfeed/recap +
  scoreboard `participantName`. Version bumped to v0.16.0 (+ menu subtitle/footer).

### Phase 16 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 17 — Enemy nameplates + health bars (autonomous build, v0.17.0)

Pairs with Phase 16's callsigns: floating **callsign + HP bar** over bots — a
Krunker staple that makes combat instantly readable + juicy, and surfaces the
new names where they matter (mid-fight, not just the killfeed). Pure client, no
protocol change. Typecheck + build green; app chunk ~72.9 KB gzip.

- New `ui/Nameplates.ts` — one billboarded `THREE.Sprite` per bot, drawn from a
  pooled canvas (team-tinted callsign on top, green→amber→red rounded HP bar
  under it). **`depthTest: true`** so walls naturally occlude plates — you can't
  read enemies through geometry (fair, no wallhack). Perspective gives distance
  shrink for free; plates fade out 60→75 m and hide past 75 m or when the bot is
  dead/inactive. In TDM the callsign is team-coloured (allies blue, enemies red).
- Cheap: the canvas only redraws when a bot's HP bucket / team / name changes;
  per-frame cost is just repositioning visible sprites. Ticked from
  `Game.onFrame`.
- Solo only (reads `game.bots` HP directly; MP remotes don't broadcast HP — a
  future protocol-touching item). Toggle in Settings → General (`ilc.nameplates`,
  default on).

### Status log
- ✅ Phase 17 — Enemy nameplates. DONE (client tsc + build green). `Nameplates`
  class (sprite-per-bot, canvas callsign + HP bar, depthTest occlusion, distance
  fade, TDM team tint), wired into main.ts (`update()` in onFrame) + a
  General-tab toggle. Bumped to v0.17.0 (+ menu subtitle/footer).

### Phase 17 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 18 — Cobalt arena (autonomous build, v0.18.0)

The third combat map — fresh content is the biggest single driver of "one more
game." **Cobalt** is the first map built for pure **competitive symmetry**
(mirrored about both axes, so no TDM side has an edge) and a cool steel-blue +
teal-neon palette for instant visual contrast with warm Sandstone and rusty
Industrial. Selectable for all solo combat modes (FFA / TDM / Gun Game).

- New `maps/CobaltMap.ts` — 84×84 arena: perimeter walls, a raised central
  platform (jump-pad ring, pillar + corner cover), two symmetric raised team
  decks (N/S, with front parapets) for TDM identity + high ground, diagonal
  crate cover, E/W flank walls to break cross-map sightlines, and low steppable
  spawn bumps. Verticality is entirely jump-pad-driven (no mid-height ledges that
  snag the 0.55 m step-up). Emissive teal trim for flair (non-colliding).
- Wired everywhere a map id flows: `MapId` union, `Game.MAPS`, the menu map grid
  (now 3-wide) + selector validation, and **health pickups** added for Cobalt in
  both `maps/Pickups.ts` and `server/Pickups.ts` (kept in sync, though the MP
  server never loads Cobalt — it's solo-only; MP still serves Sandstone/
  Industrial via the server's authoritative `Welcome.mapId`).

### Status log
- ✅ Phase 18 — Cobalt arena. DONE (client + server tsc + client build green).
  New symmetric map + full wiring (MapId/MAPS/menu/validation), Cobalt health
  pickups mirrored client+server, 3-column map grid. Solo-only (MP unaffected —
  server map stays authoritative). Bumped to v0.18.0 (+ menu subtitle/footer).

### Phase 18 COMPLETE — additive map, no protocol change, solo + MP intact.

---

## Phase 19 — Solo FFA match objective + post-match (autonomous build, v0.19.0)

The default mode ("Play vs Bots" / solo combat) was the only combat mode with
**no win condition** — it ran forever, so it never hit the post-match overlay
(the game's main natural ad breakpoint). Phase 19 gives it a real match: first
participant (you OR a bot) to the kill goal (30) wins → post-match → Play Again.
Directly increases ad impressions on the most-played mode + adds a sense of
completion. Pure client, no protocol change.

- **Solo FFA match end** in `Game`'s kill handler (combat mode, no server; MP's
  end stays server-authoritative, TDM/Gun Game own theirs). Reuses the existing
  post-match overlay + Play Again reset.
- **FFA match ticker now shows in solo** too (was MP-only) — your kills / goal +
  the current leader, so you can see the race.
- **Callsign polish everywhere** — the match ticker leader, post-match winner
  line, and post-match scoreboard rows now show bot callsigns (via
  `Game.displayNameFor`) instead of raw ids; removed the now-dead `shortId`
  helper in HUD.

### Status log
- ✅ Phase 19 — Solo FFA match + post-match. DONE (client + server tsc + client
  build green). Solo combat ends at MATCH_KILL_GOAL via the kill handler; match
  ticker un-gated to solo; displayNameFor used in ticker/post-match. Bumped to
  v0.19.0 (+ menu subtitle/footer).

### Phase 19 COMPLETE — pure client, no protocol change, solo + MP intact.
