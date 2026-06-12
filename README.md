# ILCARTIGO

Fast-paced browser arena shooter — Krunker-style movement, class-based abilities.

> **Status:** Phase 15 — v0.15.0. **Weapon Mastery** — every gun has a per-weapon kill ladder (Bronze→Master) with tier-up XP rewards, a slide-in toast, and a Profile mastery grid. Built on Phase 14 (per-weapon authoritative damage in MP + the Marksman DMR), Phase 13 (Gun Game mode) and Phase 12 (combat-feel juice: directional damage indicators, low-HP vignette + heartbeat, death recap, bullet-tracer cosmetics, announcer specials, kill-confirm marker), Phase 11 (Tab scoreboard, killstreak announcer, lifetime stats + daily challenges, footsteps, authoritative match-end (protocol v2), server-side class passives, AdSense layer, first-run onboarding). Deploy groundwork (Fly.io + Vercel) laid.

## Repo layout

```
/velocity
  /client      Vite + TS + Three.js game client
  /server      Node + Express + Socket.io backend (Phase 7 — live)
  /website     Marketing/landing site (Phase 8)
  README.md
```

## Phase 7 — Multiplayer FFA (this round)

### What landed

**Server (`/server`)**:
- Node + Express + Socket.io, TypeScript with `tsx watch` for dev hot-reload.
- Single FFA Room, 6-player cap, runs at **32 Hz** tick.
- Authoritative `ServerController` — a THREE-free port of the client's `PlayerController`. Identical movement math: same speeds, friction, counter-strafe, bhop, step-up, collision. Must stay in sync with the client controller manually (until we get a shared module setup).
- **Lag-compensated hitscan**: when a client fires, the server rewinds every other player's position by ~100 ms (matching the client's render-delay) before running the raycast. Fair hit registration even at 100+ ms ping.
- Damage + kill events broadcast to all clients. Spawn protection (2 s) on respawn.
- Player position history (1 s ring buffer per player) backs the lag-comp rewind.

**Client (`/client/src/networking`)**:
- `Protocol.ts` — wire schemas mirrored on both sides (`PROTOCOL_VERSION = 1`).
- `NetClient.ts` — typed Socket.io wrapper, sequence-numbered inputs.
- `RemotePlayer.ts` — visual mesh + 100 ms render-delay interpolation buffer for smooth other-player motion.
- `MultiplayerSession.ts` — orchestrator that ties NetClient ↔ Game. Sends inputs every frame, reconciles local player position from server snapshots (smooth lerp toward server pos), forwards Damage/Kill/Shot events through the existing local bus so HUD/killfeed/damage-numbers "just work."

**Architecture choices (per your spec):**
- **Server-authoritative** — server runs the sim, clients send inputs + predict locally + smoothly correct from snapshots.
- **32 Hz** tick rate (CS:GO default).
- **No bots online** — clean separation; bots stay in single-player + Practice.
- **MVP scope** — one Sandstone room, no matchmaking, no accounts.

**Client/server integration:**
- Main menu now has **⌬ Play Online (FFA)** (teal accent) in addition to Play vs Bots and Practice Range.
- HUD shows an online badge with live player count.
- Pause / Quit to Menu cleanly disconnects.

### Bundle size

- Client: **~165 KB gzipped** total (engine 120 KB cached + app 37 KB + CSS 4 KB + HTML 3 KB).
- App chunk grew by ~15 KB for socket.io-client + networking code.
- Server: ~13 MB on disk (express + socket.io + tsx + deps); runtime memory ~50 MB.

## How to run

Both processes are needed for MP. Two terminals:

```powershell
# Terminal 1 — server
cd C:\Users\georg\velocity\server
npm install
npm run dev    # → http://localhost:3001

# Terminal 2 — client
cd C:\Users\georg\velocity\client
npm install
npm run dev    # → http://localhost:5173 (Vite auto-opens browser)
```

For single-player (vs bots) or Practice Range, only the client server is needed.

For multiplayer testing, open the client URL in **two browser windows** and click **Play Online** in each. You should see the other player as a cyan box-figure moving around Sandstone.

### Controls (unchanged from Phase 6)

| Key | Action |
| --- | --- |
| `WASD` | Move |
| `Space` | Jump (hold to bhop) |
| `Shift` | Crouch · slides if moving fast |
| `LMB` | Fire |
| `RMB` | Sniper scope (hold) |
| `E` | Class ability |
| `R` | Reload |
| `1`/`2`/`Q` | Primary / Pistol / quick-swap |
| `Esc` | Pause |

