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

## Phase 13 — Arena Power-Ups (autonomous build, v0.13.0)

The biggest gap to a true *arena* shooter (Quake/Krunker lineage) was map
flow: there was nothing to fight *over* between kills. Phase 13 adds
power-ups that spawn at fixed map spots, get consumed on touch, and respawn on
a timer — creating contested objectives, rotation decisions, and "power
moments." More dynamic matches = longer sessions = more natural ad breakpoints
(revenue), all without touching the core gunplay.

Guiding constraint: **don't clobber abilities, keep both controllers + both
Protocol.ts in sync, typecheck + build green each step, never break solo/MP.**

Three power-ups: **Health** (+45 instant, refused when full), **Damage Boost**
(×1.5 outgoing dmg, 15s), **Haste** (×1.4 speed, 12s). Effects are orthogonal
to abilities — `Weapon.damageMultiplier` + a separate `powerupSpeed` on BOTH
controllers that multiplies alongside Surge's `speedMultiplier`.

- **13A — Core + solo.** `core/Pickups.ts` (PICKUPS registry + PickupManager:
  glowing bobbing meshes, ground ring, point light, respawn timers, solo touch
  detection). `MapMeta.pickupSpawns` (5 per map on Sandstone + Industrial,
  open ground). Game applies/expires effects, heals (skips when full), clears
  on death/map/mode change. New `pickup_*` sound ids + `pickup` bus event.
- **13B — Feedback.** Left-edge HUD power-up tray (per-buff countdown bar),
  Damage Boost edge tint, `Announcer.announcePickup` callout. index.html +
  HUD.tickPowerups + styles.css.
- **13C — Server-authoritative MP (protocol v3).** `ServerWelcome.pickups[]` +
  `ServerPickupEvent` + `EV.Pickup` (both Protocol.ts in sync). Server
  PICKUPS_BY_MAP mirrors each client map (same kinds/order/positions); per-tick
  respawn + effect expiry + overlap detection; applyPickup heals / sets
  damageBoostUntil / sets controller.powerupSpeed; onFire multiplies by boost;
  respawn + resetMatch clear/restore. Client builds pickups in serverMode,
  applies welcome availability, mirrors the local timed buff on its own grab.
  `powerupSpeed` added to ServerController in lockstep with PlayerController.
- **13D — Docs + version bump.** v0.13.0 (client+server package.json + lockfiles
  + menu subtitle/footer), README Phase 13 section + audio-catalog additions,
  PHASE_PLAN status log.

### Status log
- ✅ Phase 13A — Pickup core + solo. DONE (typecheck + build green; headless
  PickupManager test confirms touch, refuse-when-full leaves it grabbable, no
  re-grab after consume, server-mode no-touch). Orthogonal effect plumbing so
  Surge/Haste + abilities never clobber each other.
- ✅ Phase 13B — Feedback. DONE (typecheck + build green). HUD tray + edge tint
  edge-toggled from `game.powerupRemaining()`; announcer callout wired from the
  `pickup` bus event.
- ✅ Phase 13C — Server-authoritative MP. DONE (client + server typecheck +
  client build green). Headless Room test: 5 pickups, damage grab broadcasts
  the right index/kind/byId/durationMs, boost set, health refused at full then
  grabbed when hurt (50→95). Protocol bumped to v3, both files in sync; both
  controllers' `powerupSpeed` in sync.
- ✅ Phase 13D — Docs + version. DONE. v0.13.0 across package.json + lockfiles
  + menu, README + audio catalog + PHASE_PLAN updated.

### Phase 13 COMPLETE — A–D shipped, protocol v3, solo + MP intact, abilities untouched.

---

## Phase 14 — MP Weapon Authority (autonomous build, v0.14.0)

A fairness/correctness fix with real feel impact. The MVP server hardcoded AR
damage (24 / head ×1.8 / 200 m / no falloff) for EVERY weapon online — sniper
headshots did 24, shotguns did 24 total, etc. Weapon choice barely mattered in
MP. Phase 14 makes the authoritative hitscan weapon-aware.

Server-only (no protocol or client changes — the client already sends the real
`weaponId`, and damage/kill events already carry it):
- `WEAPON_TABLE` mirrors the client `WEAPON_LIBRARY` (damage, headshot mult,
  range, falloff, pellets, baseSpread, fireRate).
- `castPellet()` extracted (wall + rewound-player nearest hit for one ray);
  `weaponDamage()` mirrors `Weapon.computeDamage` (distance falloff + headshot).
- Shotgun fires all 9 pellets through a seeded spread cone (`perturbDir` mirrors
  `Weapon.firePellet`); per-target pellet damage is summed into one Damage event.
- Weapon-spoof guard (claimed id must be the player's primary or pistol, else
  falls back to primary). Fire-rate guard drops shots faster than 0.5× the
  nominal interval (anti-cheat groundwork, generous tolerance).
- Per-player `rngState` + `lastFireAt` added to ServerPlayer.

### Status log
- ✅ Phase 14 — MP weapon authority. DONE (server typecheck + client typecheck +
  client build green). Headless Room damage test: AR body 24 / head 43.2, SMG 14,
  sniper headshot 111 (one-shot), pistol 22, shotgun ~112 point-blank (multi-
  pellet), Damage Boost ×1.5 → 36, rapid-fire 2nd shot rejected, spoofed sniper
  claim while holding SMG resolves to 14. v0.14.0 + docs.

### Phase 14 COMPLETE — server-authoritative per-weapon hit-reg, no protocol/client change, solo + MP intact.

