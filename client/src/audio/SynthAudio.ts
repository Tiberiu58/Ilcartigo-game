/**
 * SynthAudio — procedural WebAudio SFX, no asset files required.
 *
 * Why: the whole game-feel pipeline (gunshots, hitmarkers, kill confirms,
 * footsteps, abilities, announcer stings…) is wired through AudioManager, but
 * the project ships ZERO `.wav` files — so the game was completely silent. A
 * high-feedback arena shooter without sound is missing half its juice.
 *
 * This synthesizes every SoundId in-browser from oscillators + filtered noise
 * with hand-tuned ADSR envelopes. No dependencies, no downloads, no protocol
 * change. AudioManager uses it as the voice for any sound whose real `.wav`
 * isn't present — so dropping a file into /assets/sounds/ still overrides the
 * synth, exactly as before.
 *
 * Each sound is a short "recipe" function that schedules WebAudio nodes onto a
 * per-play output node (gain × stereo-pan, summed into a master). The optional
 * `rate` arg pitches the whole recipe (used by the rising-hitmarker chain).
 */

import type { SoundId } from './AudioManager';

/** Output handle each recipe writes into: a gain node feeding a stereo panner. */
interface Voice {
  ctx: AudioContext;
  /** Connect oscillators / buffer sources here. */
  out: AudioNode;
  /** Schedule start time (seconds, ctx clock). */
  t0: number;
  /** Pitch multiplier for the whole recipe. */
  rate: number;
}

export class SynthAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private failed = false;

  /** True once a context exists and isn't closed. */
  get ready(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  /** Lazily create + resume the AudioContext. Returns false if unavailable. */
  private ensure(): boolean {
    if (this.failed) return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx.state !== 'closed';
    }
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) { this.failed = true; return false; }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoiseBuffer(this.ctx);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /** Browser autoplay policy: call from a user gesture to unlock audio. */
  resume() {
    if (this.ensure() && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /** One second of white noise, reused as the source for all noise voices. */
  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Synthesize a sound. `vol` is the final 0..1 scale (master×sfx×mul from the
   * AudioManager); `pan` is −1..1 stereo. Returns false if audio is unavailable
   * (so the caller can fall back). Never throws.
   */
  play(id: SoundId, vol = 1, rate = 1, pan = 0): boolean {
    if (vol <= 0.0005) return true; // effectively silent — count as handled
    if (!this.ensure() || !this.ctx || !this.master) return false;
    try {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = Math.min(1, vol);
      let tail: AudioNode = g;
      if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        g.connect(p);
        tail = p;
      }
      tail.connect(this.master);
      const voice: Voice = { ctx, out: g, t0: ctx.currentTime + 0.001, rate: rate || 1 };
      const recipe = RECIPES[id] ?? genericBlip;
      recipe(this, voice);
      return true;
    } catch {
      return false;
    }
  }

  // ── low-level voice helpers (used by the recipes) ────────────────────────

  /** A pitched oscillator with an exp-decay env. Optional glide to `glideTo`. */
  tone(
    v: Voice,
    o: {
      freq: number;
      type?: OscillatorType;
      dur: number;
      gain?: number;
      attack?: number;
      delay?: number;
      glideTo?: number;
      glideShape?: 'lin' | 'exp';
    },
  ) {
    const { ctx, out, rate } = v;
    const t = v.t0 + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    const f = o.freq * rate;
    osc.frequency.setValueAtTime(f, t);
    if (o.glideTo !== undefined) {
      const to = o.glideTo * rate;
      if (o.glideShape === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + o.dur);
      else osc.frequency.linearRampToValueAtTime(to, t + o.dur);
    }
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
  }

  // ── ambient menu music ───────────────────────────────────────────────────
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicVol = 0.4;
  private musicStep = 0;
  private musicNext = 0;
  private musicOn = false;

  /** 0..1 music level. Persisted by AudioManager; applied live. */
  setMusicVolume(v: number) {
    this.musicVol = v < 0 ? 0 : v > 1 ? 1 : v;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVol * 0.25, this.ctx.currentTime, 0.1);
    }
  }

  /** Start the looping ambient bed (idempotent). No-op if audio unavailable. */
  startMusic() {
    if (this.musicOn) return;
    if (!this.ensure() || !this.ctx) return;
    this.musicOn = true;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.ctx.destination);
    }
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(this.musicVol * 0.25, this.ctx.currentTime, 0.5);
    this.musicNext = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(this.scheduleMusic, 60);
  }

  /** Fade out + stop the ambient bed. */
  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }

  /** Lookahead scheduler — queues the next ~0.25 s of notes each tick. */
  private scheduleMusic = () => {
    if (!this.ctx || !this.musicGain || !this.musicOn) return;
    const ctx = this.ctx;
    const spb = 0.40; // seconds per step (~75 BPM eighths)
    while (this.musicNext < ctx.currentTime + 0.25) {
      this.musicNote(ctx, this.musicGain, this.musicStep, this.musicNext, spb);
      this.musicStep = (this.musicStep + 1) % MUSIC_MELODY.length;
      this.musicNext += spb;
    }
  };

  /** One musical step: an arp note, plus a pad/bass swell at bar starts. */
  private musicNote(ctx: AudioContext, dest: GainNode, step: number, t: number, spb: number) {
    const note = MUSIC_MELODY[step];
    if (note > 0) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 2.2);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + spb * 2.3);
    }
    // Bar start (every 8 steps): soft pad chord + sub bass for warmth.
    if (step % 8 === 0) {
      const root = MUSIC_BASS[(step / 8) % MUSIC_BASS.length];
      [root, root * 1.5, root * 2].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        const peak = i === 0 ? 0.12 : 0.05;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 8);
        osc.connect(g).connect(dest);
        osc.start(t);
        osc.stop(t + spb * 8.1);
      });
    }
  }

  /** A filtered-noise burst with an exp-decay env. The "crack / air" layer. */
  noise(
    v: Voice,
    o: {
      dur: number;
      type?: BiquadFilterType;
      freq: number;
      q?: number;
      gain?: number;
      attack?: number;
      delay?: number;
      freqEnd?: number;
    },
  ) {
    const { ctx, out, rate } = v;
    if (!this.noiseBuf) return;
    const t = v.t0 + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type ?? 'lowpass';
    const f = o.freq * rate;
    filt.frequency.setValueAtTime(f, t);
    if (o.freqEnd !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd * rate), t + o.dur);
    if (o.q !== undefined) filt.Q.value = o.q;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    const atk = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t);
    src.stop(t + o.dur + 0.02);
  }
}