### Test checklist (Phase 7)

1. **Connect** — start the server, open client, click "Play Online (FFA)". Top banner shows `ONLINE · 1 players`.
2. **Second player** — open a second browser window (use a private/incognito session so Socket.io picks a different connection), click Play Online. Both badges should show `2 players`. You should see the other player as a cyan boxy figure.
3. **Movement sync** — move around. Both clients should see each other moving smoothly with ~100 ms latency.
4. **Shooting** — shoot the other player. Damage numbers appear, killfeed updates with both player IDs.
5. **Death + respawn** — get killed. After ~2s you respawn at a random corner with 2s of spawn protection.
6. **Disconnect** — close a tab. The other client's "ONLINE · N players" badge should decrement.
7. **Solo still works** — Quit to Menu, click "Play vs Bots" — single-player bots come back, MP session is torn down cleanly.

## Architecture notes (Phase 7)

1. **Two controllers, identical math.** `PlayerController.ts` (client, THREE-coupled) and `Controller.ts` (server, plain numbers). Speeds/friction/counter-strafe/bhop/step-up all match. If you change one, change the other.
2. **`MapCollision.ts`** is a THREE-free numeric export of each map's solid AABBs. Imported by both client (for reference) and server (for authoritative collision). Sandstone-only for v1.
3. **Inputs are sequence-numbered.** Server echoes the highest applied seq in each snapshot (`ackSeq`). Client uses this to drop ack'd inputs from its replay buffer.
4. **Reconciliation is "smooth-correct" rather than hard-replay.** Local controller's position gets pulled toward the server's authoritative position at 18% per snapshot. The full replay-all-unacked-inputs path is scaffolded (input buffer is maintained) but the MVP just lerps. Hard replay can be added later without touching the protocol.
5. **Lag comp uses 100 ms fixed rewind.** Matches the client's render-delay constant. Tighter implementations measure per-shooter one-way latency + their interp depth; we keep it simple for MVP.
6. **Bus reuse.** Server events (Damage/Kill) are turned into local bus events in `MultiplayerSession.handleDamage/Kill`. So `HUD`, `DamageNumbers`, `killfeed`, screen-shake all keep working in MP without changes.
7. **CORS is permissive** to any localhost/127.0.0.1 port (Vite likes to fall through to 5174/5175 when 5173 is in use). Production would lock this down.

### Phase 7b additions (this round)

