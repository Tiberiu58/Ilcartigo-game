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


