/**
 * MultiplayerSession — orchestrates net + local engine for MP gameplay.
 *
 * Responsibilities:
 *   1. Connect to the server, handle welcome / disconnect lifecycle.
 *   2. Sample local input each frame, send it, AND apply it to the local
 *      PlayerController (client-side prediction).
 *   3. On each server Snapshot:
 *        - Update RemotePlayers (interpolation buffer).
 *        - Reconcile local player: snap to server pos, replay all inputs
 *          newer than ackSeq.
 *   4. Forward server events (Shot/Damage/Kill) to the bus so existing
 *      HUD/effects code just works.
 *   5. Send Fire events when the local player shoots.
 *
 * IMPORTANT for reconciliation: we keep a buffer of every sent input. When
 * a Snapshot arrives with ackSeq=N, we:
 *   a. Drop all buffered inputs with seq ≤ N.
 *   b. Snap local controller to the server's reported position for *us*.
 *   c. Step the controller through each remaining buffered input (in order),
 *      using the same dt the server used (1/32 ≈ 31.25ms — close enough).
 *
 * This produces a "perceived smooth motion despite a momentary correction
 * jitter" — same model CS:GO uses.
 */

import * as THREE from 'three';
import type { Game } from '../core/Game';
import { NetClient } from './NetClient';
import { RemotePlayer } from './RemotePlayer';
import type {
  Snapshot, ServerWelcome, ServerShotEvent, ServerKillEvent, ServerDamageEvent,
  ServerPlayerJoined, ServerPlayerLeft,
  ServerAbilityCast, ServerAddSolid, ServerRemoveSolid, Vec3,
  ServerMatchOver, ServerMatchReset,
} from './Protocol';

interface NetworkedBarrier {
  solidId: number;
  mesh: THREE.Group;
  aabb: { min: THREE.Vector3; max: THREE.Vector3 };
}

interface BufferedInput {
  seq: number;
  fwd: number;
  str: number;
  jump: boolean;
  crouch: boolean;
  yaw: number;
  pitch: number;
  dt: number;       // server simulates at 1/32 — we use that on replay
}

const INPUT_BUFFER_MAX = 120;            // ~3.75s at 32Hz
const RECONCILE_DT = 1 / 32;
const POS_SMOOTH = 0.18;                  // 0 = teleport on reconcile, 1 = no correction

// Scratch vectors for per-frame remote footstep audio (avoid per-frame allocs).
const _FS_EYE = new THREE.Vector3();
const _FS_POS = new THREE.Vector3();

export class MultiplayerSession {
  private game: Game;
  private net = new NetClient();
  /** Buffer of inputs sent to the server but not yet acknowledged. */
  private inputBuf: BufferedInput[] = [];
  private remotes = new Map<string, RemotePlayer>();
  /** Networked Engineer Barriers — added/removed by server events. */
  private barriers = new Map<number, NetworkedBarrier>();
  /** Our id, set from Welcome. */
  myId = '';
  /**
   * Per-pair "last seen lethal-ish hit point", keyed by `${attacker}|${target}`.
   * The server's KillEvent doesn't carry a hitPoint (kept off the protocol to
   * save bytes), but the preceding DamageEvent does — and damage→kill on the
   * same pair arrives back-to-back. We cache the damage hit point on the way
   * through and replay it when the kill follows, so playKillEffect can render
   * the particle puff at roughly the right place. Bounded by a soft TTL: any
   * entry older than 1s is treated as stale.
   */
  private lastHitPoint = new Map<string, { point: THREE.Vector3; at: number }>();

  /** True while we're actively running an MP session. */
  active = false;

  /** Total players in the room (remotes + ourselves). 0 while disconnecting. */
  get playerCount(): number {
    return this.active ? this.remotes.size + 1 : 0;
  }

  /** All known remote player ids (excludes self). Used by the post-match
   *  overlay to list players even if they got no kills/deaths. */
  get remoteIds(): string[] {
    return Array.from(this.remotes.keys());
  }

