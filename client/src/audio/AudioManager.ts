/**
 * AudioManager — per-event SFX with optional 3D spatial positioning.
 *
 * Design notes:
 *   - Each named event ("ar_shot", "footstep", "ability_blink", etc.) maps
 *     to ONE file path. We pre-construct a Howl on first play and reuse it
 *     (Howler internally pools instances for overlapping playback).
 *   - 3D spatial: spatial events take a `position` THREE.Vector3 and the
 *     player's eye pos+yaw; we compute a stereo pan + volume falloff and
 *     pass them via Howl's pos() / pannerAttr APIs.
 *   - Silent if file missing: a Howl that 404s logs once and never plays.
 *     This is what lets us ship the pipeline now and you drop in files later.
 *   - Master / SFX volume from localStorage, applied at construction.
 *
 * Asset filenames are listed in CATALOG below. Drop the .wav files into
 * /client/public/assets/sounds/ matching those names and they "just work."
 */

import { Howl } from 'howler';
import type * as THREE from 'three';
import { SynthEngine } from './SynthEngine';

const SOUND_BASE = '/assets/sounds/';
const MANIFEST_URL = SOUND_BASE + 'manifest.json';

/** All named sound events. Each maps to a single file in /assets/sounds/. */
export const SOUND_FILES = {
  // Weapons — one fire SFX per weapon, one universal reload click.
  fire_ar:       'fire_ar.wav',
  fire_smg:      'fire_smg.wav',
  fire_sniper:   'fire_sniper.wav',
  fire_shotgun:  'fire_shotgun.wav',
  fire_marksman: 'fire_marksman.wav',
  fire_lmg:      'fire_lmg.wav',
  fire_railgun:  'fire_railgun.wav',
  fire_pistol:   'fire_pistol.wav',
  reload:        'reload.wav',
  empty_click:   'empty_click.wav',

  // Hit feedback — always plays locally on a confirmed hit.
  hit_confirm:   'hit_confirm.wav',
  hit_headshot:  'hit_headshot.wav',

  // Movement.  `footstep` is in the catalog but not yet emitted — needs a
  // distance-based throttle in PlayerController. Wired/trimmed in a later
  // pass; for now, the file (if dropped in) sits unused.
  jump:          'jump.wav',
  land:          'land.wav',
  jump_pad:      'jump_pad.wav',
  footstep:      'footstep.wav',

  // Ability casts — one SFX per ability.
  ability_blink:   'ability_blink.wav',
  ability_surge:   'ability_surge.wav',
  ability_dash:    'ability_dash.wav',
  ability_cloak:   'ability_cloak.wav',
  ability_barrier: 'ability_barrier.wav',
  ability_pulse:   'ability_pulse.wav',

  // Death / respawn
  death:         'death.wav',
  respawn:       'respawn.wav',
  spawn_protect: 'spawn_protect.wav',

  // Match / UI
  kill_feedback: 'kill_feedback.wav',
  match_end:     'match_end.wav',
  ui_click:      'ui_click.wav',
  // Progression — celebratory sting when XP crosses a level boundary.
  level_up:      'level_up.wav',

  // Low-HP danger cue — a slow heartbeat throbs while health is critical.
  heartbeat:     'heartbeat.wav',

  // Pickups (Phase 13D) — health pack grabbed.
  pickup_health: 'pickup_health.wav',

  // Arena power-up (Phase 25) — overcharge / rapid-fire pad grabbed.
  pickup_powerup: 'pickup_powerup.wav',

  // Quick melee (Phase 20) — knife swing whoosh.
  melee:         'melee.wav',

  // Frag grenade (Phase 21) — detonation boom.
  grenade_explode: 'grenade_explode.wav',

  // Announcer specials (Phase 12E) — one-off callouts, escalating stings.
  first_blood:   'first_blood.wav',
  revenge:       'revenge.wav',
  comeback:      'comeback.wav',

  // Killstreak announcer — multi-kill chain (escalating).
  multi_double:  'multi_double.wav',
  multi_triple:  'multi_triple.wav',
  multi_quad:    'multi_quad.wav',
  multi_mega:    'multi_mega.wav',
  multi_monster: 'multi_monster.wav',
  // Killstreak milestones (consecutive kills without dying).
  streak_3:      'streak_3.wav',
  streak_5:      'streak_5.wav',
  streak_7:      'streak_7.wav',
  streak_10:     'streak_10.wav',
  streak_15:     'streak_15.wav',
  streak_20:     'streak_20.wav',
} as const;