- **All 6 abilities sync over the wire**:
  - **Blink**: server validates, teleports authoritatively, broadcasts two flash points so observers see the departure and arrival.
  - **Surge**: server applies the 2× speed multiplier to the authoritative controller for 4s; remote viewers see the fast movement via normal snapshots.
  - **Dash**: server applies the +30 velocity impulse + broadcasts a trail VFX for observers.
  - **Cloak**: server flips `cloaked` on the player's snapshot; remote viewers fade the player's mesh to 25% opacity via the existing `RemotePlayer.cloaked` path.
  - **Barrier**: server spawns a temp solid that participates in **authoritative collision + hitscan**. `AddSolid` / `RemoveSolid` events sync the visible mesh AND an invisible AABB on every client — so everyone's bullets get blocked and you can't walk through your own wall.
  - **Pulse**: scan wave broadcasts to all clients; silhouettes stay caster-only (Hunter's tactical info, not a public reveal).
- **Damage numbers now show for incoming hits**: when you take damage, a number floats above the hit point. Outgoing hits still show on the target. Strictly third-party (other-vs-other) is silent per design.
- **Server-side ability state machine**: per-player cooldowns (`blink 12s / surge 18s / dash 8s×2 / cloak 25s / barrier 20s / pulse 22s` matching spec), duration timers, charge regeneration. Server is authoritative; client predicts.
- **Per-player ability state resets on respawn** so dying mid-Cloak doesn't leak invisibility.
- **`ServerController.speedMultiplier`** added to mirror the client controller's Surge hook.

### Known limitations / by-design omissions

- **Damage is server-side only** for now. The client doesn't predict its own hits — you fire, server runs hitscan, broadcast Damage event arrives ~one tick later. You'll see a brief latency on damage numbers; that's the protocol working as designed.
- **Sandstone-only.** Industrial collision data isn't in `MapCollision.ts` yet. Phase 7c can add it once we want MP map switching.
- **No anti-cheat** beyond server authority. Movement is server-validated; weapon spread/recoil is currently client-trusted. Real anti-cheat is Phase 7c.
- **Reconnect doesn't preserve identity.** A dropped player loses their kill count, weapon, class — they re-join as a fresh player.
- **No room browser, no matchmaking, no rooms beyond the one.** As specced.
- **Class is locked to Vanguard** for the MP MVP — class selection doesn't sync yet. Phase 7c will let players pick.
- **Pulse silhouettes are caster-only** in MP (matches Hunter's "I have info you don't" identity). The wave VFX is public.
- **Barrier AABB is axis-aligned to whichever cardinal direction you're facing more strongly** (E/W vs N/S). Server-side. Yaw-aware barrier AABBs are a future polish.

## Phase 8 — Landing site (this round)

A static marketing site at `/website/` — separate from the game client, no build step needed:

- `index.html` — Homepage. Hero with the ILCARTIGO title + Play button (links to `/play/` on production), feature grids for the 6 classes, 5 weapons, 2 maps, a "How to play" 60-second crash course, and an "Under the hood" credibility section. Reserved 728×90 ad slot above the classes section.
- `privacy.html` — Full GDPR/CCPA-aware privacy policy covering local storage, server connection data, AdSense, third-party cookies, opt-out instructions, contact email.
- `terms.html` — Terms of service: acceptable use, no cheating, intellectual property, disclaimer, limitation of liability, AdSense disclosure.
- `about.html` — About the game: design choices, what's under the hood, contact info.
- `site.css` — Shared stylesheet. Responsive (breakpoints at 720 and 1080 px). Dark theme matching the game.
- `site.js` — Cookie consent banner (~30 lines, no library, localStorage-backed).

**Phase 8 decisions per user:**
- Domain: `ilcartigo.com` (canonical URLs set throughout).
- AdSense: starting from zero — `ca-pub-XXXXXXXXXXXXXXXX` left as commented-out placeholder. Activate after Google approval.
- Pages: just home/privacy/terms/about (no devlog).
- Contact email: `tiberiumatei1978@gmail.com`.
- Game launcher: `/play/` path on the same domain.

**Bug fixes also in this round:**
- **Blink no longer teleports outside the map.** Added two validation checks after computing the target: (1) player AABB must not overlap a solid, (2) a foot-ground probe just below the target must overlap *something* (otherwise it's over a void or outside the playable area). If neither check passes anywhere along the aim ray, the cast is cancelled and the cooldown is refunded. Applied symmetrically client + server.
- **Version bumped to v0.8.0** across client + server `package.json`, plus the main-menu subtitle and footer.

## Deployment notes

The three deliverables deploy independently:
- **`/website/`** — static HTML/CSS/JS. Drop into any static host (S3 + CloudFront, Netlify, Cloudflare Pages, GitHub Pages). Configure the production host to serve `/play/` as the `/client/dist/` build output.
- **`/client/`** — Vite-built bundle. `npm run build` produces `dist/` which is the entire game client (~166 KB gzipped). Deploy to `ilcartigo.com/play/`.
- **`/server/`** — Node.js process. `npm run start` (or `npm run dev` with watch). Needs a publicly-reachable host with WebSocket support. CORS allowlist currently matches `localhost`; **update it before production** to your real domain.

## Phase 9 — Progression + cosmetics (this round, v0.9.0)

The final phase. Player progression, unlockable cosmetics, end-of-match flow.

**Account module (`/client/src/account/Account.ts`):**
- Local-only progression. State persists to `localStorage` under `ilc.account`.
- Tracks: total XP, derived level (1000 XP per level), unlocked skin IDs, unlocked kill effect IDs, per-class equipped skin, equipped kill effect.
- `awardXP`, `tryUnlockSkin`, `tryUnlockEffect`, `equipSkin`, `equipKillEffect` — listener callback fires on any mutation.

**Cosmetics registry (`/client/src/account/Cosmetics.ts`):**
- **36 player skins** — 6 per class. Default is free, the other 5 unlock at **200 / 500 / 1000 / 2000 / 4000 XP**.
- **4 kill effects** — default puff (free), cyan shock (300 XP), magenta burst (800 XP), pure nova (2500 XP).
- Skins are color tuples (body + head) that recolor the box-mesh figure. Kill effects are a particle color + screen tint.

**XP economy (spec-aligned, match-based only):**
- **10 XP per kill** awarded immediately on the local `kill` event.
- **+50 XP if you win** the match (rank #1), **+25 if top-3** (in MP only).
- No daily-login bonus per user choice.

**Skin networking:**
- `ClientHello` extended with `skinId`; `PlayerSnapshot` echoes it.
- `RemotePlayer.ingest` recolors body/head materials when the snapshot's `skinId` changes.
- Server side: skin id is freeform-trusted (cosmetic only, no gameplay impact).

**Kill effects:**
- On confirmed local kill, `Game.playKillEffect`:
  1. Spawns a particle puff at the lethal hit point via `CastFX.flash` in the equipped effect's color.
  2. Briefly tints the screen edges via a CSS class + custom property.
- `KillEvent` extended with `hitPoint`; `Weapon.firePellet` now populates it.

**Post-match screen:**
- New `#postmatch-overlay` DOM. Shown when any player hits **30 kills** (MP only; solo plays casually with no match end).
- Scoreboard: rank, player id (or YOU), kills, deaths, K/D, sorted by kills.
- Highlights the winner. Shows total XP earned this match (per-kill + win/top-3 bonus).
- "Play Again" re-locks pointer + resets local match score. "Quit to Menu" returns to lobby.

**Cosmetics tab in settings:**
- New 4th tab in the settings page. Shows level + XP bar at the top, then skin grid (grouped by class), then kill effect grid.
- Click an unlocked card → equip. Click a locked card with enough XP → unlock + equip in one action.
- Re-renders on `account.onChange()` (XP gain, unlock, equip).

### Bundle size

Production client: **~171 KB gzipped** total (engine 120 KB cached + app 42 KB + CSS 5 KB + HTML 4 KB). +5 KB for the entire account/cosmetics/post-match layer.

### Test checklist (Phase 9)

1. **Earn XP** — kill bots in solo OR players in MP. Each kill awards 10 XP. Open settings → Cosmetics, watch the XP counter climb.
2. **Unlock a skin** — once you have 200 XP, open Cosmetics tab, click any tier-1 skin for any class. It deducts XP and auto-equips.
3. **Kill effect upgrade** — when you have 300 XP, unlock + equip Cyan Shock. Next kill: cyan particle puff at the hit + brief blue screen tint.
4. **Skin visible to others** — in MP, equip a skin, then check what the other tab sees: you should now be the equipped color, not the default cyan boxy figure.
5. **Post-match** — in MP, kill 30 bots (or have 2 tabs race to 30). Post-match overlay appears with scoreboard, XP earned, Play Again button.
6. **Persistence** — refresh the browser, settings → Cosmetics tab: XP, unlocks, and equipped picks all survive.

## Phase 10 — Post-v1 polish (this round, v0.10.0)

The original 9-phase spec wrapped at v0.9. Phase 10 starts a continuation focused on the rough edges that hurt first impressions, before going to production.

**Big MP fix (the biggest find of the audit pass):**
- Every local-feedback check across HUD, DamageNumbers, kill-effect-trigger, XP award, respawn timer used `attackerId === 'player'`. In MP the local player's id is their socket id, not the literal string `'player'` — so **none** of those features worked online.
- Introduced `Game.isLocalPlayer(id)` that handles both forms and replaced every check.
- Side effect: the respawn timer no longer fights the server in MP. SOLO still runs the local respawn loop; MP waits for the server's snapshot.

**Audio pipeline (Howler.js):**
- New `/client/src/audio/AudioManager.ts`. Per-event SFX with optional 3D spatial positioning. Master + SFX volume sliders persisted to `localStorage`.
- Hooked into bus events: weapon fire (per weapon id), hit confirm, headshot, kill feedback, death, ability casts (per ability id), UI clicks.
- Local own-actions play unspatialized; remote/bot actions play spatial via stereo pan + linear distance falloff (ref 3m, max 80m).
- **Asset-driven, silent if missing.** A missing `.wav` file logs once and never plays — pipeline ships ready, audio files come later. See the **audio asset guide** below.
- New Audio tab in settings (5 tabs total now: General / Crosshair / Audio / Cosmetics / Graphics).

**Mobile gate:**
- Touchscreen + narrow viewport check at the top of `main.ts`. Shows a "Desktop only" notice instead of letting mobile users stare at a broken game.
- Override with `?nodetect=1` for dev testing.

**Industrial in MP:**
- Ported Industrial's collision AABBs to `MapCollision.ts` as `INDUSTRIAL_COLLISION` (with a `stairs()` baker so each stair flight is one line of data).
- Server picks map at startup via `MAP=industrial npm run dev` (default sandstone).
- Per-map FFA spawns: Industrial spawns include one on the L1 catwalk (vertical variety).
- Client adopts the server's map via `Welcome.mapId` — no client-side selector needed.

**Predictor bot returns:**
- 3rd bot added back to solo. Magenta. Spawns at `(0, 0.5, -22)` between south arch and central tower. Spawn protection + safe-spawn picker keep it fair.

**HUD score + respawn countdown:**
- Top-center `YOU X / 30  leader: NAME (count)` ticker, MP-only.
- Full-screen "YOU DIED — 1.8" countdown during the death window. Clears automatically when HP comes back.

**Reset progression button:**
- New "Reset all progression" button in the Cosmetics tab. Confirm prompt + wipes XP/unlocks/equipped cosmetics.

### Bundle size

Production client: **~185 KB gzipped** total (engine 120 + app 54 + CSS 5 + HTML 5). +14 KB this phase, mostly Howler.js.

### Audio asset guide

Drop CC0 `.wav` files into `client/public/assets/sounds/` matching these names. Anything missing is silently skipped — the game just won't have that sound until you add it.

| Filename | What it is | Suggested freesound.org search |
| --- | --- | --- |
| `fire_ar.wav` | Assault rifle gunshot, sharp punchy | "ar15 shot single", "rifle shot" |
| `fire_smg.wav` | SMG burst, rapid lighter pop | "mp5 single shot", "9mm shot" |
| `fire_sniper.wav` | Bolt-action boom | "sniper rifle shot", "kar98" |
| `fire_shotgun.wav` | Shotgun blast | "shotgun blast", "12 gauge" |
| `fire_marksman.wav` | DMR / marksman rifle crack, sharp single shot | "dmr shot", "marksman rifle" |
| `mastery_up.wav` | Short rewarding chime — weapon mastery tier-up | "level up chime", "reward ding" |
| `fire_pistol.wav` | Pistol crack | "9mm pistol", "glock shot" |
| `reload.wav` | Magazine click / slide | "magazine reload", "weapon reload" |
| `empty_click.wav` | Dry trigger click | "empty gun click" |
| `hit_confirm.wav` | Body hit tick (Krunker hitmarker style) | "hit marker", "ui hit" |
| `hit_headshot.wav` | Higher-pitched headshot ding | "headshot ding" |
| `jump.wav` | Player jump effort | "footstep jump", "jump grunt" |
| `land.wav` | Player landing thud | "footstep land", "landing thump" |
| `jump_pad.wav` | Whoosh / spring | "spring boing", "trampoline whoosh" |
| `footstep.wav` | One single footstep on concrete | "footstep concrete" |
| `ability_blink.wav` | Teleport whoosh, magical | "teleport short", "warp blink" |
| `ability_surge.wav` | Speed boost ramp-up | "power up speed", "energy boost" |
| `ability_dash.wav` | Quick dash whoosh | "swoosh short", "dash whip" |
| `ability_cloak.wav` | Stealth shimmer | "cloak activate", "stealth whoosh" |
| `ability_barrier.wav` | Solid deploy thunk | "shield deploy", "barrier slam" |
| `ability_pulse.wav` | Radial scan ping | "sonar ping", "radar pulse" |
| `death.wav` | Player death thud | "death thud", "body fall" |
| `respawn.wav` | Brief shimmer / pop | "respawn", "spawn in" |
| `spawn_protect.wav` | Cyan shimmer cue | "shield activate quiet" |
| `kill_feedback.wav` | Sharp kill confirm | "kill confirm", "achievement short" |
| `match_end.wav` | Match-over fanfare | "match victory", "level end" |
| `ui_click.wav` | Menu button click | "ui click", "menu select" |

Settings → Audio tab has a "Play test sound" button that plays `ui_click.wav` — useful for verifying volume sliders without doing combat.

**Phase 12 additions to the catalog** (same drop-in rules — silent until present):

| Filename | What it is | Suggested freesound.org search |
| --- | --- | --- |
| `heartbeat.wav` | Single slow heartbeat thump (low-HP danger cue) | "heartbeat single", "heart beat thump" |
| `first_blood.wav` | First-blood announcer sting | "first blood", "announcer impact" |
| `revenge.wav` | Revenge-kill announcer sting | "revenge sting", "vengeance" |
| `comeback.wav` | Comeback announcer sting | "comeback", "rise up sting" |

## Phase 11 — Fun, catch & revenue (this round, v0.11.0)

A continuation focused on making the game *feel* like Krunker — instant feedback, visible progression, retention hooks — plus the revenue layer. Each sub-phase shipped independently and was verified (typecheck + build, headless smoke tests where the logic is server-side, browser checks for UI).

**First, an audit-fix round (the biggest MP bug):**
- **Authoritative match end (audit #5 — the headline fix).** Previously each client decided when the match ended from its *own* locally-counted kills — so two clients could disagree on the winner, or one would be stuck on the scoreboard while the other played on. Now the **server** owns it: it counts kills, broadcasts a `MatchOver` message with the winner + full standings, and a `MatchReset` on rematch. Clients overwrite their local tallies from the server's truth. Protocol bumped to **v2** (`MatchOver`/`MatchReset`/`RequestRematch` added; duplicated in both `Protocol.ts` files). Verified with a headless two-client smoke test (both see the same winner; rematch resyncs both). `MATCH_GOAL` env var added for quick test matches.
- **Class passives now apply server-side (Phase D finding).** Vanguard's +15 HP and Engineer's −15% cooldown only existed on the client — the authoritative server killed the Vanguard at 100 HP and ignored the cooldown. Added `CLASS_MAX_HP` + `CLASS_COOLDOWN_MULT` server tables. (The class *identity*/ability already synced — the README's old "locked to Vanguard" line was stale.)

**Then the fun/catch/revenue features:**

- **A. Scoreboard (hold `Tab`).** The most Krunker-defining missing piece. Full overlay: rank, name, kills, deaths, K/D, sorted, local player highlighted. Works solo (you + bots, humanized bot names) and MP (authoritative kills). `ui` in `index.html` + `main.ts`.
- **B. Killstreaks + announcer juice.** Center-screen banners with escalating sound: multi-kills (`DOUBLE` → `TRIPLE` → `QUAD` → `MEGA` → `MONSTER KILL`, chained within a 3.5s window) and consecutive-kill streaks (`KILLING SPREE` → `RAMPAGE` → `UNSTOPPABLE` → `DOMINATING` → `GODLIKE` → `LEGENDARY`). Multi-kill takes the headline, streak rides the subline; death resets. New `ui/Announcer.ts`, 11 new sound ids (silent until `.wav`s added).
- **C. Footsteps + audio depth.** Distance-throttled footstep cadence: local (per-class volume — Phantom silent, Ghost half — crouch lengthens stride) + **remote spatial footsteps** in MP so you hear players approaching (cloaked players are silent; teleports ignored). Finishes the last unwired audio from the v0.10 catalog.
- **D. MP class selection (passive fix above) — all 6 classes' abilities + passives now work online.**
- **E. Lifetime stats + daily challenges.** Persistent career stats (kills, deaths, K/D, headshots, matches, wins, best streak, playtime) in a new **Profile** settings tab, plus 3 **daily challenges** (seeded per-day, baseline-captured at issue, claim grants bonus XP). Migration-safe `Account` extension. New `ui/ProfileUI.ts`.
- **F. AdSense revenue layer.** Ad slots at **natural breakpoints only** (main menu top/side, post-match overlay) — never mid-combat. Single config point (`AD_CONFIG.publisherId`); until a real `ca-pub` id is set, slots show a tasteful in-house placeholder and **no AdSense script loads** (policy-safe — no empty real units). Consent-aware (non-personalized fallback). New `ads/Ads.ts`. **To go live: set the real publisher id + ad-unit ids in `client/src/ads/Ads.ts`** after Google approval.
- **G. First-session UX.** Display name (shown on scoreboard/killfeed). First-run **"How to Play"** card (auto-shows once, replayable from the menu). Loadout (class/weapon/map) persistence already existed.
- **H. Polish + docs.** Fixed the respawn-countdown race (audit #10 — grace window before auto-clear) and the iPad-landscape mobile gate (audit #11 — now uses `(any-pointer: fine)` so touch-only tablets are gated even when wide). Version bumped to v0.11.0.

### Production deploy prep (groundwork, not yet deployed)

Two code changes + Fly.io config were added so the deploy is mechanical when ready:
- **`VITE_SERVER_URL`** — client multiplayer target via build-time env var (falls back to `localhost:3001` in dev). `client/src/vite-env.d.ts` added for typing.
- **`CLIENT_ORIGIN`** — server CORS allowlist via env var (comma-separated origins; localhost still always allowed for dev).
- **`server/Dockerfile` + `fly.toml` + `.dockerignore`** — single always-on machine (stateful game room), `tsx`-run (no compile step), websocket-friendly. See `PHASE_PLAN.md` for the full deploy runbook. Domain (`ilcartigo.com`) not registered yet → deploy targets free preview URLs first.

## Phase 12 — Combat Feel & Feedback Juice (this round, v0.12.0)

The biggest gap to Krunker was moment-to-moment combat *feedback*. Phase 12
closes it — all client-side, **no protocol changes**, solo + MP both unaffected
— plus a new cosmetic track to deepen the unlock loop (retention → ad revenue).

- **A. Directional damage indicators.** Red curved arcs around the crosshair
  point at whoever's shooting you (the CoD/Krunker "where am I getting hit
  from" staple). Bearing is computed from the attacker's world position vs the
  camera's yaw. Works solo (bots) and MP (remotes) through a unified
  `Game.actorWorldPos()` resolver (+ `MultiplayerSession.getRemotePosition()`).
  Pooled arc elements merge continuous fire from one direction and show separate
  arcs for multiple attackers. New `ui/DamageDirection.ts`.
- **B. Low-HP danger feedback.** A pulsing red vignette + a throttled heartbeat
  SFX kick in at ≤30% HP, the heartbeat tightening as you near death. Tension
  you feel without watching the HP bar. Pure HUD + CSS.
- **C. Death recap card.** "ELIMINATED BY {name} · {WEAPON}" folded into the
  respawn countdown — captured from the lethal kill event, resolving bot
  difficulty labels / short MP ids, hidden for attacker-less falls.
- **D. Bullet-tracer cosmetics.** A new unlockable cosmetic axis you see on
  every shot — 6 tracer colours (gold default free, then cyan/lime/magenta/
  crimson/white at 250–2000 XP). `Account` extended migration-safe
  (`unlockedTracers` + `equippedTracer`, default always kept unlocked on old
  saves). Local tracers read the equipped colour; remote/bot tracers stay red so
  incoming fire stays readable. New "Bullet Tracer" grid in the Cosmetics tab.
- **E. Announcer specials.** First Blood (first kill of the match, by anyone),
  Revenge (you kill whoever last killed you), Comeback (a kill after dying 3+
  times since your last). Specials take the headline; the existing multi-kill /
  streak rides the subline. Reset on match reset / mode switch.
- **F. Kill-confirm marker.** Confirming a kill stamps a bigger, glowing red X
  over the crosshair, distinct from the white hitmarker and the red headshot
  ping.

New sound ids reserved (silent until `.wav`s land): `heartbeat`, `first_blood`,
`revenge`, `comeback` — see the audio asset guide above.

### Bundle size

Production client: **~187 KB gzipped** total (engine 120 + app 61 + CSS 7 + HTML 6).
~+2 KB this phase for the whole combat-feel layer. No new dependencies.

## Phase 13 — Gun Game mode (this round, v0.13.0)

The first **new game mode** — mode variety is the #1 driver of replay value in
arena shooters. Self-contained, solo-vs-bots for v1, **no protocol or MP
changes**, fully browser-verified.

- **Weapon ladder** `smg → ar → shotgun → sniper → pistol` (`GUNGAME_LADDER`).
  Each kill advances the killer one rung; the gun visibly swaps in hand. First
  to land a kill on the final rung (pistol) wins → post-match overlay.
- New `modes/GunGame.ts` — bus-driven, decoupled via a small `GunGameHost`
  interface. Bots race too (their tier advances; weapon fixed for v1).
- `GameMode` extended to `'combat' | 'practice' | 'gungame'` + `isCombatMode()`
  so bots/spawn-protection/map logic treat Gun Game like Combat.
- New `Game.setPlayerPrimaryWeapon(id)` (pistol special-cased → slot 1). HUD
  Gun Game ticker ("LVL n/5 · WEAPON" + pips). New "🔫 Gun Game" menu button.

## Phase 14 — Arsenal: MP weapon authority + Marksman (this round, v0.14.0)

Weapon choice is central to the Krunker feel, but **online it didn't matter** —
the server hardcoded AR damage (24, ×1.8, a single ray) for *every* weapon, so
a sniper didn't one-shot, a shotgun fired one pellet, and an SMG melted like a
rifle. Phase 14 makes the server run the TTK each loadout implies, and adds a
new precision rifle. **No protocol change** (weaponId was already on the wire);
solo + MP both intact.

- **A. Per-weapon authoritative damage.** New `WEAPON_STATS` table on the server
  mirroring every client `WeaponConfig` (damage / headshot / range / falloff /
  pellets / spread). `onFire` reworked to resolve the weapon the shooter is
  *allowed* to fire (primary, or always-available pistol) with an **anti-spoof
  fallback** to the primary, cast **N pellets** per trigger pull (shotgun = 9)
  with a server-side spread sampler, apply **linear distance falloff** per ray,
  and aggregate damage per target. Verified with a headless two-client smoke
  test against the real server: sniper **60** (was a flat 24), SMG **5.6**, AR
  falloff **28.3**, Marksman **46.3**, plus the spoof case.
- **B. Marksman (DMR).** A 5th primary between the AR's spray and the Sniper's
  one-shot: semi-auto (4.5 RPS), 2-shot body, near-lethal headshot (×2.0), very
  low spread, gentle long-range falloff, no scope. `MARKSMAN_CONFIG` (client)
  mirrored by `WEAPON_STATS.marksman` (server), a distinct DMR viewmodel, the
  Marksman loadout button + Gun Game ladder label, and a `fire_marksman` sound
  id (silent until a wav lands).

## Phase 15 — Weapon Mastery progression (this round, v0.15.0)

Now that weapons matter (Phase 14), each gun gets its own **progression to
chase** — a per-weapon mastery badge that climbs with lifetime kills, plus a
one-time XP bonus at every tier-up. A retention hook (more reasons to keep
playing each weapon → longer sessions → more ad impressions), self-contained
and client-side, **migration-safe**, working in solo + MP (kill events already
carry the weapon). No protocol change.

- **Mastery ladder** — Bronze 25 / Silver 100 / Gold 300 / Diamond 750 / Master
  1500 lifetime kills per weapon, each with an escalating one-time XP reward
  (100→2000). `Account` extended migration-safe (`weaponKills` + sanitizer);
  `recordKill` now takes the weapon id, awards the bonus on a tier crossing, and
  returns a `MasteryUp` descriptor.
- **Tier-up toast** — new `ui/MasteryToast.ts` slides a light badge in from the
  right ("BRONZE Mastery · Marksman · +100 XP"), queued so rapid tier-ups chain;
  new `masteryUp` bus event + `mastery_up` sound id (silent until a wav lands).
- **Profile "Weapon Mastery" grid** — every weapon with its badge, current tier,
  a progress bar to the next tier, and the kill goal. Verified with a 15-check
  headless logic test.

## Project status

15 phases complete. Movement, combat, classes, weapons, maps, HUD, multiplayer, landing site, progression, audio, polish, scoreboard + killstreaks + lifetime stats + daily challenges + AdSense + onboarding, directional damage indicators + low-HP tension + death recap + tracer cosmetics + announcer specials, Gun Game mode, per-weapon authoritative damage in MP + the Marksman precision rifle, **weapon mastery progression** — all shipped. Deploy groundwork laid (Fly.io + Vercel), awaiting account setup.

## Project deliverables

- `/client` — Vite + TS + Three.js game client. `~189 KB gzipped`. Single-player, Practice Range, online FFA, Gun Game, scoreboard, killstreaks, profile/stats, ads, directional damage indicators, low-HP tension, death recap, tracer cosmetics, announcer specials, 6 weapons incl. the Marksman, **weapon mastery**. v0.15.0.
- `/server` — Node + Express + Socket.io. 32 Hz server-authoritative tick. Lag-comp hitscan with **per-weapon damage + pellet/falloff model**. Networked abilities + barriers. Authoritative match-end + class passives. Protocol v2. v0.15.0.
- `/website` — Static landing site at `ilcartigo.com`. Home + privacy + terms + about. AdSense slots reserved (uncomment to activate).

## What you'd want to do next (post-v1)

Things deliberately left for later:

- **Deploy** — finish the Fly.io (server) + Vercel (site/client) deploy. Config is written; needs account setup + a registered domain (see `PHASE_PLAN.md`).
- **Audio assets** — the full SFX pipeline is wired (weapons, hits, abilities, footsteps, jumps, killstreak stings, UI); drop CC0 `.wav`s into `client/public/assets/sounds/` per the catalog and they "just work."
- **Real account backend** (Supabase / Firebase) for cross-device progression + a real (server-validated) leaderboard.
- **TDM game mode** — team assignment, team spawns (maps already define `teamSpawns`), team scoring.
- **Matchmaking + multiple rooms** instead of one shared FFA.
- **Anti-cheat** beyond server authority (movement validation, fire rate caps).
- **More cosmetics**: crosshair preset packs, tracer colors, victory poses.
- **Bot AI improvements**: per-map waypoints, stair climbing.

---

**License:** All asset names, class names, weapon names, and map names are original. No third-party assets shipped.
