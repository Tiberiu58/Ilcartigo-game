# Facility Zero

A lightweight Babylon.js first-person shooter prototype focused on movement, hitscan gunplay, and simple expandable systems.

## Run

Start the multiplayer server in one terminal:

```bash
npm install
npm run server
```

In a second terminal, serve the folder with a small local web server, then open the shown URL in one or more browser tabs.

```bash
py -m http.server 8000
```

Open `http://localhost:8000`.

## Controls

- `WASD`: move
- Mouse: look
- `Shift`: sprint
- `Space`: jump
- Left click: fire
- `R`: reload
- `Esc`: release pointer lock

## Multiplayer

- `Play`: start the existing single-player run
- `Lobby`: open the multiplayer room flow
- `Create Room`: create a lightweight PvP room on the Node/WebSocket server
- `Join Room`: join an existing room code

Current multiplayer scope:

- authoritative player positions
- authoritative shooting, damage, death, respawn
- authoritative teleport placement/use
- simple remote player placeholders
- single-player enemies remain offline only

## Project Layout

- `index.html`: page shell and HUD
- `style.css`: interface styling
- `game.js`: entry module
- `app.js`: engine bootstrap and game loop
- `level.js`: map layout, lightweight materials, collision, line of sight
- `player.js`: first-person controller and health
- `weapon.js`: hitscan rifle, recoil, reload, muzzle flash
- `enemies.js`: patrol and chase bots
- `client/`: browser networking session and remote player rendering
- `server/`: Node.js WebSocket room/match server
- `shared/`: protocol, collision, and simulation helpers used by both sides
- `input.js`, `ui.js`, `config.js`, `utils.js`: shared support modules