export type SoundId = keyof typeof SOUND_FILES;

const STORAGE_MASTER = 'ilc.audio.master';
const STORAGE_SFX    = 'ilc.audio.sfx';
const MAX_DISTANCE   = 80;       // beyond this, spatial sounds are inaudible
const REF_DISTANCE   = 3;        // within this, spatial sounds are at full vol

export class AudioManager {
  private howls = new Map<SoundId, Howl>();
  /** True once we've logged a "missing file" warning for this id. */
  private missingNoted = new Set<SoundId>();

  /**
   * Procedural fallback. The game ships with NO .wav files, so by default
   * every sound is synthesized here — real, juicy audio out of the box. A
   * dropped-in .wav still wins (see the manifest mechanism below).
   */
  private synth = new SynthEngine();

  /**
   * SoundIds that have a real .wav available (listed in an optional
   * `manifest.json`). Only these attempt a Howl load — so with no manifest
   * present there are zero 404s and the synth handles everything.
   */
  private wavCandidates = new Set<SoundId>();
  /** SoundIds whose .wav finished loading and should override the synth. */
  private wavReady = new Set<SoundId>();

  /** 0..1; multiplied into every play. Set from settings UI. */
  masterVolume = 0.8;
  /** 0..1; multiplied into SFX-class plays (music gets its own). */
  sfxVolume = 0.8;

  /** Mute toggle (independent of volumes — restored when un-muted). */
  muted = false;

  constructor() {
    // Restore persisted volumes.
    const mRaw = localStorage.getItem(STORAGE_MASTER);
    const sRaw = localStorage.getItem(STORAGE_SFX);
    if (mRaw !== null) this.masterVolume = clamp01(parseFloat(mRaw));
    if (sRaw !== null) this.sfxVolume = clamp01(parseFloat(sRaw));

    this.loadManifest();
  }