// ── ambient music data ───────────────────────────────────────────────────────
// A relaxed A-minor-pentatonic arpeggio loop (Hz; 0 = rest), with a slow
// Am–F–C–G bass/pad underneath. Calm, non-distracting menu atmosphere.
const A4 = 440, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880;
const MUSIC_MELODY = [
  A4, 0, C5, E5, 0, D5, C5, 0,
  E5, 0, G5, A5, 0, E5, D5, 0,
  C5, E5, 0, A4, C5, 0, D5, 0,
  E5, D5, C5, 0, A4, 0, E5, 0,
];
const MUSIC_BASS = [110.0, 87.31, 130.81, 98.0]; // A2 · F2 · C3 · G2

// ── recipes ────────────────────────────────────────────────────────────────

type Recipe = (s: SynthAudio, v: Voice) => void;

/** Generic short tick — fallback for any unmapped id. */
const genericBlip: Recipe = (s, v) => {
  s.tone(v, { freq: 660, type: 'square', dur: 0.06, gain: 0.18 });
};

/** Shared gunshot body: a punchy low transient + a filtered-noise crack. */
function gunshot(
  s: SynthAudio,
  v: Voice,
  o: { body: number; cutoff: number; dur: number; noiseGain?: number; bodyGain?: number; q?: number; bright?: boolean },
) {
  // Low "thump" — the recoil punch.
  s.tone(v, { freq: o.body, type: 'sine', dur: o.dur * 0.9, gain: o.bodyGain ?? 0.5, glideTo: o.body * 0.4, glideShape: 'exp' });
  // Mid crack — the bulk of the report.
  s.noise(v, { dur: o.dur, type: 'lowpass', freq: o.cutoff, q: o.q ?? 0.8, gain: o.noiseGain ?? 0.42, freqEnd: o.cutoff * 0.35 });
  // Bright snap transient for the attack.
  if (o.bright !== false) s.noise(v, { dur: 0.03, type: 'highpass', freq: 3500, gain: 0.22 });
}

