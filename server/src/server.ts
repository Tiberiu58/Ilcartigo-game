/**
 * ILCARTIGO server entrypoint.
 *
 * Spins up:
 *   - Express HTTP server on DEFAULT_NET_PORT (3001).
 *   - Socket.io with permissive CORS (we're dev-only; production would
 *     restrict origin and put the server behind a reverse proxy).
 *   - One Room. All connections go to it.
 *
 * Run with `npm run dev` (tsx watch).
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Room } from './Room.js';
import { DEFAULT_NET_PORT, PROTOCOL_VERSION } from './Protocol.js';

const app = express();
const httpServer = createServer(app);

app.get('/', (_req, res) => {
  res.json({ service: 'ilcartigo-server', protocol: PROTOCOL_VERSION });
});

// CORS allowlist.
//   - Dev: accept any localhost/127.0.0.1 origin (Vite picks 5173 by default
//     but falls through to 5174, 5175... when it's already in use, and we want
//     multiple browser tabs against different ports to keep working).
//   - Production: accept the origin(s) listed in CLIENT_ORIGIN — a
//     comma-separated list of EXACT origins (scheme + host, no trailing slash,
//     no path), e.g. CLIENT_ORIGIN="https://ilcartigo-play.vercel.app" or
//     "https://ilcartigo.com,https://ilcartigo-play.vercel.app" during a
//     domain cutover. Unset in dev (only localhost is allowed then).
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (LOCAL_ORIGIN_RE.test(origin)) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS rejected: ' + origin));
    },
    credentials: true,
  },
});

// Map id is fixed for the lifetime of the server process. Set with
//   MAP=industrial npm run dev
// Defaults to sandstone. Switching maps mid-session would require an
// authoritative match-end + reload flow; out of scope for the MVP server.
const mapId = process.env.MAP || 'sandstone';
const room = new Room(io, mapId);
room.start();
console.log(`[net] room map: ${room.mapId}`);

io.on('connection', (socket) => {
  console.log(`[net] connect ${socket.id}`);
  room.onConnection(socket);
});

const port = Number(process.env.PORT) || DEFAULT_NET_PORT;
httpServer.listen(port, () => {
  console.log(`[net] listening on http://localhost:${port}  (protocol v${PROTOCOL_VERSION})`);
});