  /**
   * Best-effort fetch of an optional wav manifest. The manifest is a JSON
   * array of SoundId strings that have real .wav files in /assets/sounds/.
   * If it 404s (the default — no real audio shipped) we swallow the error and
   * stay 100% synthesized. To go to authored audio: drop .wav files in and
   * list their SoundIds in manifest.json.
   */
  private async loadManifest(): Promise<void> {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) return;
      const ids = await res.json();
      if (!Array.isArray(ids)) return;
      for (const id of ids) {
        if (typeof id === 'string' && id in SOUND_FILES) {
          this.wavCandidates.add(id as SoundId);
        }
      }
    } catch {
      /* no manifest → pure synth, by design */
    }
  }

  setMasterVolume(v: number) {
    this.masterVolume = clamp01(v);
    localStorage.setItem(STORAGE_MASTER, String(this.masterVolume));
  }

  setSfxVolume(v: number) {
    this.sfxVolume = clamp01(v);
    localStorage.setItem(STORAGE_SFX, String(this.sfxVolume));
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  /** Set the equipped hit-sound pack variant (audio cosmetic). */
  setHitPack(variant: string) {
    this.synth.setHitPack(variant);
  }

  /** Lazy-load a Howl on first request. Tolerant of missing files. */
  private getHowl(id: SoundId): Howl {
    let h = this.howls.get(id);
    if (h) return h;
    const file = SOUND_FILES[id];
    h = new Howl({
      src: [SOUND_BASE + file],
      volume: 1.0,
      onload: () => { this.wavReady.add(id); },
      // 404s on load fire onloaderror — fall back to the synth (which is
      // already what played) and log once.
      onloaderror: () => {
        this.wavReady.delete(id);
        if (!this.missingNoted.has(id)) {
          this.missingNoted.add(id);
          console.warn(`[audio] manifest listed ${file} but it failed to load — using synth fallback`);
        }
      },
    });
    this.howls.set(id, h);
    return h;
  }

  /**
   * Resolve whether a real .wav should play for this id. Returns the loaded
   * Howl, or null to use the synth. Kicks off a lazy load for manifest
   * candidates so the first play synthesizes and later plays use the wav.
   */
  private resolveWav(id: SoundId): Howl | null {
    if (this.wavReady.has(id)) return this.howls.get(id) ?? null;
    if (this.wavCandidates.has(id)) this.getHowl(id); // begin loading; synth covers this play
    return null;
  }

  /**
   * Play a sound at the listener (no spatial). Used for own-shot SFX, UI
   * clicks, hit confirms — anything that's "perceived" by the player rather
   * than emitted by a world entity.
   *
   * NOTE: we do NOT short-circuit on `state() === 'unloaded'`. Howl queues
   * play() calls made before the file finishes loading and fires them once
   * the buffer is ready. Bailing here would silently drop the FIRST shot /
   * jump / etc. of every session — the most visible audio you have. If the
   * file 404s, `onloaderror` (constructed in getHowl) catches it and the
   * play call no-ops harmlessly.
   */
  play(id: SoundId, volumeMul = 1.0, rate = 1.0) {
    if (this.muted) return;
    const baseVol = this.masterVolume * this.sfxVolume * volumeMul;
    if (baseVol <= 0.001) return;
    const h = this.resolveWav(id);
    if (!h) {
      // Default path: procedural synthesis (no asset files shipped).
      this.synth.play(id, baseVol, rate, 0);
      return;
    }
    const playId = h.play();
    h.volume(baseVol, playId);
    // Optional pitch shift (e.g. the rising hitmarker chain). Only touch the
    // rate when it actually differs so the common path stays allocation-free.
    if (rate !== 1.0) h.rate(rate, playId);
  }

  /**
   * Play a sound at a world position. The listener (player's eye) and a
   * world yaw are needed to compute the stereo pan + distance falloff.
   *
   * For Phase 10 this uses a *simplified* spatial model: stereo pan based on
   * the source's projection onto the listener's right-axis, plus 1/distance
   * volume falloff. Real Howler PannerNode requires WebAudio init + browser
   * autoplay gesture handling that's flaky enough we'll do it later.
   */
  playSpatial(id: SoundId, pos: THREE.Vector3, listener: THREE.Vector3, listenerYaw: number, volumeMul = 1.0) {
    if (this.muted) return;
    const dx = pos.x - listener.x;
    const dz = pos.z - listener.z;
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_DISTANCE) return;

    // Volume falloff: 1.0 within REF_DISTANCE, linearly down to 0 at MAX.
    let falloff: number;
    if (dist <= REF_DISTANCE) falloff = 1.0;
    else falloff = Math.max(0, 1 - (dist - REF_DISTANCE) / (MAX_DISTANCE - REF_DISTANCE));

    // Stereo pan: project source delta onto listener's right axis.
    // Right axis at yaw=0 is +X; rotate by yaw.
    const rightX = Math.cos(listenerYaw);
    const rightZ = -Math.sin(listenerYaw);
    const rel = (dx * rightX + dz * rightZ) / Math.max(dist, 0.0001);
    const pan = Math.max(-1, Math.min(1, rel));

    const vol = this.masterVolume * this.sfxVolume * falloff * volumeMul;
    if (vol <= 0.001) return;
    const h = this.resolveWav(id);
    if (!h) {
      // Default path: synth with stereo pan.
      this.synth.play(id, vol, 1.0, pan);
      return;
    }
    // (See play() for why we don't gate on state() — same reasoning.)
    const playId = h.play();
    h.volume(vol, playId);
    h.stereo(pan, playId);
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
