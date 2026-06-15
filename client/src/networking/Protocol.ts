/**
 * Wire protocol — shared message types for client ↔ server.
 *
 * Versioning: clients on PROTOCOL_VERSION X cannot talk to a server on Y.
 * Mismatched versions are rejected with `err` on connect.
 *
 * Conventions:
 *   - All vectors are tuples [x, y, z] (numeric, not THREE.Vector3) for compact serialization.
 *   - Timestamps are server-wall-clock milliseconds since epoch (Date.now()).
 *   - Sequence numbers are monotonic uint32 per direction.
 *
 * This file is duplicated in /server/src/Protocol.ts — keep them in sync.
 * (We don't have a shared package, intentionally — keeps the build simple.)
 */

export const PROTOCOL_VERSION = 3;

/** Default WebSocket port. Match in server.ts and NetClient. */
export const DEFAULT_NET_PORT = 3001;

export type Vec3 = readonly [number, number, number];

// ── Client → Server ────────────────────────────────────────────────────────

/**
 * Per-frame input packet. Sent at ~60 Hz from client; server applies on its
 * 32 Hz tick (may consume multiple inputs per tick).
 *
 * `seq` is monotonic per-connection. The server echoes the most-recently-
 * applied seq back in each Snapshot so the client knows which inputs to
 * replay during reconciliation.
 */
export interface ClientInput {
  seq: number;
  /** Wall-clock ms at which the client sent the input. For lag-comp on shots. */
  t: number;
  /** Held movement axes: { fwd: -1|0|1, str: -1|0|1 } */
  fwd: number;
  str: number;
  /** Held action flags. */
  jump: boolean;
  crouch: boolean;
  /** Aim direction (yaw, pitch in radians). */
  yaw: number;
  pitch: number;
}

/** One-shot client→server messages (not part of the input stream). */
export interface ClientFireRequest {
  /** Sequence of the input this fire was attached to (for lag-comp rewind). */
  inputSeq: number;
  /** Weapon id snapshot (cheap; server cross-checks against its truth). */
  weaponId: string;
  /** Aim at fire time. */
  aim: Vec3;
  /** Eye position at fire time (informational; server uses authoritative pos). */
  origin: Vec3;
}

/**
 * Ability trigger request — client tells server it pressed E. Server may
 * reject (still on cooldown for example) — the authoritative answer comes
 * via the next Snapshot's ability state, or via the ServerAbilityCast that
 * the request would have produced. The client predicts the cast locally
 * either way (visuals fire immediately) — server reject just means the
 * cooldown timer on the HUD resets when the next snapshot arrives.
 *
 * Per-ability hint payloads: for Phantom Blink we send the aim direction so
 * the server can run the same raycast. For Vanguard Dash + Engineer Barrier
 * we send the flat-aim direction. Cloak/Surge/Pulse need no hint — they're
 * caster-only effects.
 */
export interface ClientAbilityRequest {
  inputSeq: number;
  /** Server cross-checks against the player's classId; we send it anyway so
   *  the server doesn't have to dereference state for the discriminator. */
  abilityId: string;
  /** Aim direction (normalized) at cast time, for ranged abilities. */
  aim?: Vec3;
}

export interface ClientWeaponSwap {
  slot: 0 | 1;
}

export interface ClientReload {}

/**
 * Client asks the server to start a fresh match (the "Play Again" button on
 * the post-match overlay). The server is authoritative: it resets every
 * player's kills/deaths, clears its match-over flag, respawns everyone, and
 * broadcasts ServerMatchReset to ALL clients so nobody is left looking at a
 * stale post-match screen while others play on. Any connected client may send
 * it; the server debounces (a reset while already fresh is a no-op).
 */
export interface ClientRequestRematch {}

/**
 * Sent by the client right after connect (in the onWelcome handler) and
 * again whenever the player changes class mid-session. Tells the server
 * which class+weapon this player is running so:
 *   - Server's `expected ability id` matches the request (otherwise
 *     ability triggers get silently rejected — exactly the bug Phase 7b
 *     shipped because we hardcoded Vanguard).
 *   - PlayerSnapshot.classId reflects reality so remote viewers can match
 *     class-color / cloak / etc.
 *
 * Authoritative: server can still reject (out-of-range strings, etc.); the
 * next Snapshot is the truth.
 */
export interface ClientHello {
  classId: string;
  primaryWeaponId: string;
  /** Optional cosmetic skin id (e.g. 'phantom-violet-veil'). Server stores it
   *  on the player record and echoes via PlayerSnapshot.skinId. */
  skinId?: string;
}

// ── Server → Client ────────────────────────────────────────────────────────

export interface PlayerSnapshot {
  id: string;
  /** Feet position. */
  pos: Vec3;
  /** Horizontal velocity (for client interpolation). */
  vel: Vec3;
  yaw: number;
  pitch: number;
  hp: number;
  classId: string;
  weaponId: string;
  /** Cosmetic skin id; optional (older clients may not send it). */
  skinId?: string;
  /** True if cloaked (Ghost). Remote clients render with low opacity. */
  cloaked: boolean;
  /** Score (kills) — broadcast for scoreboard. */
  kills: number;
}

/**
 * Full-state broadcast at server tick rate (32 Hz). Delta-encoding is a Phase
 * 7+ optimization; for the MVP we send the whole world every tick to keep
 * the client-side reconciliation logic trivial.
 */
