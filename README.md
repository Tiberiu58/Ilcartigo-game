# ILCARTIGO

Fast-paced browser arena shooter — Krunker-style movement, class-based abilities.

> **Status:** v0.38.0 — **medal-exclusive cosmetics.** Prestige flair you can *only earn, never buy*: four cosmetics gated behind specific career medals instead of an XP price — the **Champion** tracer (win 10 matches), the **Headhunter** tracer (250 headshots), the **Conqueror** kill effect (2,500 kills), and the **Prestige** weapon finish (level 25). The achievement tracker grants them automatically on unlock (and retroactively, silently, to veterans who already qualify); the Cosmetics tab shows locked exclusives as **"🏅 {Medal}"** with no purchase path. Ties the medal grind to a combat-visible payoff. Pure-client, no protocol change. Built on **v0.37.0 — Hardpoint (King of the Hill) mode.** A new solo *objective* mode (the first since the roster filled with frag-races): a glowing capture zone appears — stand in it **alone** to bank control, an enemy inside **CONTESTS** it, and the zone **relocates every 26 s** to force a fresh fight. Bank the full meter to win → a results card showing your clear **time** vs your persistent best (lower is better). Bots hunt you, so they naturally crowd whatever zone you hold = real map-control pressure with zero new AI; a constant 4-bot pool keeps biting, and death just respawns you (the run is a race against the clock, not elimination). Pure-client, no protocol change. Built on **v0.36.0 — career achievements & medals.** A long-horizon rewards loop: **24 permanent medals** (kills · headshots · streaks · wins · weapon mastery · mode bests · level · playtime) that grant bonus XP and pop a flashy tier-coloured **"MEDAL UNLOCKED"** banner the instant you earn one. A new **Awards** settings tab tracks every medal with a progress bar + earned/total header; medals are evaluated on every account change by a re-entrancy-guarded tracker, with a silent retroactive pass on first boot so veterans get what they've already earned (no toast spam). Pure-client, migration-safe, no protocol change. Built on **v0.35.0 — per-weapon reload animations + weapon colours.** Each weapon now plays a mechanism-appropriate reload motion timed to its real reload window — mag-swap cant/dip (AR · SMG · Marksman · LMG), bolt-cycle jerk (Sniper), double pump-rack (Shotgun), slide pull (Pistol), smooth power-cell tilt (Railgun) — layered into the viewmodel alongside recoil/bob/swap. The FBX weapon exports shipped with all-white materials, so colours are reconstructed from each part's material **name** (LightWood/Metal/Barrels…), plus a per-file index palette for models with generic names (the P90 → dark-olive body). Built on **v0.34.0 — real 3D weapon models**: the first-person viewmodel shows detailed FBX guns (rifle, P90, sniper, shotgun, LMG, ray-gun, pistol) instead of procedural boxes — lazy-loaded, de-rigged (SkinnedMesh→static Mesh so they clone + render), auto-normalized + oriented muzzle-forward, with a graceful box fallback. Built on the v0.33.0 **second routine-integration round.** Two more autonomous build branches merged onto `main`, combining everything they each built. **From the power-ups/progression branch:** **Arena Power-Ups** (OVERCHARGE ×1.7 dmg, RAPID FIRE ×1.55 RoF, OVERSHIELD 50%-absorb — contested buff pads, solo-only), the **Railgun** (8th weapon — piercing beam, one-shot heads, line multi-kills), **Daily Login Rewards** (7-day escalating XP streak), **"ON FIRE" rampage** (persistent killstreak aura), **cosmetics expansion** (kill effects →8, tracers →10, finishes →8), and **skill-shot callouts** (NO SCOPE / AIRBORNE / LONGSHOT). **From the content/feel branch:** **Duel** (solo 1v1 gauntlet — single-elimination ladder vs escalating rivals), **Frostline** (6th combat map, frozen tundra), **weapon identity cards** (archetype + stat bars in the loadout), a **rising hitmarker**, and a **kill banner** ("ELIMINATED {name}"). Their overlapping post-match work was reconciled into one card (accolade + stat strip + NEW PERSONAL BEST). All pure-client / zero-protocol — solo + live MP both intact. Built on the v0.24.0 routine-integration round (Team Deathmatch, Onslaught, Cobalt + Overpass maps, LMG, melee, grenade, nameplates, bot difficulty), the publication round (site + game on Vercel, **MP server live on Fly.io** at `ilcartigo-game.fly.dev`, AdSense `ca-pub-8134911671778438` verified), and Phase 13–14 (Gun Game, Aim Lab, rank ladder, weapon mastery, Marksman, server-authoritative per-weapon damage, minimap, impact FX, health pickups, weapon finishes).

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
| `V` / `F` | Quick melee (knife) |
| `G` | Throw frag grenade |
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

**Phase 13 additions to the catalog** (same drop-in rules — silent until present):

| Filename | What it is | Suggested freesound.org search |
| --- | --- | --- |
| `pickup_health.wav` | Health-pack grab chime | "health pickup", "heal collect", "powerup grab" |
| `melee.wav` | Knife swing whoosh / slash | "knife swing", "whoosh swipe", "melee slash" |
| `grenade_explode.wav` | Frag grenade detonation | "grenade explosion", "frag boom", "explosion" |

**Phase 25 additions to the catalog** (same drop-in rules — silent until present):

| Filename | What it is | Suggested freesound.org search |
| --- | --- | --- |
| `pickup_powerup.wav` | Arena power-up grab (overcharge / rapid) | "power up", "buff activate", "energy pickup" |
| `fire_railgun.wav` | Railgun beam discharge (heavy electric crack) | "railgun", "energy beam shot", "sci-fi laser shot" |
| `fire_lmg.wav` | LMG burst (deep rapid chug) | "machine gun", "lmg shot", "heavy mg" |

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

The first new game mode — mode variety is the biggest driver of replay value in
arena shooters. Self-contained, solo-vs-bots, no protocol/MP changes, fully
browser-verified.

