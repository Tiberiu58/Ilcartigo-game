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

## Routine integration round (v0.24.0) — two branches merged

Two autonomous branches built in parallel off the same base, each numbering its
work "Phase 15+". Both were hand-merged onto `main` together (resolving the
overlap in `Game.ts`/`Bot.ts`/`main.ts`/`index.html`/`Pickups.ts` — both added a
3rd map + a new mode + new bot fields). All additive, nothing dropped; unified
release **v0.24.0**, typecheck + build green. Branch A (TDM line) log first, then
Branch B (Onslaught line).

### Branch A — TDM / weapons / content (Phases 15–23)

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

---

## Phase 20 — Quick melee (autonomous build, v0.20.0)

The universal close-range "panic button" every arena shooter has — a fast knife
strike on **V** / **F** that doesn't require a weapon swap. Satisfying way to
finish a rush; high skill-expression in a bhop fight. Pure client, no protocol
change.

- New `melee` input action (bound to KeyV + KeyF). `Game.doMelee()` — a short
  forward raycast (3.2 m, 55 dmg, ×1.3 on a head), ~0.6 s cooldown, reusing the
  damage/kill bus so killfeed, XP, hitmarker, impact spark, screen-shake and
  announcer all "just work" (`weaponId 'knife'`, harmless to mastery). Friendly-
  fire-aware in TDM (passes the player's team to `raycast`).
- `Viewmodel.meleeSwing()` — a quick down-left arc (rotation + offset) that
  returns to rest; idle is a no-op so it never disturbs the normal pose.
- **Solo only** — MP damage is server-authoritative and there's no melee in the
  protocol, so a client-only hit would mislead; gated at the call site. New
  `melee` SoundId + audio-catalog entry (silent until the asset lands). How-to
  card + README controls updated.

### Status log
- ✅ Phase 20 — Quick melee. DONE (client + server tsc + client build green).
  Input action + bindings, Game.doMelee (raycast + bus reuse + TDM friendly
  fire + cooldown), Viewmodel swing, melee sound id, howto/README/controls.
  Bumped to v0.20.0 (+ menu subtitle/footer).

### Phase 20 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 21 — Frag grenade (autonomous build, v0.21.0)

A thrown explosive on **G** — the other classic arena throw, adding area-denial
+ a high-skill arc lob to the solo sandbox. Pure client, no protocol change.

- New `entities/GrenadeManager.ts` — pooled grenades that arc under gravity,
  settle on the first solid/ground contact, and detonate on a ~1.4 s fuse: a
  bright `CastFX.flash` + expanding `CastFX.wave` shockwave + impact spark +
  proximity screen-shake, and a LoS-gated area burst (radius 6.5, up to 95 dmg,
  linear falloff) against bots. Reuses the damage/kill bus (`weaponId
  'grenade'`); TDM teammates are skipped; self-damage omitted (PvE-friendly).
- New `grenade` input action (KeyG); `Game.throwGrenade()` with a ~6 s cooldown,
  solo-only + pointer-lock-gated (same safety as melee). `applyShake` promoted to
  public for the manager. New `grenade_explode` sound id + catalog entry; how-to
  card + README controls updated.
- Melee hardening from this round: gated on pointer-lock so a stray V/F in a menu
  can't damage bots.

### Status log
- ✅ Phase 21 — Frag grenade. DONE (client + server tsc + client build green).
  GrenadeManager (arc + settle + fuse + AoE/LoS/falloff + FX), input action +
  cooldown + solo/lock gating, public applyShake, grenade sound id, docs. Bumped
  to v0.21.0 (+ menu subtitle/footer).

### Phase 21 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 22 — LMG weapon (autonomous build, v0.22.0)

A seventh weapon adds loadout variety (the thing every player touches). The
**LMG** is a belt-fed suppressor — a distinct sustained-fire archetype that wins
by volume + area denial rather than precision.

- `LMG_CONFIG` (60-round mag, 11 RPS, 20 dmg, heavy bloom + 3.2 s reload) added
  to `WEAPON_LIBRARY`; a chunky `buildLMG` viewmodel; a `SERVER_WEAPONS['lmg']`
  damage profile + `VALID_WEAPONS` entry so it's authoritative in MP too; a
  loadout button. Added `lmg` to the exhaustive `WEAPON_LABEL` map.
- Not on the Gun Game ladder (kept at its fixed six rungs); mastery skins simply
  don't list it yet (`weaponSkinsFor('lmg')` → []), which is safe.

### Status log
- ✅ Phase 22 — LMG. DONE (client + server tsc + client build green). Weapon
  config + viewmodel builder + server damage/valid-weapon + loadout button +
  WEAPON_LABEL. Bumped to v0.22.0 (+ menu subtitle/footer).

### Phase 22 COMPLETE — additive weapon, no protocol change, solo + MP intact.

---

## Phase 23 — Grenade HUD indicator + LMG mastery (autonomous build, v0.23.0)

Polish that closes the loop on the two prior phases.

- **Grenade readiness pill** (`#utility-pill`, bottom-centre by the ability pill)
  — a "G · FRAG" chip whose bar empties on throw and refills over the 6 s
  cooldown, glowing gold when ready. Solo-only (hidden in MP, where grenades are
  disabled). New `Game.grenadeReadyFraction` getter + `HUD.tickUtilityPill`.
- **LMG mastery skins** — three (Gunner/Verdant/Molten) + `lmg` added to
  `WEAPON_SKIN_ORDER`, so the new weapon participates in the use-to-unlock
  cosmetics loop like every other gun (was the only weapon without one).

### Status log
- ✅ Phase 23 — Grenade HUD + LMG mastery. DONE (client + server tsc + client
  build green). Utility pill (HTML + CSS + HUD tick + readiness getter), LMG
  mastery skins + order. Bumped to v0.23.0 (+ menu subtitle/footer).

### Phase 23 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Run summary (phases 15–23, this autonomous session)

A nine-phase solo-expansion arc, each typecheck + build green, no protocol
changes, MP + every prior mode left intact:

15 Team Deathmatch · 16 bot difficulty + callsigns · 17 enemy nameplates ·
18 Cobalt arena (3rd map) · 19 solo FFA matches (post-match ad breakpoint) ·
20 quick melee · 21 frag grenade · 22 LMG weapon · 23 grenade HUD + LMG mastery.

### Branch B — Onslaught / Overpass (Phases 15–17)

## Phase 15 — Onslaught (wave survival) mode (autonomous build, v0.15.0)

Back to gameplay. Mode variety is the #1 replay driver in arena shooters, and
the strongest **solo** hook we were missing is a high-score chase: ILCARTIGO
runs single-player without a deployed server, so the most valuable next mode is
one that's *inherently* fun offline and ends on a results card (a natural ad
breakpoint → revenue). **Onslaught** is exactly that — endless waves of bots,
escalating in size + difficulty, a small pool of lives, "beat your best wave".