export interface Snapshot {
  /** Server tick number. */
  tick: number;
  /** Server wall-clock ms when this snapshot was built. */
  t: number;
  /** Echoed: the highest input seq from the recipient that the server has applied. */
  ackSeq: number;
  players: PlayerSnapshot[];
}

/**
 * Broadcast on every player shot — drives client-side tracers + muzzle flashes
 * for *other* players (your own shots are handled locally before reaching the server).
 */
export interface ServerShotEvent {
  shooterId: string;
  weaponId: string;
  origin: Vec3;
  /** Direction vector (normalized). */
  dir: Vec3;
  /** Per-pellet hit list. Empty if the shot hit nothing. */
  hits: Array<{ point: Vec3; targetId: string | null; isHeadshot: boolean }>;
}

export interface ServerKillEvent {
  attackerId: string;
  targetId: string;
  weaponId: string;
  isHeadshot: boolean;
}

export interface ServerDamageEvent {
  attackerId: string;
  targetId: string;
  amount: number;
  isHeadshot: boolean;
  hitPoint: Vec3;
  weaponId: string;
}

/**
 * Broadcast on every confirmed ability cast. Per-ability payload via the
 * `payload` discriminated union — clients pattern-match on `abilityId` and
 * render the appropriate VFX on the caster's RemotePlayer (or skip if the
 * caster is themselves, since they've already played the effect locally).
 */
export type ServerAbilityCast =
  | { abilityId: 'blink';   casterId: string; from: Vec3; to: Vec3 }
  | { abilityId: 'surge';   casterId: string; duration: number }
  | { abilityId: 'dash';    casterId: string; from: Vec3; to: Vec3 }
  | { abilityId: 'cloak';   casterId: string; active: boolean; duration: number }
  | { abilityId: 'barrier'; casterId: string; solidId: number; center: Vec3; size: Vec3 }
  | { abilityId: 'pulse';   casterId: string; origin: Vec3 };

/**
 * Networked temporary collision solid (currently: Engineer Barrier panels).
 * Broadcast on creation; matched by `solidId` for the corresponding
 * ServerRemoveSolid on expiry.
 */
export interface ServerAddSolid {
  solidId: number;
  center: Vec3;
  size: Vec3;
  /** Which client owns it (only matters for cosmetics — server is authoritative). */
  ownerId: string;
  /** Wall-clock ms when the server plans to remove it. */
  expiresAt: number;
}

export interface ServerRemoveSolid {
  solidId: number;
}

/**
 * Sent once on successful join. Tells the client who they are, what map is
 * loaded, and the initial state of the room.
 */
export interface ServerWelcome {
  protocolVersion: number;
  yourId: string;
  mapId: string;
  serverTick: number;
  tickHz: number;
  players: PlayerSnapshot[];
  /** Initial map-pickup states so late joiners know which are currently gone.
   *  Optional for forward-compat with older servers. */
  pickups?: PickupState[];
}

/** One map pickup's availability. `id` matches PickupDef.id for the room's map. */
export interface PickupState {
  id: number;
  available: boolean;
}

/**
 * Broadcast when a pickup is grabbed (available=false, `byId` = grabber) or
 * respawns (available=true). The heal itself is applied server-side to the
 * grabber's authoritative HP and shows up in the next Snapshot; `byId` lets the
 * grabbing client play local heal feedback (SFX / green flash).
 */
export interface ServerPickupUpdate {
  id: number;
  available: boolean;
  byId?: string;
}

/**
 * Broadcast to ALL clients the moment a player reaches the match kill goal.
 * This is the AUTHORITATIVE match end — clients must not decide this on their
 * own from locally-counted kills (they can disagree if they joined late or
 * dropped a Kill event). The server counts; the server declares the winner.
 *
 * `standings` is every player sorted by kills (desc), so the post-match
 * scoreboard is identical on every client regardless of which Kill/Damage
 * events each happened to observe.
 */
export interface ServerMatchOver {
  winnerId: string;
  standings: Array<{ id: string; kills: number; deaths: number }>;
}

/**
 * Broadcast to ALL clients when the server starts a fresh match (in response
 * to a ClientRequestRematch). Every client should dismiss its post-match
 * overlay and resume play; local match tallies reset to mirror the server.
 */
export interface ServerMatchReset {}

/** Sent to all other clients when a new player joins (after Welcome to the joiner). */
export interface ServerPlayerJoined {
  player: PlayerSnapshot;
}

export interface ServerPlayerLeft {
  id: string;
}

/** Used for protocol mismatch, room full, etc. */
export interface ServerError {
  code: 'version_mismatch' | 'room_full' | 'kicked';
  message: string;
}

// ── Socket.io event names ──────────────────────────────────────────────────
// Strings are deliberately short to keep packet overhead low.

export const EV = {
  // c2s
  Hello:        'h',
  Input:        'i',
  Fire:         'f',
  Ability:      'a',
  Swap:         's',
  Reload:       'r',
  Rematch:      'm',
  // s2c
  Welcome:      'w',
  Snapshot:     'S',
  Shot:         'F',
  Kill:         'K',
  Damage:       'D',
  AbilityCast:  'A',
  AddSolid:     '+',
  RemoveSolid:  '-',
  Join:         'J',
  Left:         'L',
  Err:          'e',
  MatchOver:    'M',
  MatchReset:   'R',
  Pickup:       'P',
} as const;