- **Weapon ladder** `smg → ar → shotgun → sniper → marksman → pistol`. Each kill
  advances the killer one rung; the player's gun visibly swaps in hand. First to
  land a kill on the FINAL rung (pistol) wins → post-match overlay. The pistol is
  special-cased (it's the secondary slot, so it selects slot 1).
- New `modes/GunGame.ts` (bus-driven, decoupled via a small `GunGameHost`
  interface), `Game.setPlayerPrimaryWeapon`, `GameMode` extended +
  `isCombatMode()` helper, a top-center Gun Game ticker ("LVL n/6 · WEAPON" +
  pips), and a "🔫 Gun Game" main-menu button. Play Again restarts the ladder;
  Quit restores your chosen loadout weapon.

## Phase 14 — Mode + progression expansion (this round, v0.14.0)

This round **integrated four parallel build branches** (an autonomous build loop
pushed each to its own branch) feature-by-feature onto `main`, resolving the
overlaps by hand and verifying typecheck + build green after each merge. Net
result, all live on `main`:

**New modes & content:**
- **Aim Lab — solo aim trainer.** A "Training" hub with timed drills (Target Rush,
  Flick Precision) — glowing targets pop into the arena, you flick to them; score =
  targets popped, with per-drill persistent personal bests surfaced in the Profile
  tab. Targets are huge-HP `Damageable`s so they never fire `kill` events (combat
  feedback/progression stays clean). New `modes/AimLab.ts` + drill-select hub +
  results card (a natural ad breakpoint). Reachable from the menu.
- **Marksman — new weapon (semi-auto precision DMR).** Fills the gap between AR and
  sniper. Full client config + viewmodel + a server-side damage profile, and it's
  the 5th rung of the Gun Game ladder.

**Progression depth (retention → ad impressions):**
- **Rank ladder + level-up celebration.** A named rank track with a center-screen
  level-up banner, floating **+XP popups** on kills, and rank badges (HUD + menu).
  New `account/Ranks.ts` + `ui/ProgressionFX.ts`.
- **Weapon mastery + skins.** Per-weapon lifetime kills unlock viewmodel-tint skins
  (no XP cost — you earn them by *using* the gun). New "Weapon Skins" grid grouped
  by weapon in Cosmetics; mastery counts shown.
- **Weapon-finish cosmetics.** A second viewmodel axis — an emissive sheen (Standard
  free, then Gilded / Frostforge / Toxic / Crimson / Voidlight, 350–2500 XP).
  `Account` extended migration-safe for both axes.

**Real MP fix:**
- **Server-authoritative per-weapon damage + falloff.** The server previously dealt
  AR damage for *every* weapon online; now a `SERVER_WEAPONS` table mirrors each
  client weapon's base damage / headshot mult / falloff ramp, so weapon identity
  actually matters in MP (snipers one-shot heads, SMGs chip, etc.).

**Spatial awareness & combat juice (from the radar/FX branch):**
- **Minimap / tactical radar** (top-right canvas; static geometry + jump pads +
  health pickups + your heading arrow + enemy dots, cloaked/dead hidden; toggle in
  Settings → General). New `ui/Minimap.ts`.
- **Speed lines** (edge motion streaks above bhop speed), **bullet-impact FX**
  (pooled dust/spark bursts at every hit, `weapons/ImpactFX.ts`), **map health
  pickups** (+40 HP pads, server-authoritative in MP — **protocol v3** —, local in
  solo, `entities/PickupManager.ts`), **dynamic crosshair hit feedback** (recolour +
  pop: white body / gold head / red kill), and **floating score/heal popups**
  (`ui/ScorePopup.ts`).
- **Crosshair preset packs** (one-click shape packs in Settings → Crosshair).

**Polish:**
- **Main-menu scroll fix.** The grown menu (added Gun Game / Aim Lab / How-to
  buttons) was clipped top + bottom on short windows; `.menu-center` now uses
  `overflow-y: auto` + `safe center` so everything is reachable via scroll, with a
  themed scrollbar. Browser-verified.

> **Integration note:** a fifth routine branch (arena power-ups: damage-boost /
> haste) was deliberately **not** merged — it implemented an incompatible second
> pickup system (and a duplicate "DMR" weapon) that would have clashed with the
> health-pickup system above. Left for a future, deconflicted pass.

### Bundle size

Production client: **~196 KB gzipped** total (engine ~122 + app ~70 + CSS ~9 + HTML ~8).
No new dependencies.

## Routine integration (v0.24.0)

> The phase sections below come from **two parallel autonomous build branches**
> that each independently numbered their work "Phase 15+". They were hand-merged
> onto `main` together (see `PHASE_PLAN.md` for the integration log). The
> original per-branch phase numbers are kept as-written for traceability; the
> unified release is **v0.24.0**. Branch A (TDM line) sections come first, then
> Branch B (Onslaught line).

### Branch A — TDM / weapons / content line

## Phase 15 — Team Deathmatch (this round, v0.15.0)

The first **team** mode — the most-played format in Krunker/CS and the headline
gap in the roster. **Team Deathmatch** is solo-vs-bots: **BLUE** (you + 2 ally
bots) vs **RED** (3 enemy bots), first team to **50 frags** wins. It also doubles
as a big **bot-AI upgrade** — bots now hunt across team lines, so the arena feels
alive even when you hang back. No protocol change (MP stays FFA); solo, MP, Gun
Game and Aim Lab all keep working.

- **Unified bot targeting.** `Bot.update(dt, targets)` engages the nearest
  visible enemy (different team, alive, not cloaked, LoS). FFA/Gun Game pass only
  the player (behaviour unchanged); TDM passes player + all bots so bots fight
  the other team.
- **Team-aware friendly fire.** `World.raycast` skips same-team damageables
  (bullets pass through teammates), plumbed via `Weapon.ownerTeam` /
  `WeaponInventory.setOwnerTeam`. FFA semantics unchanged when unset.
- **3-v-3 roster.** Two extra bots (`sentinel`/`raider`) stay dormant in
  Combat/Gun Game (those modes keep their original 3 bots) and activate only for
  TDM. Team colours (blue/red figures + minimap dots), home spawns on each map's
  existing `teamSpawns`, team scoring + 50-frag win, a BLUE-vs-RED HUD ticker, a
  team-grouped Tab scoreboard, and a VICTORY/DEFEAT post-match by *your team's*
  result. New "⚔ Team Deathmatch" main-menu button.

## Phase 22 — LMG weapon (this round, v0.22.0)

A seventh weapon — the **LMG**, a belt-fed suppressor: 60-round mag, 11 RPS,
lower per-shot damage than the AR, heavy bloom + a long 3.2 s reload. Wins through
volume and area denial, not precision — a distinct sustained-fire archetype. Full
client config + a chunky viewmodel + a server damage profile (so it's
authoritative in MP), selectable in the loadout. (Not on the Gun Game ladder,
which stays its fixed six rungs.)

## Phase 21 — Frag grenade (this round, v0.21.0)

A thrown frag on **G** — arcs under gravity, settles on the first surface, and
detonates on a short fuse for a line-of-sight-gated area burst (radius 6.5, up to
95 dmg with linear falloff), with a bright flash + expanding shockwave + proximity
shake. ~6 s cooldown. Reuses the damage/kill bus (`weaponId 'grenade'`), respects
TDM friendly fire, and omits self-damage (PvE-friendly). **Solo only** (no
protocol; MP damage is server-authoritative). New `grenade_explode.wav` sound id.

## Phase 20 — Quick melee (this round, v0.20.0)

A fast knife strike on **V** / **F** — the universal close-range "panic button"
every arena shooter has, and a satisfying way to finish a rush. Short-range
forward raycast (3.2 m, 55 dmg, ×1.3 on a head), ~0.6 s cooldown, with a viewmodel
swing, impact spark, hitmarker, and full killfeed/XP integration (`weaponId
'knife'`). Friendly-fire-aware in TDM. **Solo only** (MP damage is
server-authoritative and there's no melee in the protocol). New `melee.wav` sound
id (silent until the asset lands).

## Phase 19 — Solo FFA matches (this round, v0.19.0)

The default "Play vs Bots" mode was the only combat mode with no win condition —
it ran forever and never reached the post-match screen (the main natural ad
breakpoint). Now solo FFA is a real match: first to 30 kills (you or a bot) wins
→ post-match → Play Again. The FFA score ticker also shows in solo, and bot
callsigns appear in the ticker + post-match. Pure client, no protocol change.

## Phase 18 — Cobalt arena (this round, v0.18.0)

The third combat map. **Cobalt** is the first built for pure competitive symmetry
(mirrored about both axes) with a cool steel-blue + teal-neon palette for instant
contrast with warm Sandstone / rusty Industrial. A raised central platform
(jump-pad ring + cover), two symmetric raised team decks for TDM, diagonal crate
cover, flank walls, and health pickups. Selectable for all solo combat modes;
MP keeps serving its authoritative map, so Cobalt is solo-only and changes
nothing online.

## Phase 17 — Enemy nameplates (this round, v0.17.0)

Floating **callsign + health bar** over bots — a Krunker staple that makes combat
instantly readable and surfaces the new callsigns mid-fight. Billboarded sprites
with `depthTest` so walls occlude them (fair — no wallhack), distance fade, and
team-coloured names in TDM. Solo only (bots); toggle in Settings → General. Pure
client, no protocol change.

## Phase 16 — Bot difficulty + callsigns (this round, v0.16.0)

A pure-client, zero-protocol round that widens the audience and makes bots feel
like real opponents (both amplify every solo mode → longer sessions → more ad
breakpoints).

- **Bot difficulty selector (Easy / Normal / Hard)** in the menu, persisted and
  applied live. Scales the whole roster's *AI feel* — reaction time, aim jitter,
  predictive lead, fire cadence — without touching weapon stats (no rebuild). New
  players can win; veterans get punished on Hard (snappy, accurate, leads shots).
- **Humanized bot callsigns** (Drifter / Viper / Specter / Bishop / Havoc) in the
  killfeed, scoreboard, and death recap, via a unified `Game.displayNameFor(id)`
  resolver. The stable bot id remains the scoring key.

### Branch B — Onslaught / Overpass line

## Phase 15 — Onslaught (wave survival) mode (this round, v0.15.0)

The strongest solo hook the game was missing: a **high-score survival loop**.
ILCARTIGO plays single-player without a deployed server, so a mode that's
inherently fun offline — and ends on a results card (a natural ad breakpoint) —
is the most valuable next addition. Self-contained, **zero protocol/server
change**, solo + MP both intact.

- **Endless escalating waves.** Each wave spawns `min(8, 2 + ⌊wave·1.2⌋)` bots;
  the difficulty mix climbs (early waves are wanderers, wave 3+ adds engagers,
  wave 6+ sprinkles in predictors). A big center-screen **"WAVE n"** banner + a
  3 s breather open each round.
- **Lives + reward loop.** You get **3 lives**; clearing a wave **fully heals**
  you and banks a scaling **+XP bonus** (`25 + wave·15`). Run ends when lives
  run out → an **OVERRUN** results card: waves survived, eliminations, best wave,
  bonus XP, NEW-BEST flag, Play Again / Quit. Personal best persists
  (`ilc.onslaught.best`) and shows on the menu button (`☠ Onslaught · best wave
  N`) + Profile → Bests.
- **Reuses the bot AI verbatim.** Wave bots are ordinary `Bot`s that just don't
  auto-respawn, so every wave-bot death is a normal player frag — XP, lifetime
  stats, killfeed, announcer (multi-kills/streaks), and weapon mastery all work
  with no special-casing. The mode owns the roster only while it runs
  (`Game.setSurvivalActive` parks the base bots; `Bot.dispose` cleans up wave
  bots between runs).

New `modes/Onslaught.ts` + `'onslaught'` GameMode + Bot lifecycle additions
(`autoRespawn`/`ephemeral`/`dispose`) + HUD ticker, wave banner, results card,
and menu button. App chunk ~71.8 KB gzip (+1.6 KB this phase). No new deps.

## Phase 16 — Overpass (new combat map) (this round, v0.16.0)

A third combat map — the highest-leverage *content* lever in an arena shooter,
and it deepens **every** solo mode at once (Combat, Gun Game, Onslaught + the
map selector). Distinct identity: **verticality**.

- **Overpass** — an urban-dusk arena around a raised **E-W bridge deck** (the
  dominant sniper sightline, y=5) over two ground-level **container lanes**
  (close-quarters cover) and four mid-height **corner decks** (y=3). Cool
  concrete/steel palette, teal accents, sodium pads, deep-blue dusk fog.
- **Reliable vertical access:** a **staircase on-ramp at each bridge end** (treads
  under the controller's auto-step, so you climb smoothly) + corner-deck jump
  pads placed outside their footprint. Falling off just drops you to ground
  level (fully enclosed — no void), so the high ground stays inviting.
- **Solo-selectable, zero MP risk.** New `maps/OverpassMap.ts` (the proven
  Sandstone/Industrial box + stair pattern) registered in `MapId`/`MAPS` + a
  loadout button; the MP server still defaults to Sandstone and clients adopt the
  server's map, so no protocol/server change. Health-pack placements added to
  both client + server `Pickups.ts`. Geometry verified headlessly (all spawns
  clear of solids). App chunk ~72.9 KB gzip (+1.1 KB). No new deps.

## Phase 25 — Arena Power-Ups (this round, v0.25.0)

The first new *gameplay-loop* addition since map health pickups — and the
long-deferred "arena power-ups (damage boost / haste)" from the roadmap, now
implemented cleanly. Earlier attempts were dropped because a prior branch
entangled power-ups with the **health-pickup wire protocol**; this round sticks
them entirely in a **solo-only, weapon-layer** system, so there is **zero
protocol/server change** and MP is untouched.

- **Two contested buff pads per combat map.** **OVERCHARGE** (crimson gem) →
  ×1.7 weapon damage for 9 s; **RAPID FIRE** (gold gem) → ×1.55 fire rate for
  9 s. Pads float + spin, are grabbed by walking over them, then go on a 20 s
  respawn — classic map-control: rotate to the buff, fight over it, lose it when
  you die.
- **Weapon-layer effects only.** New `Weapon.damageMultiplier` /
  `fireRateMultiplier` (applied in `computeDamage` / `tryFire`), driven by
  `WeaponInventory.setDamage/FireRateMultiplier` (persisted across `setPrimary`
  like the reload multiplier + team). Nothing about movement, networking, or the
  server controller changes — so the two controllers stay trivially in sync.
- **Solo combat / TDM / Onslaught only.** Gated off in MP (where damage is
  server-authoritative — a client-only buff would mislead), Gun Game (keeps its
  ladder identity), and Practice. Dying drops your buff; a fresh match restores
  all pads.
- **Juicy feedback.** Grab fires `pickup_powerup` SFX, a coloured `CastFX`
  burst, a screen-edge flash, screen-shake, and an `OVERCHARGE!/RAPID FIRE!`
  score-pop. A left-edge **buff tray** shows each active power-up with a
  draining timer bar; pads also show as diamond markers on the minimap.
- New `entities/PowerupManager.ts` (mirrors the `PickupManager` pattern but is
  fully independent of the health-pickup data/protocol). Pad placement is
  derived from each map's FFA spawn anchors (guaranteed clear of solids), pulled
  toward map centre with a solid-overlap fallback — so a future map can never
  embed a pad in geometry. New `pickup_powerup` sound id.

## Phase 32 — Skill-shot callouts (this round, v0.32.0)

Rewards *how* you frag, not just that you did — the CoD/Krunker skill-expression
hooks that make a clutch kill feel earned (and make you want to do it again).
Pure-client, no protocol change.

- **NO SCOPE** (sniper kill while un-scoped), **AIRBORNE** (you were off the
  ground), **LONGSHOT** (lethal hit ≥45 m away) — flashy center-screen callouts.
- **Clean integration.** A new optional `Announcer.resolveKillStyle(e)` resolver
  (wired in `main.ts`, inspects live `game.player` / weapon state at kill time)
  slots into the Announcer's existing priority: just under the First Blood /
  Revenge / Comeback specials, over the generic multi-kill / streak banners, with
  the multi/streak riding the subline. (Railgun *collaterals* already surface via
  the multi-kill system — two pierced kills = DOUBLE KILL.)

## Phase 31 — Cosmetics expansion (this round, v0.31.0)

A content drop deepening the unlock chase (more to grind for → more sessions →
more ad impressions). Pure data — the Cosmetics UI auto-iterates the registries,
so the new items appear, unlock and equip with no logic change.

- **+4 kill effects** (Emerald Shock, Amber Burst, Violet Rift, Inferno —
  1200–4500 XP) → 8 total. Seen on every kill.
- **+4 bullet tracers** (Emerald, Violet, Amber, Ice Blue — 1500–3400 XP) → 10
  total. Seen on every shot.
- **+2 weapon finishes** (Verdant, Solar Flare — 3200/4000 XP) → 8 total. Seen
  on the viewmodel the whole time you hold a gun.

## Phase 30 — Match Summary (this round, v0.30.0)

Upgrades the **post-match overlay** — the game's main natural ad breakpoint —
from a bare scoreboard into a personal **match summary**, increasing both
satisfaction (a clear "how did *I* do") and dwell time on the ad screen
(revenue). Pure-client, no protocol change.

- **Your-stats strip** above the scoreboard: KILLS · DEATHS · K/D · **BEST
  STREAK** · PLACE (rank, or WON/LOST in TDM). Best-streak comes from a new
  `Announcer.bestStreak` (a match-max tracked alongside the existing streak,
  reset with the rest on `announcer.reset()`).
- **NEW PERSONAL BEST badge** — a pulsing gold banner when you set a record for
  most kills in a single match (persisted to `localStorage`), the kind of "beat
  your record" hook that pulls players into one more game.

## Phase 29 — Overshield power-up (this round, v0.29.0)

Rounds out the **Arena Power-Up triad** started in Phase 25 with a *defensive*
option, so the buff pads pose a real choice (damage vs speed vs survivability)
instead of two offensive variants. Pure-client, solo-only, no protocol change.

- **OVERSHIELD** (teal pad) → the local player **absorbs 50% of incoming
  damage** for 9 s. Implemented as a tiny `Health.damageReduction` field applied
  in `takeDamage` (0 everywhere but the buffed local player), so nothing about
  the damage flow, bots, or networking changes.
- **Full reuse.** Third `PowerupType` + a third map pad (placement now picks 3
  spread spawn anchors), the teal grab flash + `OVERSHIELD!` score-pop, a
  `🛡 OVERSHIELD` buff-tray pill, and a teal minimap diamond — all via the
  existing power-up plumbing. Clears on death / fresh match through the same
  `clearBuffs` path.

## Phase 28 — "ON FIRE" Rampage (this round, v0.28.0)

A pure-client **combat-juice** round on the brief's "flashy feedback / desire to
win the next duel" pillar. Where the Announcer pops one-shot milestone *banners*
(KILLING SPREE, RAMPAGE…), this adds a **persistent state you feel the whole
time you're hot** — a heat aura you don't want to lose.

- **Sustained rampage aura.** On a **5+ killstreak**, a heat glow rises from the
  screen edges + a streak badge appears above the crosshair, escalating through
  tiers — **ON FIRE** (5, orange) → **INFERNO** (10, red) → **BLAZING** (15+,
  violet) — and snapping off the instant you die.
- **Single source of truth.** New `Announcer.onStreakChange` fires on every
  kill / death / reset (the Announcer already owns the streak); a new
  `ui/RampageFX.ts` translates it into `<body>` tier classes (CSS drives the
  aura) + the badge. No new kill/death bookkeeping, no per-frame cost
  (edge-toggled), and it clears cleanly on match reset / mode switch / quit via
  the existing `announcer.reset()` calls.

## Phase 27 — Railgun weapon (this round, v0.27.0)

An **eighth weapon** with a genuinely new mechanic — the first non-config
archetype since the base roster. The **Railgun** is a heavy precision beam that
**pierces every enemy in a line** until it hits a wall: line up a row and delete
it with one shot. Pinpoint (zero spread), no falloff, slow (0.85 RPS), a 4-round
mag and a 3 s reload, 75 dmg (2-shot body, **1-shot headshot** at ×2.0). The
flashiest multi-kill tool in the game.

- **New `World.raycastPierce`** — finds the nearest wall along the ray, then
  returns every damageable in front of it (sorted near→far, head/body), skipping
  the shooter / dead / same-team. `Weapon.firePiercing` drives one beam tracer to
  the wall via a single `shot` event and applies damage to each pierced enemy
  with its own damage/kill event, so killfeed, damage numbers, XP, mastery and
  the announcer (multi-kills!) all work for free.
- **Full integration** — `RAILGUN_CONFIG` + `pierce` flag in `WeaponConfig`, a
  cyan-coiled `buildRailgun` viewmodel, `WEAPON_LABEL`/`WEAPON_BUILDERS` entries,
  a loadout button, three **mastery skins** (Ion / Plasma / Singularity), and
  `fire_railgun` + `fire_lmg` sound ids.
- **MP-safe.** Pierce is **solo-only** (it isn't in the protocol); online the
  server applies the Railgun as a hard-hitting **single-target** weapon via a new
  `SERVER_WEAPONS['railgun']` profile + `VALID_WEAPONS` entry — so weapon identity
  still matters in MP, just without the line-pierce bonus. No protocol change.

## Phase 26 — Daily Login Rewards (this round, v0.26.0)

A pure-client **retention + revenue** layer (different pillar from v0.25's
gameplay round): the show-up reward loop every live game runs. It complements
the existing in-match daily *challenges* (do X to earn XP) with a daily
*login* reward (just come back).

- **Escalating 7-day cycle.** `LOGIN_REWARDS = [100, 150, 200, 300, 400, 600,
  1200]` XP. Consecutive days advance the streak (day-7 jackpot, then the cycle
  repeats); a missed day resets to day 1. One claim per local day.
- **Migration-safe `Account` extension.** New `login: { last, streak }` state
  (defaulting cleanly on old saves), `dailyLoginStatus()` (what claiming now
  would grant + cycle position), and `claimDailyLogin()` (awards the XP, advances
  the streak, once per day). Date math is verified (continue / reset / day-8
  cycle / same-day-locked).
- **Reward card.** A `#daily-overlay` with a 7-chip track (past dimmed, today
  pulsing gold, claimed green, day-7 jackpot styled), a Claim button showing the
  exact XP, and a streak line. **Auto-shows once per day** when a reward is
  waiting (but never on top of the first-run How-to card for brand-new players),
  and is replayable from a new **🎁 Daily Reward** menu button. Claiming plays
  the level-up sting and the XP flows through the normal `account.onChange`
  (rank/cosmetics UIs update live). More daily menu visits = more ad impressions
  on the menu's existing slots.

## Publication & Monetization (this round)

The first round focused on **going live** rather than gameplay. Code-side deploy
plumbing existed since Phase 11; this round assembled it into a one-command
deploy, deployed the site + game to Vercel, and made the AdSense switch-on a
documented three-edit checklist.

**Combined Vercel deploy (site + game in one project):**
- `vite.config.ts` now takes a configurable **`base`** — `/play/` for production
  (so the game's asset URLs resolve under the sub-path) and `/` in dev. Override
  with `BASE=/ npm run build` for a root-hosted build.
- New **`build-static.sh`** (repo root) assembles the deploy output dir
  `public/`: the marketing site at the root + the game built with `base=/play/`
  copied to `public/play/`. (Handles the Git-Bash `MSYS_NO_PATHCONV` leading-
  slash gotcha so it builds correctly on Windows too.)
- New **`vercel.json`** wires Vercel to run `build-static.sh`, serve `public/`,
  `cleanUrls`, and long-cache the immutable hashed `/play/assets/*`.
- `public/` added to `.gitignore` (build artifact).
- **Result:** one Vercel project serves the marketing site at `/` and the full
  game at `/play/` — matching the site's existing `/play/` links. Verified the
  combined build locally (asset paths correctly rewritten to `/play/assets/…`).

**AdSense — publisher ID live, verification done:**
- Real publisher id **`ca-pub-8134911671778438`** wired into: the `<head>` of all
  four site pages (home/about/privacy/terms — the AdSense site-verification
  snippet), `website/ads.txt` (`google.com, pub-8134911671778438, DIRECT, …`),
  and the game client (`client/src/ads/Ads.ts` → `isConfigured` now true, so the
  AdSense loader script runs in-game).
- Site ownership **verified** via AdSense's "code fragment" method against the
  live Vercel URL. **Account approval is the next gate** (Google reviews the live
  site); per-slot **ad-unit ids are still placeholders** (`0000000000`) — you
  create those units in the AdSense dashboard *after* approval and paste them
  into `Ads.ts` / replace the site's reserved `.ad-slot` divs with `<ins>` tags.
  Until the units are real, AdSense serves blank for them, which is the correct
  state for a verified-but-pending account.
- `ADSENSE.md` documents the post-approval ad-unit step.
- The privacy policy already discloses AdSense cookies (`privacy.html` §4) and
  the consent banner gates personalized ads — both approval requirements met.

**Multiplayer server deploy — done (Fly.io):**
- Server **live at <https://ilcartigo-game.fly.dev>** — launched via Fly's
  GitHub integration (Working directory `server`, config `fly.toml`), region
  Frankfurt (`fra`), one always-on `shared-cpu-1x`/256 MB stateful machine.
  `CLIENT_ORIGIN` env set to the Vercel origin at launch. `fly.toml` app name
  synced to `ilcartigo-game` on `main` (Fly named it after the repo).
- Client wired: **`client/.env.production`** sets `VITE_SERVER_URL` →
  `https://ilcartigo-game.fly.dev`, baked into the Vercel build, so the live
  game's "Play Online (FFA)" connects to Fly (was the `localhost:3001` dev
  fallback). Verified: server health, socket.io handshake, and CORS from the
  game origin all 200.
- New **`DEPLOY.md`** — the full three-piece runbook (now all three live): the
  Vercel build, the Fly server (CLI + GitHub-integration paths), `CLIENT_ORIGIN`
  / `VITE_SERVER_URL` wiring, an `ilcartigo.com` cutover section, and an
  ops/rollback cheatsheet.

**Live URLs (deployed this round):**
- Site + game → **<https://velocity-two-chi.vercel.app>** (stable alias).
  Site at `/`, game at `/play`, `ads.txt` at `/ads.txt` — all verified 200,
  asset paths correctly under `/play/assets/…`. Vercel project:
  `tiberiu58s-projects/velocity` (GitHub-connected → pushes auto-deploy).
- A custom domain (`ilcartigo.com`) can be added in the Vercel dashboard later;
  canonical URLs already point there.

**What's live vs. pending:**
- ✅ Site + game client → Vercel (single-player, Gun Game, Aim Lab, and the
  whole site work immediately; no server needed for those).
- ✅ MP server → Fly.io: **deployed and live** at **<https://ilcartigo-game.fly.dev>**
  (app `ilcartigo-game`, region `fra`/Frankfurt, single always-on stateful
  machine, protocol v3). Launched via Fly's GitHub integration. `CLIENT_ORIGIN`
  set to the Vercel origin (CORS verified). The client's `VITE_SERVER_URL`
  (`client/.env.production`) points at it, so **Play Online (FFA) now connects to
  the live server** — verified end-to-end (health + socket.io handshake + CORS).
- ✅ AdSense → real publisher id `ca-pub-8134911671778438` live on all pages +
  in-game; site ownership verified. ⏸ Pending Google **approval** + creating the
  per-slot ad units (then paste their ids into `Ads.ts` / the site `<ins>` tags).
- ⏸ Domain → using the free `*.vercel.app` URL for now; canonical URLs already
  point at `ilcartigo.com` for the eventual cutover.

## Phase 25 — Duel (1v1 gauntlet) mode (this round, v0.25.0)

The first pure **1v1** mode — the most direct expression of the core loop, *the
constant desire to win the next duel*. **Duel** is a solo gauntlet: you face one
opponent in a fair fight, and each win advances you to a tougher rival
(escalating brain tier + AI skill + HP, distinct cycled callsigns, late rivals
glowing crimson). Lose a single duel and the run ends on a **DEFEATED** results
card (a natural ad breakpoint) showing your win streak vs your persistent
personal best — infinitely replayable beat-your-best chase. Reuses the Onslaught
roster pattern (parks base bots; each rival is an ordinary non-respawning `Bot`
so XP / stats / killfeed / announcer / mastery all just work). New `'duel'` mode
(single elimination, owns its respawn), `modes/Duel.ts`, a gold "VS {RIVAL}" /
green "DUEL WON" banner, a `🎯 Duel` menu button + a Duel-streak cell in Profile.
Pure client, no protocol change — solo + MP both intact.

## Phase 26 — Weapon identity + hit juice (this round, v0.26.0)

Two small, high-feel touches. **Rising hitmarker:** consecutive landed hits ramp
the hit-confirm SFX pitch up (+4% per link, capped, resetting after a short gap)
— the satisfying "I'm shredding them" audio escalation arena shooters are loved
for (`AudioManager.play` gained an optional playback `rate`). **Weapon identity
card:** the loadout now shows the selected weapon's archetype + normalized stat
bars (Damage · Fire Rate · Range · Magazine) read from `WEAPON_LIBRARY`, so the 7
guns read as meaningfully distinct picks. Pure client, no protocol change.

## Phase 27 — Kill banner (this round, v0.27.0)

The one prominent kill-feedback piece still missing vs Krunker: a flashy
"ELIMINATED {name}" prompt right under the crosshair the instant you frag
someone (a hotter gold "HEADSHOT {name}" on a headshot). The killfeed + kill-X
marker existed, but neither put the victim's name center-screen as a punchy "you
got 'em" beat. New `#kill-banner` + `HUD.showKillBanner`, positioned clear of the
announcer + death recap, routed through `displayNameFor`. Pure client, no
protocol change.

## Phase 28 — Post-match personal scorecard (this round, v0.28.0)

The post-match overlay (the game's main ad breakpoint) now opens with a personal
**scorecard**: a dynamic accolade (FLAWLESS / DOMINATING / MVP / ON A TEAR /
SHARPSHOOTER / PODIUM FINISH / …) + your placement, kills, deaths, K/D. Makes the
result feel earned and keeps eyes on the ad-bearing screen a beat longer. Pure UI
off the existing match tallies (solo FFA · TDM · Gun Game · MP); no protocol change.

## Phase 29 — Frostline (new combat map) (this round, v0.29.0)

The fifth combat map — **Frostline**, a frozen tundra: packed-snow ground,
frosted pale-ice structures, translucent ice-block cover, aurora-cyan neon and an
icy-haze fog, for instant contrast with the four existing maps. Built on the
proven symmetric Cobalt skeleton (TDM-fair, spawns verified clear) then fully
re-themed + re-covered. Solo-selectable across FFA / TDM / Gun Game / Onslaught /
Duel; health pads mirrored client+server; MP keeps serving its authoritative map,
so Frostline is solo-only and changes nothing online. New `maps/FrostlineMap.ts`,
geometry verified headlessly (all spawns clear of solids).

## Phase 30 — Weapon mastery on the loadout card (this round, v0.30.0)

The loadout weapon card (Phase 26) now also shows the selected weapon's **mastery
progress** — lifetime kills + a bar toward the next mastery skin ("Verdant ·
23/50", "★ all skins unlocked" at max). Surfaces the use-to-unlock cosmetic reward
right where you pick the gun. Pure UI off `Account.weaponKillsFor` +
`weaponSkinsFor`; re-rendered on weapon select / boot / quit-to-menu.

## 3D weapon models (v0.34.0)

The first-person viewmodel was procedural boxes since the start. This round wires
in real **FBX gun models** (provided by the user) while keeping every existing
behaviour intact and the game safe if a model is ever absent.

- **`weapons/WeaponModels.ts`** — lazy FBX loader. `FBXLoader` is dynamically
  imported (its own ~16 KB-gzip chunk, out of the main bundle); models load
  async + cached; `onModelReady` lets the live viewmodel swap its box for the
  real model the instant it lands.
- **De-rig.** The models export as `SkinnedMesh` with skeletons — a plain
  `clone()` doesn't rebind bones, so cloned skinned meshes render invisibly
  (the bug that ate most of the build). Fix: bake each mesh's world matrix into
  fresh geometry and rebuild as a plain `Mesh`, dropping the rig entirely (the
  guns are static — no animation needed).
- **Auto-normalize.** FBX exports come in wildly different units; each model is
  recentred on the origin and uniform-scaled so its longest axis hits a per-
  weapon target length, then oriented (barrel down -Z) — no hand-guessed raw
  scales.
- **`Viewmodel.buildFor`** uses the loaded model when available, else the box
  builder (unchanged) — so a missing/failed model never breaks the game. Recoil,
  walk-bob, swap dip, muzzle-flash anchor, cloak opacity, and weapon-finish
  emissive all still apply (skin-tint is skipped for FBX — no single body box).
- **Mapping:** Rifle→AR, P90→SMG, SniperRifle→Sniper, Shotgun→Shotgun, Rifle→
  Marksman (no dedicated DMR model), LMG→LMG, RayGun→Railgun, Pistol→Pistol. The
  Revolver export is degenerate (a stray vertex blows its bbox to 42 000 units)
  so it's deliberately unused. Models live in
  `client/public/assets/models/weapons/`.
- Browser-verified in-hand (AR, sniper, ray-gun, pistol shown correct + forward-
  facing); client+server typecheck + build green. **Stage 2** (a player
  character model for remote MP players) is stocked
  (`assets/models/character/CubeMan.fbx`) but not yet implemented.

## Medal-exclusive cosmetics (v0.38.0)

Closes the loop between the career medals (v0.36) and the cosmetics chase —
**prestige flair you can only earn, never buy**, so the medal grind pays off
where you see it (every shot, every kill, the gun in your hands).

- **Four exclusives, medal-gated:** **Champion** tracer ← *Contender* (win 10),
  **Headhunter** tracer ← *Deadeye* (250 HS), **Conqueror** kill effect ←
  *Warmonger* (2,500 kills), **Prestige** weapon finish ← *Elite Operator*
  (level 25) — a reachable→long-haul spread.
- **`Cosmetics.ts`** gains an optional `medal?` on tracer / kill-effect / finish
  configs (cost ignored when set). **`Account.grantCosmetic`** unlocks them with
  no XP cost; **`AchievementDef.grants`** links a medal → cosmetic and the
  tracker grants it on unlock — live (with the medal toast) or silently on the
  first-boot retroactive pass, so veterans get what they already earned.
- **Cosmetics tab** shows a locked exclusive as **"🏅 {Medal}"** (no purchase
  path) with a gold `exclusive` cue; once earned it equips like anything else.
  Pure-client, no protocol change — solo + MP intact.

## Hardpoint — King of the Hill (v0.37.0)

The first **objective** mode in a roster otherwise made of frag-races — and the
most direct "hold the point / win the next fight" loop in arena shooters.

- **Solo King-of-the-Hill time-attack.** A glowing capture zone (translucent
  disc + spinning ring + light shaft) appears; stand in it **alone** to bank
  control, an enemy inside **CONTESTS** it (nobody banks). The zone **relocates
  every 26 s**, so you constantly fight across the arena to re-take it. Bank
  60 s of control to win → a **HARDPOINT SECURED** results card showing your
  clear **time** vs your persistent best (`ilc.hardpoint.best`, lower is better)
  + a chunky +300 XP objective bonus. Infinitely replayable beat-your-best chase.
- **Reuses the Onslaught/Duel pattern, zero new AI.** The mode parks the base
  bots and runs a constant **4-bot pressure pool** (a replacement respawns ~3 s
  after each death, difficulty ramping with elapsed time). Bots hunt the player,
  so they naturally crowd whatever zone you're holding → real contest. Every bot
  death is an ordinary frag (XP / stats / killfeed / announcer all work); the
  player respawns through the normal solo loop (death never ends the run).
- **Safe placement.** Zone anchors derive from each map's FFA spawns (clear of
  solids) pulled toward centre + the arena centre, so a future map can't embed
  the hardpoint in geometry. New `modes/Hardpoint.ts`, `'koth'` GameMode, a
  state-coloured ticker (HOLD % · HOLDING/CONTESTED/MOVE · timer), a "ZONE MOVED"
  banner, a `⛳ Hardpoint` menu button (surfacing the best time), and a `koth`
  ad slot on the results card. Pure-client, no protocol change — solo + MP intact.

## Career achievements & medals (v0.36.0)

A persistent **rewards** layer on top of the lifetime stats — the "constant
desire to improve" pillar made explicit, and a steady stream of menu visits
(the ad-bearing screen).

- **24 medals** spanning kills (100 → 10,000), headshots, killstreaks, wins /
  matches, account level, per-weapon mastery (AR / Sniper / Railgun / knife /
  grenade), mode bests (Onslaught wave 10, Duel streak 5), and playtime — each
  with a rarity tier (bronze / silver / gold / elite), an emoji medal, a goal,
  and a bonus-XP reward.
- **`account/Achievements.ts`** holds the catalogue + an **`AchievementTracker`**
  that watches `account.onChange` and unlocks any medal whose metric crossed its
  goal, granting its XP and firing a flashy **"MEDAL UNLOCKED"** banner
  (`ui/AchievementToast.ts` — queued one-at-a-time, tier-coloured, top-level so it
  shows on the menu / post-match too) + the `level_up` sting. Re-entrancy-guarded
  so a reward that also crosses a level medal resolves both in one pass.
- **Migration-safe** `Account.unlockedAchievements` (generic id set + reward
  grant). First boot after the feature lands does a **silent** retroactive pass —
  veterans get medals they've already earned without toast spam.
- **Awards settings tab** (`ui/AchievementsUI.ts`) — every medal with a progress
  bar (earned highlighted + tier-glowing, locked dimmed with `current / goal`),
  an `earned / total · %` header, earned medals sorted to the top; re-renders
  live on unlock. Pure-client, no protocol change — solo + MP both intact.

## Project status

v0.38.0 — **deployed and live**, medal-exclusive cosmetics + Hardpoint (King of the Hill) + career achievements & medals on top of real 3D weapon models + two routine branches integrated. Movement, combat, 6 classes, **8 weapons** (incl. Marksman, LMG, **Railgun**), **6 maps** (Sandstone · Industrial · Cobalt · Overpass · **Frostline** · Practice), modes: solo FFA · online FFA · **Team Deathmatch** · **Gun Game** · **Aim Lab** · **Onslaught (wave survival)** · **Duel (1v1 gauntlet)** · Practice — plus **arena power-ups** (OVERCHARGE / RAPID FIRE / OVERSHIELD, solo), **daily login rewards**, **"ON FIRE" rampage**, **skill-shot callouts**, **weapon identity cards**, **kill banner**, a reconciled **post-match scorecard** (accolade + stat strip + NEW PERSONAL BEST), expanded cosmetics (8 kill effects · 10 tracers · 8 finishes); scoreboard + killstreaks + lifetime stats + daily challenges + AdSense + onboarding; directional damage + low-HP tension + death recap + announcer specials; rank ladder + weapon mastery/skins/finishes + server-authoritative per-weapon damage; minimap + speed lines + impact FX + health pickups + crosshair feedback + score popups; bot difficulty + callsigns + nameplates + quick melee + frag grenades. **Live**: site + game on Vercel, MP server on Fly.io, AdSense verified.

## Project deliverables

- `/client` — Vite + TS + Three.js game client. `~215 KB gzipped` (app ~85 KB). Single-player, Practice Range, online FFA, **Team Deathmatch**, **Gun Game**, **Aim Lab**, **Onslaught (survival)**, **Duel (1v1 gauntlet)**, **Hardpoint (King of the Hill)**, 6 maps, 8 weapons, **arena power-ups (×3)**, daily login rewards, ON FIRE rampage, skill-shot callouts, weapon identity cards, kill banner, post-match scorecard, scoreboard, killstreaks, rank ladder, profile/stats, weapon mastery + skins + finishes, expanded cosmetics, ads, directional damage, low-HP tension, death recap, tracer cosmetics, announcer specials, minimap, speed lines, impact FX, health pickups, crosshair feedback, score popups, bot difficulty + callsigns, enemy nameplates, quick melee, frag grenades, Railgun, **career achievements & medals**, **Hardpoint**, **medal-exclusive cosmetics**. **Live at <https://velocity-two-chi.vercel.app/play>.** v0.38.0 (app ~91 KB).
- `/server` — Node + Express + Socket.io. 32 Hz server-authoritative tick. Lag-comp hitscan. **Per-weapon damage/falloff** (incl. Railgun). Networked abilities + barriers. Authoritative match-end + class passives. Server-authoritative map pickups. Protocol v3. **Live on Fly.io at <https://ilcartigo-game.fly.dev>.** v0.38.0.
- `/website` — Static landing site at `ilcartigo.com`. Home + privacy + terms + about. AdSense `ca-pub-8134911671778438` live in `<head>` + `ads.txt`; verified, awaiting Google approval.

## What you'd want to do next (post-v1)

Things deliberately left for later:

- **Deploy** — finish the Fly.io (server) + Vercel (site/client) deploy. Config is written; needs account setup + a registered domain (see `PHASE_PLAN.md`).
- **Audio assets** — the full SFX pipeline is wired (weapons, hits, abilities, footsteps, jumps, killstreak stings, UI); drop CC0 `.wav`s into `client/public/assets/sounds/` per the catalog and they "just work."
- **Real account backend** (Supabase / Firebase) for cross-device progression + a real (server-validated) leaderboard.
- **TDM game mode** — team assignment, team spawns (maps already define `teamSpawns`), team scoring.
- **Matchmaking + multiple rooms** instead of one shared FFA.
- **Anti-cheat** beyond server authority (movement validation, fire rate caps).
- ✅ **Arena power-ups** (damage boost / haste) — DONE in v0.25.0 as a solo-only, weapon-layer system (`PowerupManager`), independent of the health-pickup wire model. Online support (server-authoritative buff pads) is a future protocol-touching item.
- **More cosmetics**: victory poses, more weapon skins/finishes.
- **Bot AI improvements**: per-map waypoints, stair climbing.

---

**License:** All asset names, class names, weapon names, and map names are original. No third-party assets shipped.