const RECIPES: Partial<Record<SoundId, Recipe>> = {
  // ── weapons ──────────────────────────────────────────────────────────────
  fire_ar:      (s, v) => gunshot(s, v, { body: 150, cutoff: 1800, dur: 0.14, bodyGain: 0.5, noiseGain: 0.4 }),
  fire_smg:     (s, v) => gunshot(s, v, { body: 180, cutoff: 2200, dur: 0.09, bodyGain: 0.34, noiseGain: 0.32 }),
  fire_pistol:  (s, v) => gunshot(s, v, { body: 200, cutoff: 2600, dur: 0.1, bodyGain: 0.4, noiseGain: 0.36, q: 1.2 }),
  fire_marksman:(s, v) => gunshot(s, v, { body: 130, cutoff: 1700, dur: 0.18, bodyGain: 0.52, noiseGain: 0.44 }),
  fire_sniper:  (s, v) => {
    gunshot(s, v, { body: 90, cutoff: 1400, dur: 0.32, bodyGain: 0.6, noiseGain: 0.5, q: 0.6 });
    s.tone(v, { freq: 60, type: 'sine', dur: 0.4, gain: 0.4, delay: 0.01, glideTo: 35, glideShape: 'exp' }); // boom tail
  },
  fire_shotgun: (s, v) => {
    gunshot(s, v, { body: 100, cutoff: 1300, dur: 0.22, bodyGain: 0.55, noiseGain: 0.55, q: 0.5 });
    s.noise(v, { dur: 0.18, type: 'lowpass', freq: 900, gain: 0.4, freqEnd: 300 }); // broad spread
  },
  fire_lmg:     (s, v) => gunshot(s, v, { body: 120, cutoff: 1500, dur: 0.16, bodyGain: 0.55, noiseGain: 0.46, q: 0.7 }),
  fire_magnum:  (s, v) => {
    // Hand cannon: a big, heavy crack with a deep punch + a short boom tail.
    gunshot(s, v, { body: 95, cutoff: 1600, dur: 0.26, bodyGain: 0.62, noiseGain: 0.5, q: 0.6 });
    s.tone(v, { freq: 55, type: 'sine', dur: 0.34, gain: 0.36, glideTo: 32, glideShape: 'exp' });
  },
  fire_railgun: (s, v) => {
    // Electric zap: a fast descending bright sweep + a sparkle of HP noise.
    s.tone(v, { freq: 1400, type: 'sawtooth', dur: 0.28, gain: 0.34, glideTo: 180, glideShape: 'exp' });
    s.tone(v, { freq: 2100, type: 'square', dur: 0.18, gain: 0.16, glideTo: 400, glideShape: 'exp', delay: 0.005 });
    s.noise(v, { dur: 0.22, type: 'bandpass', freq: 2600, q: 4, gain: 0.2, freqEnd: 800 });
    s.tone(v, { freq: 70, type: 'sine', dur: 0.3, gain: 0.32, glideTo: 40, glideShape: 'exp' });
  },
  reload: (s, v) => {
    // Two mechanical clicks — mag out, mag in.
    s.noise(v, { dur: 0.04, type: 'bandpass', freq: 2400, q: 2, gain: 0.3 });
    s.noise(v, { dur: 0.05, type: 'bandpass', freq: 1800, q: 2, gain: 0.32, delay: 0.14 });
    s.tone(v, { freq: 320, type: 'square', dur: 0.04, gain: 0.12, delay: 0.16 });
  },
  empty_click: (s, v) => {
    s.noise(v, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.28 });
    s.tone(v, { freq: 220, type: 'square', dur: 0.03, gain: 0.1 });
  },

  // ── hit feedback ─────────────────────────────────────────────────────────
  hit_confirm: (s, v) => {
    // Krunker-style crisp tick — short bright two-step.
    s.tone(v, { freq: 1320, type: 'square', dur: 0.05, gain: 0.26 });
    s.tone(v, { freq: 1760, type: 'square', dur: 0.045, gain: 0.2, delay: 0.012 });
  },
  hit_headshot: (s, v) => {
    s.tone(v, { freq: 1980, type: 'square', dur: 0.07, gain: 0.3 });
    s.tone(v, { freq: 2640, type: 'square', dur: 0.06, gain: 0.22, delay: 0.02 });
  },
  kill_feedback: (s, v) => {
    // Satisfying confirm — a quick rising two-tone with a click.
    s.noise(v, { dur: 0.03, type: 'highpass', freq: 4000, gain: 0.2 });
    s.tone(v, { freq: 880, type: 'triangle', dur: 0.1, gain: 0.3 });
    s.tone(v, { freq: 1320, type: 'triangle', dur: 0.12, gain: 0.26, delay: 0.05 });
  },

  // ── movement ─────────────────────────────────────────────────────────────
  jump:     (s, v) => s.tone(v, { freq: 280, type: 'sine', dur: 0.12, gain: 0.22, glideTo: 460, glideShape: 'exp' }),
  land:     (s, v) => { s.tone(v, { freq: 150, type: 'sine', dur: 0.1, gain: 0.3, glideTo: 70, glideShape: 'exp' }); s.noise(v, { dur: 0.06, type: 'lowpass', freq: 500, gain: 0.18 }); },
  jump_pad: (s, v) => s.tone(v, { freq: 300, type: 'triangle', dur: 0.28, gain: 0.3, glideTo: 1100, glideShape: 'exp' }),
  footstep: (s, v) => s.noise(v, { dur: 0.05, type: 'lowpass', freq: 700, q: 1, gain: 0.22 }),

  // ── abilities ────────────────────────────────────────────────────────────
  ability_blink:   (s, v) => { s.tone(v, { freq: 200, type: 'sawtooth', dur: 0.18, gain: 0.26, glideTo: 1600, glideShape: 'exp' }); s.noise(v, { dur: 0.16, type: 'bandpass', freq: 1800, q: 3, gain: 0.16, freqEnd: 4000 }); },
  ability_surge:   (s, v) => s.tone(v, { freq: 220, type: 'sawtooth', dur: 0.4, gain: 0.26, glideTo: 880, glideShape: 'exp' }),
  ability_dash:    (s, v) => s.noise(v, { dur: 0.2, type: 'bandpass', freq: 800, q: 1.5, gain: 0.3, freqEnd: 3000 }),
  ability_cloak:   (s, v) => { s.tone(v, { freq: 900, type: 'sine', dur: 0.35, gain: 0.2, glideTo: 200, glideShape: 'exp' }); s.noise(v, { dur: 0.3, type: 'bandpass', freq: 3000, q: 6, gain: 0.12, freqEnd: 600 }); },
  ability_barrier: (s, v) => { s.tone(v, { freq: 140, type: 'square', dur: 0.18, gain: 0.34, glideTo: 90, glideShape: 'exp' }); s.noise(v, { dur: 0.1, type: 'lowpass', freq: 600, gain: 0.2 }); },
  ability_pulse:   (s, v) => { s.tone(v, { freq: 1400, type: 'sine', dur: 0.3, gain: 0.24, glideTo: 500, glideShape: 'exp' }); s.tone(v, { freq: 700, type: 'sine', dur: 0.3, gain: 0.16, delay: 0.06, glideTo: 250, glideShape: 'exp' }); },

  // ── death / respawn ──────────────────────────────────────────────────────
  death:         (s, v) => { s.tone(v, { freq: 300, type: 'sawtooth', dur: 0.5, gain: 0.3, glideTo: 60, glideShape: 'exp' }); s.noise(v, { dur: 0.3, type: 'lowpass', freq: 800, gain: 0.2, freqEnd: 150 }); },
  respawn:       (s, v) => { s.tone(v, { freq: 400, type: 'triangle', dur: 0.25, gain: 0.24, glideTo: 1000, glideShape: 'exp' }); s.tone(v, { freq: 600, type: 'sine', dur: 0.2, gain: 0.16, delay: 0.08, glideTo: 1400, glideShape: 'exp' }); },
  spawn_protect: (s, v) => s.tone(v, { freq: 700, type: 'sine', dur: 0.35, gain: 0.18, glideTo: 1300, glideShape: 'exp' }),

  // ── match / UI ───────────────────────────────────────────────────────────
  match_end: (s, v) => arpeggio(s, v, [523, 659, 784, 1046], 0.1, 'triangle', 0.26),
  ui_click:  (s, v) => s.tone(v, { freq: 880, type: 'square', dur: 0.035, gain: 0.16 }),
  level_up:  (s, v) => arpeggio(s, v, [523, 659, 784, 988, 1318], 0.08, 'triangle', 0.24),
  heartbeat: (s, v) => { s.tone(v, { freq: 70, type: 'sine', dur: 0.16, gain: 0.4, glideTo: 45, glideShape: 'exp' }); s.tone(v, { freq: 60, type: 'sine', dur: 0.14, gain: 0.3, delay: 0.16, glideTo: 40, glideShape: 'exp' }); },

  // ── pickups ──────────────────────────────────────────────────────────────
  pickup_health:  (s, v) => arpeggio(s, v, [660, 880, 1320], 0.07, 'sine', 0.26),
  pickup_powerup: (s, v) => arpeggio(s, v, [440, 660, 990, 1320], 0.06, 'triangle', 0.26),

  // ── melee / grenade ──────────────────────────────────────────────────────
  melee: (s, v) => s.noise(v, { dur: 0.16, type: 'bandpass', freq: 1200, q: 1.2, gain: 0.3, freqEnd: 3200 }),
  grenade_explode: (s, v) => {
    s.tone(v, { freq: 80, type: 'sine', dur: 0.5, gain: 0.55, glideTo: 30, glideShape: 'exp' });
    s.noise(v, { dur: 0.45, type: 'lowpass', freq: 1400, gain: 0.5, freqEnd: 120 });
    s.noise(v, { dur: 0.08, type: 'highpass', freq: 2500, gain: 0.3 }); // initial crack
  },

  // ── announcer specials ───────────────────────────────────────────────────
  first_blood: (s, v) => stinger(s, v, [392, 523, 784], 0.34),
  revenge:     (s, v) => stinger(s, v, [330, 494, 659], 0.32),
  comeback:    (s, v) => stinger(s, v, [294, 440, 587, 880], 0.32),

  // ── multi-kill chain (escalating brightness/length) ──────────────────────
  multi_double:  (s, v) => stinger(s, v, [523, 784], 0.26),
  multi_triple:  (s, v) => stinger(s, v, [523, 784, 1046], 0.28),
  multi_quad:    (s, v) => stinger(s, v, [659, 988, 1318], 0.3),
  multi_mega:    (s, v) => stinger(s, v, [659, 988, 1318, 1568], 0.32),
  multi_monster: (s, v) => stinger(s, v, [784, 1046, 1568, 2093], 0.36),

  // ── consecutive-kill streak milestones ───────────────────────────────────
  streak_3:  (s, v) => stinger(s, v, [440, 660], 0.26),
  streak_5:  (s, v) => stinger(s, v, [523, 784], 0.28),
  streak_7:  (s, v) => stinger(s, v, [587, 880, 1175], 0.3),
  streak_10: (s, v) => stinger(s, v, [659, 988, 1318], 0.32),
  streak_15: (s, v) => stinger(s, v, [784, 1175, 1568], 0.34),
  streak_20: (s, v) => stinger(s, v, [880, 1318, 1760, 2093], 0.38),
};

/** Rising arpeggio of pure tones (pickups / fanfares). */
function arpeggio(s: SynthAudio, v: Voice, freqs: number[], step: number, type: OscillatorType, gain: number) {
  freqs.forEach((f, i) => s.tone(v, { freq: f, type, dur: step * 1.8, gain, delay: i * step }));
}

/** A punchier "announcer" sting — square-lead chord stabs with a noise snap. */
function stinger(s: SynthAudio, v: Voice, freqs: number[], gain: number) {
  s.noise(v, { dur: 0.03, type: 'highpass', freq: 3500, gain: 0.16 });
  freqs.forEach((f, i) => {
    s.tone(v, { freq: f, type: 'square', dur: 0.22, gain: gain * 0.7, delay: i * 0.06 });
    s.tone(v, { freq: f, type: 'triangle', dur: 0.28, gain, delay: i * 0.06 });
  });
}