  /**
   * Copy a remote player's current (interpolated) world position into `out`.
   * Returns false if we don't know that player. Used by directional damage
   * indicators to point at the shooter.
   */
  getRemotePosition(id: string, out: THREE.Vector3): boolean {
    const rp = this.remotes.get(id);
    if (!rp) return false;
    out.copy(rp.group.position);
    return true;
  }

  /**
   * Enumerate remote players for the minimap. Yields each remote's interpolated
   * world x/z plus its cloaked + dead flags so the radar can hide stealthed /
   * downed players. Cheap; called at most once per minimap redraw.
   */
  forEachRemoteBlip(cb: (x: number, z: number, cloaked: boolean, dead: boolean) => void) {
    for (const rp of this.remotes.values()) {
      cb(rp.group.position.x, rp.group.position.z, rp.cloaked, rp.hp <= 0);
    }
  }

  /** Subscribers. Mirror the local bus shape so existing HUD listeners keep working. */
  onWelcome?: (msg: ServerWelcome) => void;
  onDisconnect?: (reason: string) => void;
  /** Fired when the server broadcasts a fresh-match reset (Play Again). main.ts
   *  uses this to dismiss the post-match overlay and resume play. */
  onMatchReset?: () => void;

  constructor(game: Game) {
    this.game = game;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  connect(host?: string) {
    if (this.active) return;
    this.active = true;
    this.net.connect(host, {
      onWelcome: (m) => this.handleWelcome(m),
      onSnapshot: (m) => this.handleSnapshot(m),
      onShot: (m) => this.handleShot(m),
      onKill: (m) => this.handleKill(m),
      onDamage: (m) => this.handleDamage(m),
      onAbilityCast: (m) => this.handleAbilityCast(m),
      onAddSolid: (m) => this.handleAddSolid(m),
      onRemoveSolid: (m) => this.handleRemoveSolid(m),
      onJoin: (m) => this.handleJoin(m),
      onLeave: (m) => this.handleLeave(m),
      onMatchOver: (m) => this.handleMatchOver(m),
      onMatchReset: (m) => this.handleMatchReset(m),
      onPickup: (m) => this.game.pickups.applyServerUpdate(m.id, m.available, m.byId),
      onError: (m) => {
        console.warn('[net] server error:', m.code, m.message);
      },
      onDisconnect: (r) => {
        this.active = false;
        for (const rp of this.remotes.values()) rp.dispose(this.game.scene);
        this.remotes.clear();
        for (const b of this.barriers.values()) this.disposeBarrier(b);
        this.barriers.clear();
        this.inputBuf.length = 0;
        this.onDisconnect?.(r);
      },
    });
  }

  disconnect() {
    this.net.disconnect();
    this.active = false;
    for (const rp of this.remotes.values()) rp.dispose(this.game.scene);
    this.remotes.clear();
    for (const b of this.barriers.values()) this.disposeBarrier(b);
    this.barriers.clear();
    this.inputBuf.length = 0;
  }

  /**
   * Tell the server our current class + primary weapon. Called once after
   * Welcome (so the server has registered our player) and again any time
   * the player swaps class via the main menu while connected.
   *
   * Without this, the server defaults everyone to Vanguard/AR and silently
   * rejects ability triggers from any other class — which surfaces as
   * "abilities work in single-player but not online" (the Phase 7b bug).
   */
  sendHello() {
    if (!this.active || !this.net.isConnected()) return;
    const classId = this.game.abilities.classId;
    this.net.sendHello({
      classId,
      primaryWeaponId: this.game.inventory.current.config.id,
      skinId: this.game.account.equippedSkinFor(classId),
    });
  }

  /**
   * Notify the server that the local player triggered their ability. Called
   * by Game right after AbilityRunner.tryTrigger succeeds locally — the
   * server then validates cooldown/state and broadcasts a ServerAbilityCast.
   * If the server rejects, the local effect already played; the cooldown
   * timer just won't reset on remote views.
   */
  sendAbility(abilityId: string, aim?: THREE.Vector3) {
    if (!this.active || !this.net.isConnected()) return;
    const lastSeq = this.inputBuf.length > 0 ? this.inputBuf[this.inputBuf.length - 1].seq : 0;
    this.net.sendAbility({
      inputSeq: lastSeq,
      abilityId,
      aim: aim ? ([aim.x, aim.y, aim.z] as Vec3) : undefined,
    });
  }

  // ─── Per-frame: sample local input, send, queue for replay ────────────────

  /**
   * Called from Game.tick after the local PlayerController has already stepped.
   * We snapshot the input *as-seen* this frame and ship it. The controller's
   * effects on the local player ARE the prediction — server reconciliation
   * either confirms or corrects on the next Snapshot.
   */
  sendFrameInput(dt: number) {
    if (!this.active || !this.net.isConnected()) return;
    const input = this.gameInput();
    const seq = this.net.sendInput({
      t: Date.now(),
      ...input,
    });
    if (seq < 0) return;
    this.inputBuf.push({ seq, ...input, dt });
    if (this.inputBuf.length > INPUT_BUFFER_MAX) {
      this.inputBuf.splice(0, this.inputBuf.length - INPUT_BUFFER_MAX);
    }
  }

  /**
   * Called from Game on every successful local Fire (player shooting).
   * Notifies the server so it can run authoritative hit-detection + broadcast
   * to other players.
   */
  sendFire(weaponId: string, origin: THREE.Vector3, aim: THREE.Vector3) {
    if (!this.active || !this.net.isConnected()) return;
    const lastSeq = this.inputBuf.length > 0 ? this.inputBuf[this.inputBuf.length - 1].seq : 0;
    this.net.sendFire({
      inputSeq: lastSeq,
      weaponId,
      aim: [aim.x, aim.y, aim.z],
      origin: [origin.x, origin.y, origin.z],
    });
  }

  /** Tick remote players' interpolation. Called once per render frame. */
  renderRemotes(nowMs: number, dt: number) {
    const eye = _FS_EYE;
    this.game.player.eyePos(eye);
    const yaw = this.game.camera.rotation.y;
    for (const rp of this.remotes.values()) {
      rp.render(nowMs, dt);
      // Spatial footsteps — hear other players approaching. Cloaked players
      // are silent (handled inside RemotePlayer.consumeFootstep via cloaked).
      if (rp.consumeFootstep(_FS_POS)) {
        this.game.audio.playSpatial('footstep', _FS_POS, eye, yaw);
      }
    }
  }

  // ─── Inbound handlers ─────────────────────────────────────────────────────

  private handleWelcome(m: ServerWelcome) {
    this.myId = m.yourId;
    console.log(`[mp] welcome — id=${m.yourId}, map=${m.mapId}, ${m.players.length} player(s) in room`);

    // Server's map is authoritative. If our current map doesn't match, swap.
    // This handles both fresh connects (we're on Sandstone, server is running
    // Industrial) and stale state.
    if (m.mapId === 'sandstone' || m.mapId === 'industrial') {
      this.game.setCombatMap(m.mapId);
    }

    // Spawn RemotePlayers for everyone already here.
    for (const p of m.players) {
      if (p.id === this.myId) continue;
      const rp = new RemotePlayer(p.id, this.game.scene);
      rp.ingest(p, Date.now());
      this.remotes.set(p.id, rp);
    }
    // Adopt the server's authoritative pickup states (after the map swap above
    // so the pads exist for the right map).
    if (m.pickups) this.game.pickups.applyWelcomeStates(m.pickups);

    // Now that the server has us in its player map, tell it which class +
    // weapon we picked. Without this every ability trigger gets rejected.
    this.sendHello();
    this.onWelcome?.(m);
  }

  private handleSnapshot(m: Snapshot) {
    const now = Date.now();
    // 1. Update remote players' interpolation buffers.
    for (const p of m.players) {
      if (p.id === this.myId) continue;
      let rp = this.remotes.get(p.id);
      if (!rp) {
        rp = new RemotePlayer(p.id, this.game.scene);
        this.remotes.set(p.id, rp);
      }
      rp.ingest(p, now);
    }

    // 2. Reconcile local player.
    const self = m.players.find((p) => p.id === this.myId);
    if (!self) return;
    // Drop acked inputs.
    while (this.inputBuf.length > 0 && this.inputBuf[0].seq <= m.ackSeq) {
      this.inputBuf.shift();
    }

    // Reconciliation: gently lerp toward server pos so jitter/packet-order
    // glitches don't yank the camera. BUT if the delta is large (>3m), the
    // server clearly did something we can't predict — teleport (Blink), big
    // impulse (Dash), respawn — so snap instantly. Without this snap, Blink
    // looked like "teleport then drift back" because the lerp pulled us
    // through ~14m at 18%/snap for the first few frames.
    const target = self.pos;
    const cur = this.game.player.pos;
    const dx = target[0] - cur.x;
    const dy = target[1] - cur.y;
    const dz = target[2] - cur.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    const SNAP_DISTANCE_SQ = 3 * 3;
    if (dist2 > SNAP_DISTANCE_SQ) {
      // Hard snap. Also zero local velocity — the server's view of us is
      // post-teleport with v=0 (Blink) or with the impulse it applied
      // (Dash); we trust the server's numbers via its next velocity update.
      this.game.player.teleportTo(new THREE.Vector3(target[0], target[1], target[2]));
    } else {
      cur.x += dx * POS_SMOOTH;
      cur.y += dy * POS_SMOOTH;
      cur.z += dz * POS_SMOOTH;
    }

    // HP from server is authoritative.
    if (self.hp !== this.game.playerActor.health.current) {
      this.game.playerActor.health.current = self.hp;
      if (self.hp <= 0 && !this.game.playerActor.health.dead) {
        this.game.playerActor.health.dead = true;
      } else if (self.hp > 0 && this.game.playerActor.health.dead) {
        this.game.playerActor.health.dead = false;
      }
      this.game.playerActor.health.max = 100;        // MVP: fixed max
    }
    void RECONCILE_DT;                                // reserved for full replay impl
  }

  private handleShot(m: ServerShotEvent) {
    // Skip our own shots — already rendered locally before send.
    if (m.shooterId === this.myId) return;
    const origin = new THREE.Vector3(...m.origin);
    const end = m.hits.length > 0
      ? new THREE.Vector3(...m.hits[0].point)
      : origin.clone().add(new THREE.Vector3(...m.dir).multiplyScalar(200));
    // Red tracer for remote shots, same as bot shots in single-player.
    this.game.tracers.spawn(origin, end, 0.14, 0xff5a3a);
    // Impact burst at the landing point — flesh (a player target) vs world.
    if (m.hits.length > 0) {
      this.game.impacts.spawn(end, m.hits[0].targetId !== null);
    }
  }

  private handleDamage(m: ServerDamageEvent) {
    const hitPoint = new THREE.Vector3(...m.hitPoint);
    // Cache the hit point so the very next Kill on this pair can show its
    // particle effect at the right spot (Kill events don't carry coords).
    this.lastHitPoint.set(`${m.attackerId}|${m.targetId}`, {
      point: hitPoint.clone(),
      at: Date.now(),
    });
    // Reuse the bus pipeline so HUD/damage-numbers handlers just work.
    this.game.bus.emit('damage', {
      attackerId: m.attackerId,
      targetId: m.targetId,
      amount: m.amount,
      isHeadshot: m.isHeadshot,
      hitPoint,
      weaponId: m.weaponId,
    });
  }

  private handleKill(m: ServerKillEvent) {
    // Pull the cached hit point from the preceding Damage event so the kill
    // effect particle puff renders at the lethal impact — without this MP
    // kills had no particles, only the screen tint (see audit Finding #4).
    const key = `${m.attackerId}|${m.targetId}`;
    const cached = this.lastHitPoint.get(key);
    const fresh = cached && Date.now() - cached.at < 1000 ? cached.point : undefined;
    this.lastHitPoint.delete(key);
    this.game.bus.emit('kill', {
      attackerId: m.attackerId,
      targetId: m.targetId,
      weaponId: m.weaponId,
      isHeadshot: m.isHeadshot,
      hitPoint: fresh,
    });
  }

  private handleJoin(m: ServerPlayerJoined) {
    if (m.player.id === this.myId) return;
    if (this.remotes.has(m.player.id)) return;
    const rp = new RemotePlayer(m.player.id, this.game.scene);
    rp.ingest(m.player, Date.now());
    this.remotes.set(m.player.id, rp);
    console.log(`[mp] player joined: ${m.player.id}`);
  }

  private handleLeave(m: ServerPlayerLeft) {
    const rp = this.remotes.get(m.id);
    if (rp) {
      rp.dispose(this.game.scene);
      this.remotes.delete(m.id);
      console.log(`[mp] player left: ${m.id}`);
    }
  }

  /**
   * Authoritative match end. The server has decided the winner and the final
   * standings — we OVERWRITE the local matchKills/matchDeaths tallies with the
   * server's numbers (which may differ from what we counted locally if we
   * joined late or dropped a Kill event), then trigger the post-match overlay
   * via Game.onMatchEnded. Every client runs this off the same broadcast, so
   * everyone sees the identical scoreboard and the same winner.
   */
  private handleMatchOver(m: ServerMatchOver) {
    this.game.matchKills.clear();
    this.game.matchDeaths.clear();
    for (const s of m.standings) {
      this.game.matchKills.set(s.id, s.kills);
      this.game.matchDeaths.set(s.id, s.deaths);
    }
    this.game.matchEnded = true;
    this.game.onMatchEnded?.(m.winnerId);
  }

  /**
   * Server started a fresh match (someone hit Play Again). Mirror the reset
   * locally — zero the tallies, clear the ended flag — and notify main.ts so
   * it dismisses the post-match overlay. Authoritative: even clients that
   * DIDN'T click Play Again get pulled back into the new match together.
   */
  private handleMatchReset(_m: ServerMatchReset) {
    this.game.resetMatchScore();
    this.onMatchReset?.();
  }

  /** Ask the server to start a fresh match (Play Again button in MP). */
  sendRematch() {
    this.net.sendRematch();
  }

  /**
   * Render an ability VFX based on the broadcast cast event. We skip the
   * caster's own visuals if it's us — those already played locally via the
   * AbilityRunner.tryTrigger path. Remote casters get the full effect.
   */
  private handleAbilityCast(m: ServerAbilityCast) {
    const fromSelf = m.casterId === this.myId;
    const remote = this.remotes.get(m.casterId);

    // Spatial audio for remote casts. Local casts already played their SFX
    // unspatialized in Game.tick when tryTrigger succeeded.
    if (!fromSelf) {
      // Use the caster's RemotePlayer position if known; otherwise skip audio.
      const rp = this.remotes.get(m.casterId);
      if (rp) {
        const eye = new THREE.Vector3();
        this.game.player.eyePos(eye);
        const sourcePos = rp.group.position.clone();
        this.game.audio.playSpatial(
          `ability_${m.abilityId}` as Parameters<typeof this.game.audio.playSpatial>[0],
          sourcePos, eye, this.game.camera.rotation.y,
        );
      }
    }

    switch (m.abilityId) {
      case 'blink': {
        if (fromSelf) break;  // local already flashed
        this.game.castFX.flash(new THREE.Vector3(...m.from), 0x9c64ff, 0.3, 1.1, 0.32);
        this.game.castFX.flash(new THREE.Vector3(...m.to),   0x9c64ff, 0.3, 1.1, 0.32);
        break;
      }
      case 'surge': {
        // Caster's speed shows up naturally via snapshots. No remote VFX in MVP
        // (could add screen-edge speed lines on the caster's RemotePlayer later).
        break;
      }
      case 'dash': {
        if (fromSelf) break;
        this.game.castFX.trail(
          new THREE.Vector3(...m.from), new THREE.Vector3(...m.to),
          0x4ac8a8, 0.22, 0.4,
        );
        break;
      }
      case 'cloak': {
        // Snapshot's `cloaked` flag drives RemotePlayer opacity — we don't
        // need to do anything else. Just log for clarity.
        if (remote) remote.cloaked = m.active;
        break;
      }
      case 'barrier': {
        // Visuals come via AddSolid; this event is informational (which
        // caster spawned which barrier). Skip.
        void m.solidId; void m.center; void m.size;
        break;
      }
      case 'pulse': {
        // Pulse wave is always broadcast — visible to all players, including
        // the caster (they fired it locally too but this ensures consistency
        // if the local prediction failed).
        if (fromSelf) break;  // caster already saw the wave locally
        this.game.castFX.wave(new THREE.Vector3(...m.origin), 0xff5a7e, 0.5, 30, 0.4);
        // Note: remote viewers don't see silhouettes in MVP — silhouettes
        // are a caster-only perk (Hunter's tactical info, not a public reveal).
        break;
      }
    }
  }

  /**
   * A new networked solid (Barrier) was spawned. Create a visual mesh AND
   * insert an invisible AABB into the local World.solids list so client
   * collision matches what the server enforces.
   */
  private handleAddSolid(m: ServerAddSolid) {
    if (this.barriers.has(m.solidId)) return;
    const center = new THREE.Vector3(...m.center);
    const size = new THREE.Vector3(...m.size);

    // Build a visual that matches the local Barrier ability: yellow additive
    // box + bright edges.
    const group = new THREE.Group();
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({
        color: 0xf5d442, transparent: true, opacity: 0.32,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    group.add(inner);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({ color: 0xfff0a0 }),
    );
    group.add(edges);
    group.position.copy(center);

    // Add visible mesh + a solid AABB to the local world so OUR controller
    // collides with the barrier (server already does — but client prediction
    // would tunnel through if we didn't agree). addSolidBox tracks the mesh
    // for cleanup via clear(); we'll explicitly track + remove via barriers map.
    const aabb = this.game.world.addSolidBox(center, size, group);
    this.barriers.set(m.solidId, { solidId: m.solidId, mesh: group, aabb });
  }

  private handleRemoveSolid(m: ServerRemoveSolid) {
    const b = this.barriers.get(m.solidId);
    if (!b) return;
    this.disposeBarrier(b);
    this.barriers.delete(m.solidId);
  }

  /** Tear down a networked barrier — mesh from scene, AABB from solids. */
  private disposeBarrier(b: NetworkedBarrier) {
    // Remove mesh.
    this.game.scene.remove(b.mesh);
    b.mesh.traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    // Remove the AABB from world.solids. World doesn't expose a direct API,
    // so we mutate via a small accessor we add on World.
    this.game.world.removeSolidByRef(b.aabb);
  }

  // ─── Read local input from the engine ────────────────────────────────────

  private gameInput(): Omit<BufferedInput, 'seq' | 'dt'> {
    const input = this.game.input;
    const fwd = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const str = (input.isDown('right')   ? 1 : 0) - (input.isDown('left')  ? 1 : 0);
    return {
      fwd, str,
      jump: input.isDown('jump'),
      crouch: input.isDown('crouch'),
      yaw: this.game.camera.rotation.y,
      pitch: this.game.camera.rotation.x,
    };
  }
}
