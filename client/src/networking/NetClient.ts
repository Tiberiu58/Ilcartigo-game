/**
 * NetClient — thin Socket.io wrapper for MP gameplay.
 *
 * Owns:
 *   - The socket connection itself (open / close / reconnect not auto)
 *   - Outgoing input-sequence counter
 *   - Typed `on*` handlers for incoming server messages
 *
 * Does NOT do:
 *   - Prediction or interpolation. That's MultiplayerSession's job — NetClient
 *     is a pure transport.
 *   - State sync. We never store snapshots here; we forward them as events.
 */

import { io, type Socket } from 'socket.io-client';
import {
  EV, DEFAULT_NET_PORT,
  type ClientInput, type ClientFireRequest, type ClientAbilityRequest, type ClientHello,
  type Snapshot, type ServerWelcome, type ServerShotEvent, type ServerKillEvent,
  type ServerDamageEvent, type ServerPlayerJoined, type ServerPlayerLeft, type ServerError,
  type ServerAbilityCast, type ServerAddSolid, type ServerRemoveSolid,
  type ServerMatchOver, type ServerMatchReset, type ServerPickupUpdate,
} from './Protocol';

export interface NetClientCallbacks {
  onWelcome?: (msg: ServerWelcome) => void;
  onSnapshot?: (msg: Snapshot) => void;
  onShot?: (msg: ServerShotEvent) => void;
  onKill?: (msg: ServerKillEvent) => void;
  onDamage?: (msg: ServerDamageEvent) => void;
  onAbilityCast?: (msg: ServerAbilityCast) => void;
  onAddSolid?: (msg: ServerAddSolid) => void;
  onRemoveSolid?: (msg: ServerRemoveSolid) => void;
  onJoin?: (msg: ServerPlayerJoined) => void;
  onLeave?: (msg: ServerPlayerLeft) => void;
  onError?: (msg: ServerError) => void;
  onDisconnect?: (reason: string) => void;
  onMatchOver?: (msg: ServerMatchOver) => void;
  onMatchReset?: (msg: ServerMatchReset) => void;
  onPickup?: (msg: ServerPickupUpdate) => void;
}

export class NetClient {
  private socket: Socket | null = null;
  private nextSeq = 1;
  private cbs: NetClientCallbacks = {};

  /**
   * Connect to ws://host:port.
   *
   * Default resolution order:
   *   1. `VITE_SERVER_URL` build-time env var — set this for production
   *      (e.g. https://ilcartigo-server.fly.dev). Vite inlines it at build.
   *   2. Same hostname as the page on DEFAULT_NET_PORT — the local-dev path
   *      (http://localhost:3001). Used whenever the env var is unset.
   */
  connect(
    host = import.meta.env.VITE_SERVER_URL
      || `http://${window.location.hostname}:${DEFAULT_NET_PORT}`,
    cbs: NetClientCallbacks = {},
  ) {
    this.cbs = cbs;
    this.nextSeq = 1;
    this.socket = io(host, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on(EV.Welcome,     (m: ServerWelcome)        => this.cbs.onWelcome?.(m));
    this.socket.on(EV.Snapshot,    (m: Snapshot)             => this.cbs.onSnapshot?.(m));
    this.socket.on(EV.Shot,        (m: ServerShotEvent)      => this.cbs.onShot?.(m));
    this.socket.on(EV.Kill,        (m: ServerKillEvent)      => this.cbs.onKill?.(m));
    this.socket.on(EV.Damage,      (m: ServerDamageEvent)    => this.cbs.onDamage?.(m));
    this.socket.on(EV.AbilityCast, (m: ServerAbilityCast)    => this.cbs.onAbilityCast?.(m));
    this.socket.on(EV.AddSolid,    (m: ServerAddSolid)       => this.cbs.onAddSolid?.(m));
    this.socket.on(EV.RemoveSolid, (m: ServerRemoveSolid)    => this.cbs.onRemoveSolid?.(m));
    this.socket.on(EV.Join,        (m: ServerPlayerJoined)   => this.cbs.onJoin?.(m));
    this.socket.on(EV.Left,        (m: ServerPlayerLeft)     => this.cbs.onLeave?.(m));
    this.socket.on(EV.Err,         (m: ServerError)          => this.cbs.onError?.(m));
    this.socket.on(EV.MatchOver,   (m: ServerMatchOver)      => this.cbs.onMatchOver?.(m));
    this.socket.on(EV.MatchReset,  (m: ServerMatchReset)     => this.cbs.onMatchReset?.(m));
    this.socket.on(EV.Pickup,      (m: ServerPickupUpdate)   => this.cbs.onPickup?.(m));
    this.socket.on('disconnect',   (r: string)               => this.cbs.onDisconnect?.(r));
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Send the next input packet. Returns the seq we assigned (for prediction buffer). */
  sendInput(input: Omit<ClientInput, 'seq'>): number {
    if (!this.socket) return -1;
    const seq = this.nextSeq++;
    const msg: ClientInput = { ...input, seq };
    this.socket.emit(EV.Input, msg);
    return seq;
  }

  sendFire(req: ClientFireRequest) {
    this.socket?.emit(EV.Fire, req);
  }

  sendAbility(req: ClientAbilityRequest) {
    this.socket?.emit(EV.Ability, req);
  }

  sendHello(req: ClientHello) {
    this.socket?.emit(EV.Hello, req);
  }

  /** Ask the server to start a fresh match (Play Again). */
  sendRematch() {
    this.socket?.emit(EV.Rematch);
  }
}