Guiding constraint (kept): **no protocol changes, no new deps, typecheck + build
green each step, solo + MP both keep working.**

Design (why it's low-risk + self-contained):
- **SOLO only. Zero protocol / server / controller changes.** It reuses the
  existing bot-vs-player AI verbatim — wave bots are ordinary `Bot`s that simply
  don't auto-respawn (`Bot.autoRespawn = false`), so every wave-bot death IS a
  player frag and the kill bus → XP / stats / killfeed / announcer / mastery all
  "just work" with no special-casing.
- **The mode owns the roster only while it runs.** `Game.setSurvivalActive(true)`
  parks the persistent base bots (deactivate + unregister); each wave spawns its
  own *ephemeral* bots via `Game.spawnSurvivalBot`, disposed wholesale between
  runs by `Game.clearSurvivalBots` (new `Bot.dispose` frees mesh + damageable
  registration). `syncBotState` early-outs while survival is active so it can't
  re-activate the base roster mid-run.
- **Lives + waves.** 3 lives. Each wave spawns `min(8, 2 + ⌊wave·1.2⌋)` bots; the
  difficulty mix climbs (early = wanderers; wave 3+ adds engagers; wave 6+
  sprinkles predictors). Clearing a wave **fully heals** you + banks a scaling
  bonus (`25 + wave·15` XP) and a 3 s breather with a big "WAVE n" banner. Player
  death spends a life (Onslaught owns respawn timing — `Game`'s solo auto-respawn
  is gated off for `mode === 'onslaught'`). Lives exhausted → results card.
- **Results card + PB.** "OVERRUN" card shows waves survived, eliminations, best
  wave, bonus XP, NEW-BEST flag; personal best persists to `localStorage`
  (`ilc.onslaught.best`), surfaced on the menu button (`☠ Onslaught · best wave N`)
  and in the Profile → Bests grid. Card carries an `onslaught` ad slot.

New `modes/Onslaught.ts` (Game-coupled controller, like AimLab) + `'onslaught'`
GameMode + Bot lifecycle additions + HUD ticker (`WAVE n · k left · ♥♥♥`) +
wave banner + results card + menu button. Headless logic test (mock Game/bus)
confirmed wave scaling (3→4→…), heal-on-clear, +XP bonus, 3-lives→2-respawns→
game-over, and PB persistence.

### Status log
- ✅ Phase 15 — Onslaught. DONE (client+server tsc + client build green; headless
  state-machine test passed). New `modes/Onslaught.ts`; `Bot.autoRespawn`/
  `ephemeral`/`dispose()`; `Game.setSurvivalActive`/`spawnSurvivalBot`/
  `clearSurvivalBots`/`livingSurvivalBots`/`healPlayerFull`/`survivalSpawns` +
  `'onslaught'` mode (combat-class, auto-respawn gated to the controller). UI:
  menu button, HUD ticker, "WAVE n" banner, OVERRUN results card (+ ad slot),
  Profile best. Versions bumped to v0.15.0. App chunk ~71.8 KB gzip (+1.6 KB).

### Phase 15 COMPLETE — solo wave-survival mode, no protocol change, solo + MP intact.

---

## Phase 16 — Overpass (new combat map) (autonomous build, v0.16.0)

Maps are the highest-leverage *content* in arena shooters — Krunker's pull is
dozens of them — and a new map immediately deepens **every** solo mode at once
(Combat, Gun Game, Onslaught, and the map selector). ILCARTIGO had only two
combat maps (Sandstone, Industrial); Phase 16 adds a third with a distinct
identity: **verticality**.

- **Overpass** — an urban-dusk arena built around a raised **E-W bridge deck**
  (the dominant sniper sightline, y=5) over two ground-level **container lanes**
  (close-quarters cover) with four mid-height **corner decks** (y=3). Cool
  concrete + steel palette, teal accents, sodium-orange pads, deep-blue dusk fog.
- **Reliable vertical access.** The bridge is reached by a **staircase on-ramp at
  each end** (treads < the controller's 0.55 m auto-step, so you climb smoothly —
  no air-control RNG). Corner decks are reached by jump pads placed *outside*
  their footprint (open sky above, run-up momentum carries you on). Falling off
  the bridge just drops you to ground level — fully enclosed, no void/death pit,
  so the high ground stays inviting.
- **Solo-selectable, zero-risk to MP.** New `maps/OverpassMap.ts` (proven
  Sandstone/Industrial `addBox`/`addJumpPad`/`buildStairs` pattern) + `'overpass'`
  in the `MapId` union + `MAPS` registry + a loadout map button. The MP server
  still runs Sandstone by default and clients adopt the server's map, so Overpass
  needs no protocol/server change; online support later just wants its AABBs in
  `server/src/MapCollision.ts`. Health-pack placements added to **both**
  `maps/Pickups.ts` ⇆ `server/src/Pickups.ts` (kept in sync).
- **Verified geometry headlessly.** A mock-World harness ran the real `build()`
  and asserted **all FFA + TDM spawns sit clear of every solid** (caught + fixed
  an initial bug where corner spawns were embedded inside the corner-deck boxes),
  61 solids / 4 pads built, deck surface walkable.

### Status log
- ✅ Phase 16 — Overpass map. DONE (client+server tsc + client build green;
  headless spawn-clearance + build smoke test passed). New `maps/OverpassMap.ts`
  (bridge deck + end staircases + corner decks + container lanes + perimeter +
  dusk lighting/fog), registered in `MapId`/`MAPS`, loadout button, corrupt-value
  guard generalised to a `COMBAT_MAPS` list, Overpass pickups mirrored client +
  server. Versions bumped to v0.16.0. App chunk ~72.9 KB gzip (+1.1 KB geometry).

### Phase 16 COMPLETE — third combat map, solo-selectable, no protocol change, solo + MP intact.

---

## Phase 17 — Onslaught boss waves + HP scaling (autonomous build, v0.17.0)

A focused depth pass on the freshly-shipped survival mode — the cheapest way to
make an endless-wave loop *memorable* is a recurring escalation beat. Pure
client, builds straight on Phase 15.

- **Boss waves every 5th wave.** A tanky emissive **elite** (predictor brain,
  `220 + wave·12` HP, dark-crimson body with a pulsing red glow) leads a smaller
  add pack. A boss-styled "WAVE n · ☠ BOSS WAVE ☠" banner (deeper red, glowing,
  longer dwell) + a stinger announce it; clearing it pays **double** the wave
  bonus.
- **Per-wave HP creep.** Regular wave bots scale `100 + (wave−1)·8` HP (capped
  180) so late waves stay threatening even before the next boss.
- **Minimal, safe surface.** New `BotOptions` (`maxHp` / colour / `emissive` /
  `elite`) threaded through `Bot` + `Game.spawnSurvivalBot` — the default 3-bot
  roster and every other mode are untouched (all pass no opts → identical
  behaviour). No size/AABB change (elites are normal-sized → hitboxes stay
  correct), no protocol change.

### Status log
- ✅ Phase 17 — Onslaught boss waves. DONE (client+server tsc + client build
  green; headless state-machine test confirmed wave 5 = boss elite @ 280 HP /
  count 6, regular HP creep +8/wave, boss XP doubled). `Bot.BotOptions` +
  `elite` flag + emissive glow, `Onslaught.beginWave` boss/HP logic, boss banner
  variant (CSS + main.ts). Versions bumped to v0.17.0. App chunk ~73.1 KB gzip.

### Phase 17 COMPLETE — boss-wave escalation, pure client, no protocol change, solo + MP intact.

---

## Integration result (v0.24.0, by Claude)

Both branches above merged onto `main` feature-by-feature, conflicts resolved by
hand (kept both maps Cobalt + Overpass, both modes TDM + Onslaught, unified the
two Bot type sets — `GameDifficulty` global skill + `BotDifficulty` per-tier +
`BotOptions` wave overrides). Client + server typecheck + client build all green;
app chunk ~78 KB gzip, 89 modules. Versions unified to **v0.24.0**. The
deliberately-unmerged t2Opo power-up branch from the prior round remains
unmerged (still conflicts with the health-pickup system).

---

## Phase 25 — Arena Power-Ups (autonomous build, v0.25.0)

The first new *gameplay-loop* addition since map health pickups, and the
long-deferred roadmap item "arena power-ups (damage boost / haste)". Every prior
attempt was shelved because a routine branch (t2Opo) entangled power-ups with
the **health-pickup wire protocol** (its own `Pickup` payload + a `dmr` weapon),
which would have meant a from-scratch protocol reconciliation. This round sidesteps
that entirely: power-ups are a **solo-only, weapon-layer** system with **zero
protocol/server/controller change** — so MP, the two-controller sync, and every
audit fix are all untouched.

Guiding constraint (kept): no protocol changes, no new deps, typecheck + build
green, never break solo / MP / the audit fixes.

**Design (why it's low-risk + self-contained):**
- **New `entities/PowerupManager.ts`** — mirrors the proven `PickupManager`
  render/solo-logic pattern, but is *fully independent* of the health-pickup
  data + protocol (no shared `Pickups.ts`, no wire types). Two buff pads per
  combat map:
  - **OVERCHARGE** (crimson gem) → `Weapon.damageMultiplier` ×1.7 for 9 s.
  - **RAPID FIRE** (gold gem) → `Weapon.fireRateMultiplier` ×1.55 for 9 s.
  Pads bob/spin, are grabbed by overlap (player-only — bots don't grab), then go
  on a 20 s respawn. Map-control loop: rotate to the buff, fight over it, lose it
  when you die.
- **Weapon-layer effects only.** New `Weapon.damageMultiplier` (in
  `computeDamage`) + `fireRateMultiplier` (in `tryFire`'s cooldown), driven by
  `WeaponInventory.setDamage/FireRateMultiplier`, persisted across `setPrimary`
  exactly like `reloadMultiplier` + `ownerTeam`. Nothing touches movement,
  networking, or the server controller.
- **Solo combat / TDM / Onslaught only.** `PowerupManager.active()` early-outs
  in MP (server-authoritative damage — a client buff would mislead), Gun Game
  (keeps its ladder identity), and Practice; pads hide there. Buffs clear on
  death (`respawnPlayer` → `clearBuffs`) and on every fresh match
  (`resetMatchScore` → `powerups.resetAll` + `clearBuffs`).
- **Safe placement, no per-map curation.** Pad positions derive from each map's
  FFA spawn anchors (`game.mapSpawns`, guaranteed clear of solids), pulled 45%
  toward map centre for contested space, with a `clearOf` solid-overlap fallback
  to the raw anchor — so a future map can never embed a pad in geometry.

**Feel / UI:**
- Grab fires `pickup_powerup` SFX, a coloured `CastFX.flash` burst at the player,
  a tinted `#powerup-flash` screen-edge pulse (colour set inline), screen-shake,
  and an `OVERCHARGE!/RAPID FIRE!` `ScorePopup` (new `buff` theme).
- New left-edge **buff tray** (`HUD.tickBuffs`, `#buff-tray`) — one pill per
  active buff with an icon, name, seconds, and a draining timer bar; DOM built on
  activation, torn down on expiry.
- Pads render on the **minimap** as diamond markers in the buff colour (dimmed on
  cooldown) via `PowerupManager.forEachPad`.
- New `pickup_powerup` sound id (silent until the asset lands).

### Status log
- ✅ Phase 25 — Arena Power-Ups. DONE (client + server tsc + client build green;
  app chunk ~79.6 KB gzip, 90 modules). New `PowerupManager` (solo pads,
  spawn-anchor placement + solid fallback, mode gating), `Weapon.damage/
  fireRateMultiplier`, `WeaponInventory.setDamage/FireRateMultiplier` (persisted
  across setPrimary), `Game.grantPowerup/powerupBuffs/tickBuffs/clearBuffs/
  mapSpawns`, HUD buff tray, `#powerup-flash` + `#buff-tray` DOM + CSS, minimap
  diamonds, `pickup_powerup` sound id. Buffs clear on death + fresh match; MP /
  Gun Game / Practice gated off. Versions bumped to v0.25.0 (+ menu subtitle/
  footer).

### Phase 25 COMPLETE — solo arena power-ups, no protocol change, solo + MP intact.

---

## Phase 26 — Daily Login Rewards (autonomous build, v0.26.0)

After a gameplay round (power-ups), a **retention + revenue** round on a
different pillar. Every live game runs a "show up and get something" loop; we
had in-match daily *challenges* but no daily *login* reward. This adds one —
pure-client, migration-safe, no protocol change — and surfaces it as a card on
the menu, a natural ad-adjacent moment that pulls players back daily (→ more
menu ad impressions).

- **Escalating 7-day cycle.** `LOGIN_REWARDS = [100, 150, 200, 300, 400, 600,
  1200]` XP. Consecutive days advance the streak (day-7 jackpot, then repeats);
  a missed day resets to day 1; one claim per local day.
- **`Account` extension (migration-safe).** New `login: { last, streak }` state
  with a defensive load merge (old saves default cleanly). `dailyLoginStatus()`
  computes what claiming now would grant + the cycle position + availability;
  `claimDailyLogin()` awards the XP, advances the streak, once per day. The
  continue/reset/day-8-cycle/same-day-locked date math was verified with a
  standalone harness before wiring the UI.
- **Reward card + menu button.** `#daily-overlay` with a 7-chip track (past
  dimmed, today pulsing gold, claimed green, the day-7 jackpot styled), a Claim
  button showing the exact XP, and a streak line. **Auto-shows once per day**
  when a reward is unclaimed — but gated so it never stacks on the first-run
  How-to card for brand-new players (they get the daily greeting next session).
  Replayable from a new **🎁 Daily Reward** menu button. Claiming plays the
  level-up sting; XP flows through the normal `account.onChange` so the rank +
  cosmetics UIs update live.

### Status log
- ✅ Phase 26 — Daily Login Rewards. DONE (client + server tsc + client build
  green; app chunk ~80.3 KB gzip). `Account.login` state + `dailyLoginStatus`/
  `claimDailyLogin` + `LOGIN_REWARDS` + `yesterdayKey`/`dateKey` helpers (date
  logic harness-verified), `#daily-overlay` card + `#menu-daily` button + CSS
  track, main.ts render/claim/auto-show (How-to-gated). Versions bumped to
  v0.26.0 (+ menu subtitle/footer).

### Phase 26 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 27 — Railgun weapon (autonomous build, v0.27.0)

Back to the brief's first pillar (weapon variety / satisfying shooting). An
**8th weapon** — and the first with a genuinely new mechanic since the base
roster: the **Railgun**, a heavy precision beam that **pierces every enemy in a
line** until it stops at a wall. Pinpoint, no falloff, slow (0.85 RPS), 4-round
mag, 3 s reload, 75 dmg (2-shot body, 1-shot head at ×2.0). Identity = line a
row up and delete it — the flashiest multi-kill tool in the game.

- **New `World.raycastPierce`** (additive, doesn't touch the existing single-hit
  `raycast`): nearest wall t, then every damageable in front of it sorted
  near→far with head/body + headshot flag, skipping shooter/dead/same-team.
- **`Weapon.firePiercing`** — gated by a new optional `WeaponConfig.pierce`
  flag in `firePellet`. One beam to the wall (or max range) drives the tracer +
  impact via a single `shot` event; damage is applied to every pierced enemy,
  each emitting its own damage/kill event, so killfeed, damage numbers, XP,
  weapon mastery and the multi-kill announcer all work with no special-casing.
  `computeDamage` already folds in the OVERCHARGE multiplier, so power-ups stack.
- **Full integration:** `RAILGUN_CONFIG` + `WEAPON_LIBRARY` entry, cyan-coiled
  `buildRailgun` viewmodel + `WEAPON_BUILDERS`, `WEAPON_LABEL` (Gun Game),
  loadout button, three mastery skins (Ion / Plasma / Singularity) +
  `WEAPON_SKIN_ORDER`, and `fire_railgun` + the previously-missing `fire_lmg`
  sound ids.
- **MP-safe, no protocol change.** Pierce is solo-only (it isn't in the
  protocol). Online, the server applies the Railgun as a hard single-target hit
  via `SERVER_WEAPONS['railgun']` + a `VALID_WEAPONS` entry (mirrors the LMG
  precedent), so weapon identity still matters in MP without the line-pierce
  bonus. In MP the client's local `firePiercing` finds no networked damageables,
  so it just draws the beam and lets the server own damage — no double-hits.

### Status log
- ✅ Phase 27 — Railgun. DONE (client + server tsc + client build green; app
  chunk ~80.8 KB gzip). `World.raycastPierce`, `Weapon.pierce`/`RAILGUN_CONFIG`/
  `firePiercing`, viewmodel + label + loadout + mastery skins + sound ids,
  server `SERVER_WEAPONS`/`VALID_WEAPONS` railgun. Versions bumped to v0.27.0
  (+ menu subtitle/footer).

### Phase 27 COMPLETE — additive weapon + new pierce mechanic, no protocol change, solo + MP intact.

---

## Phase 28 — "ON FIRE" Rampage (autonomous build, v0.28.0)

A pure-client combat-juice round on the brief's "flashy feedback / desire to win
the next duel" pillar. The Announcer already pops one-shot milestone *banners*;
this adds the **persistent hot-streak state** arena shooters reward you with —
something you feel the whole time you're dominating, and dread losing.

- **Sustained rampage aura + badge.** At a **5+ killstreak** a heat glow rises
  from the screen edges and a streak badge shows above the crosshair, escalating
  by tier — ON FIRE (5) → INFERNO (10) → BLAZING (15+) — and snapping off the
  moment you die.
- **Single source of truth.** New `Announcer.onStreakChange` callback fires on
  every kill / death / `reset()` (the Announcer already owns the streak count).
  New `ui/RampageFX.ts` maps it to `<body>` tier classes (CSS drives the
  `#rampage-aura` glow) + the `#rampage-badge`. No new kill/death bookkeeping,
  edge-toggled (no per-frame cost), and it clears cleanly on match reset / mode
  switch / quit via the existing `announcer.reset()` call sites.

### Status log
- ✅ Phase 28 — ON FIRE Rampage. DONE (client + server tsc + client build green;
  app chunk ~80.9 KB gzip). `Announcer.onStreakChange` (fired on kill/death/
  reset), `ui/RampageFX.ts` (tier classes + badge), `#rampage-aura`/
  `#rampage-badge` DOM + CSS (3 escalating tiers), main.ts wiring. Versions
  bumped to v0.28.0 (+ menu subtitle/footer).

### Phase 28 COMPLETE — pure client, no protocol change, solo + MP intact.

---

## Phase 29 — Overshield power-up (autonomous build, v0.29.0)

Rounds out the Phase-25 arena power-up triad with a **defensive** option so the
buff pads pose a real choice (damage vs speed vs survivability) instead of two
offensive variants. Pure-client, solo-only, no protocol change — built directly
on the Phase-25 plumbing.

- **OVERSHIELD** (teal pad) → absorb **50% of incoming damage** for 9 s. New
  `Health.damageReduction` field (0..1) applied in `takeDamage` — 0 everywhere
  but the buffed local player, so the damage flow / bots / networking are
  untouched. Set by `Game.grantPowerup('shield')`, cleared by the same
  `tickBuffs`/`clearBuffs` edges (death / fresh match) as the other buffs.
- **Full reuse:** third `PowerupType`, a third map pad (placement now picks 3
  spread spawn anchors), teal grab flash + `OVERSHIELD!` score-pop, a
  `🛡 OVERSHIELD` buff-tray pill (`HUD.tickBuffs` label/CSS), and a teal minimap
  diamond.

### Status log
- ✅ Phase 29 — Overshield. DONE (client + server tsc + client build green; app
  chunk ~81.4 KB gzip). `Health.damageReduction`, `PowerupType` 'shield' +
  colour + 3rd pad, `Game` shield buff (grant/tick/clear/powerupBuffs), HUD pill
  label + CSS, minimap colour. Versions bumped to v0.29.0 (+ menu subtitle/
  footer).

### Phase 29 COMPLETE — pure client, no protocol change, solo + MP intact.
