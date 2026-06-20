# ILCARTIGO — Deployment runbook

Three independently-deployed pieces:

| Piece | Host | What it serves | Live? |
| --- | --- | --- | --- |
| `/website` + `/client` | **Vercel** (one project) | Marketing site at `/`, game at `/play/` | Deployed this round |
| `/server` | **Fly.io** | Multiplayer FFA room (WebSocket, 32 Hz) | **You run the steps below** |

Single-player, Gun Game, Aim Lab, and the whole site work **without** the
server. The server is only needed for **Play Online (FFA)**.

---

## Part 1 — Website + game client (Vercel)  ✅ wired

A single Vercel project builds both via `build-static.sh` → `public/`:
`public/` (site) + `public/play/` (game, built with `base=/play/`).

Config lives in `vercel.json` (repo root). To deploy:

```powershell
cd C:\Users\georg\velocity
npx vercel login          # one-time, interactive (browser)
npx vercel deploy --prod --yes
```

Output is a live URL like `https://ilcartigo.vercel.app`. Verify:
- `/` → marketing site
- `/play/` → the game (single-player works immediately)
- `/ads.txt` → 200 (comment-only until AdSense activation)

### Point the client at the live MP server (build-time)

The client reads the server URL from the **`VITE_SERVER_URL`** build-time env
var (Vite inlines it). Set it in the Vercel project so online play targets Fly:

```powershell
npx vercel env add VITE_SERVER_URL production
#   value: https://ilcartigo-server.fly.dev   (your Fly app URL from Part 2)
npx vercel deploy --prod --yes                  # rebuild so the value bakes in
```

Without this var the client falls back to `http://<page-host>:3001`, which only
works in local dev. **You must redeploy after setting it** — it's compile-time,
not runtime.

---

## Part 2 — Multiplayer server (Fly.io)  ▶ run these

Config already in `server/`: `Dockerfile` (runs `tsx` directly, no compile),
`fly.toml` (single always-on stateful machine — never auto-stop, never scale
>1, because the room is in-memory), `.dockerignore`.

### One-time setup

```powershell
# 1. Install flyctl (PowerShell):
iwr https://fly.io/install.ps1 -useb | iex

# 2. Sign in / sign up (free Hobby plan is enough for one small machine):
fly auth login

# 3. From the SERVER directory, create the app (matches fly.toml's app name):
cd C:\Users\georg\velocity\server
fly apps create ilcartigo-server      # skip if the name's taken — see note
```

> **App-name note:** `fly.toml` says `app = "ilcartigo-server"`. If that global
> name is taken, pick another (e.g. `ilcartigo-mp-<you>`) and change the `app`
> line in `fly.toml` to match before deploying. Your server URL becomes
> `https://<app-name>.fly.dev`.

### Deploy

```powershell
cd C:\Users\georg\velocity\server
fly deploy
```

First deploy builds the Docker image and boots one machine in `iad`
(US-East — change `primary_region` in `fly.toml` to the region nearest your
players: `lhr` London, `fra` Frankfurt, `syd` Sydney, etc.).

### Lock CORS to your Vercel origin

The server only accepts WebSocket origins in `CLIENT_ORIGIN` (plus localhost).
Set it to your Vercel URL (exact origin — scheme + host, **no trailing slash**):

```powershell
fly secrets set CLIENT_ORIGIN="https://ilcartigo.vercel.app"
#   during a domain cutover you can list both, comma-separated:
#   fly secrets set CLIENT_ORIGIN="https://ilcartigo.com,https://ilcartigo.vercel.app"
```

`fly secrets set` restarts the machine automatically. (Optional: `fly secrets
set MAP=industrial` to switch the map; default is sandstone.)

### Verify

```powershell
fly status                                   # 1 machine, started, healthy
curl https://ilcartigo-server.fly.dev/       # {"service":"ilcartigo-server","protocol":3}
fly logs                                      # watch connections live
```

Then in the browser: open the Vercel `/play/` URL in two tabs → **Play Online
(FFA)** in each → you should see each other move. If the connection fails, check
`fly logs` for `CORS rejected: <origin>` and make `CLIENT_ORIGIN` match exactly.

---

## Cutover to ilcartigo.com (when the domain is registered)

1. **Vercel:** Project → Domains → add `ilcartigo.com` + `www`; set the DNS
   records Vercel shows at your registrar. (The site's canonical URLs already
   point at `ilcartigo.com`, so no code change needed.)
2. **Fly CORS:** `fly secrets set CLIENT_ORIGIN="https://ilcartigo.com"`.
3. Optionally map the server to `mp.ilcartigo.com` (`fly certs add
   mp.ilcartigo.com` + a CNAME) and set `VITE_SERVER_URL` to it, then redeploy
   the Vercel client.

---

## Rollback / ops cheatsheet

| Need | Command |
| --- | --- |
| Server logs | `fly logs` |
| Restart room | `fly apps restart ilcartigo-server` |
| Roll back server | `fly releases` then `fly deploy --image <prev>` |
| Scale check (must stay 1) | `fly scale show` → count should be 1 |
| Vercel rollback | `npx vercel rollback <deployment-url>` |
| Vercel prod logs | `npx vercel logs <deployment-url>` |
