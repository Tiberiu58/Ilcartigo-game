/**
 * SynthEngine — procedural Web Audio SFX generator.
 *
 * Why this exists: the game shipped *silent*. Every SoundId in AudioManager
 * maps to a .wav file, and no .wav files are bundled — so a shooter with no
 * gunshots, no hitmarker ding, no kill confirm. A Krunker-style game lives or
 * dies on that moment-to-moment audio feedback.
 *
 * This engine synthesizes every sound on the fly from oscillators + filtered
 * noise + gain envelopes, so the game is fully audible with ZERO asset files.
 * AudioManager uses this as the default source; if a real .wav is later dropped
 * in (and its id added to FILE_BACKED there), the file takes priority — the
 * drop-in pipeline is preserved.
 *
 * Output chain: per-voice nodes → (optional StereoPanner) → masterGain →
 * compressor → destination. The compressor stops overlapping gunfire from
 * clipping into harsh distortion.
 *
 * The AudioContext is created lazily and resumed on the first user gesture
 * (browser autoplay policy). All scheduling is sample-accurate relative to
 * ctx.currentTime; nodes are fire-and-forget (stop() schedules their teardown).
 */

import type { SoundId } from './AudioManager';

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private gestureHooked = false;

  /** Create the context lazily. Returns false if Web Audio is unavailable. */
  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return false;
    try {
      const ctx: AudioContext = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 24;
      comp.ratio.value = 12;
      comp.attack.value = 0.002;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);

      // Shared 1s white-noise buffer for cracks / explosions / footsteps.
      const len = Math.floor(ctx.sampleRate);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noiseBuf = buf;
      this.hookGesture();
      return true;
    } catch {
      return false;
    }
  }

  /** Resume the context on the first user interaction (autoplay policy). */
  private hookGesture() {
    if (this.gestureHooked) return;
    this.gestureHooked = true;
    const resume = () => {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'click', 'mousedown'] as const) {
      window.addEventListener(ev, resume, { passive: true });
    }
  }

  /** Public hook so the app can nudge a resume after a known gesture. */
  resume() {
    if (this.ensure() && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * Play a synthesized sound.
   * @param gain  final linear gain (master×sfx×mul already folded in by caller)
   * @param pan   -1..1 stereo pan (0 = centred)
   * @param rate  pitch multiplier (e.g. the rising-hitmarker chain)
   */
  play(id: SoundId, gain: number, pan = 0, rate = 1) {
    if (gain <= 0.001) return;
    if (!this.ensure()) return;
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    // Destination for this voice: a panner if off-centre, else master.
    let dest: AudioNode = this.master!;
    if (pan !== 0 && (ctx as any).createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master!);
      dest = p;
    }
    this.render(id, t, gain, rate, dest);
  }

  // ── voice primitives ───────────────────────────────────────────────────────

  /** A pitched tone with an attack/decay envelope. */
  private tone(
    dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType,
    peak: number, attack = 0.004, freqEnd?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered noise burst (the body of a gunshot / explosion / footstep). */
  private noise(
    dest: AudioNode, t: number, dur: number, peak: number,
    filterType: BiquadFilterType, filterFreq: number, q = 1, filterEnd?: number,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    const offset = Math.random() * 0.5;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, t);
    if (filterEnd !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), t + dur);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(t, offset, dur + 0.05);
    src.stop(t + dur + 0.05);
  }

  /** A small click transient (reload, empty trigger, ui). */
  private click(dest: AudioNode, t: number, peak: number, freq = 2200) {
    this.noise(dest, t, 0.02, peak, 'highpass', freq, 0.7);
  }

  // ── per-sound recipes ────────────────────────────────────────────────────

  private render(id: SoundId, t: number, gain: number, rate: number, dest: AudioNode) {
    const g = gain; // already includes volume scaling from AudioManager
    switch (id) {
      // ─ Weapons: crack (filtered noise) + low thump body ─
      case 'fire_ar':
        this.noise(dest, t, 0.05, g * 0.9, 'bandpass', 1900, 0.8, 700);
        this.tone(dest, t, 130, 0.07, 'sine', g * 0.7, 0.002, 60);
        break;
      case 'fire_smg':
        this.noise(dest, t, 0.035, g * 0.7, 'bandpass', 2700, 0.9, 1200);
        this.tone(dest, t, 170, 0.045, 'sine', g * 0.45, 0.002, 80);
        break;
      case 'fire_pistol':
        this.noise(dest, t, 0.035, g * 0.85, 'bandpass', 2200, 0.8, 800);
        this.tone(dest, t, 150, 0.05, 'sine', g * 0.55, 0.002, 70);
        break;
      case 'fire_sniper':
        this.noise(dest, t, 0.13, g * 1.0, 'lowpass', 2600, 0.6, 400);
        this.tone(dest, t, 80, 0.22, 'sine', g * 0.85, 0.002, 38);
        this.tone(dest, t, 220, 0.12, 'triangle', g * 0.4, 0.002, 60);
        break;
      case 'fire_marksman':
        this.noise(dest, t, 0.07, g * 0.9, 'bandpass', 1600, 0.7, 600);
        this.tone(dest, t, 110, 0.09, 'sine', g * 0.6, 0.002, 50);
        break;
      case 'fire_shotgun':
        this.noise(dest, t, 0.11, g * 1.0, 'lowpass', 1700, 0.5, 300);
        this.tone(dest, t, 90, 0.14, 'sine', g * 0.8, 0.002, 42);
        break;
      case 'fire_lmg':
        this.noise(dest, t, 0.055, g * 0.95, 'lowpass', 2000, 0.6, 450);
        this.tone(dest, t, 100, 0.08, 'sine', g * 0.75, 0.002, 48);
        break;
      case 'fire_railgun':
        // Electric zap: descending saw sweep + sparkly noise.
        this.tone(dest, t, 1400, 0.28, 'sawtooth', g * 0.6, 0.004, 120);
        this.tone(dest, t, 700, 0.3, 'square', g * 0.3, 0.004, 90);
        this.noise(dest, t, 0.12, g * 0.5, 'bandpass', 3000, 3, 900);
        break;
      case 'fire_crossbow':
        // Bowstring thwip + a soft bolt-release tick — quiet and snappy.
        this.tone(dest, t, 320, 0.1, 'triangle', g * 0.5, 0.002, 140);
        this.noise(dest, t, 0.05, g * 0.4, 'highpass', 2600, 0.8);
        break;

      case 'reload':
        this.click(dest, t, g * 0.7, 2400);
        this.click(dest, t + 0.13, g * 0.8, 1800);
        break;
      case 'empty_click':
        this.click(dest, t, g * 0.6, 3000);
        break;

      // ─ Hit feedback: the all-important hitmarker tick ─
      case 'hit_confirm':
        this.tone(dest, t, 950 * rate, 0.06, 'triangle', g * 0.7, 0.001, 760 * rate);
        break;
      case 'hit_headshot':
        this.tone(dest, t, 1500 * rate, 0.05, 'triangle', g * 0.7, 0.001);
        this.tone(dest, t + 0.04, 1900 * rate, 0.05, 'triangle', g * 0.6, 0.001);
        break;
      case 'kill_feedback':
        this.tone(dest, t, 620, 0.08, 'square', g * 0.55, 0.002, 700);
        this.tone(dest, t + 0.06, 1040, 0.12, 'square', g * 0.6, 0.002, 1100);
        break;

      // ─ Movement ─
      case 'jump':
        this.tone(dest, t, 300, 0.12, 'sine', g * 0.5, 0.004, 520);
        break;
      case 'land':
        this.noise(dest, t, 0.08, g * 0.5, 'lowpass', 900, 0.7, 200);
        this.tone(dest, t, 95, 0.1, 'sine', g * 0.5, 0.002, 50);
        break;
      case 'footstep':
        this.noise(dest, t, 0.05, g * 0.5, 'lowpass', 1100, 0.8, 350);
        break;
      case 'jump_pad':
        this.tone(dest, t, 240, 0.32, 'triangle', g * 0.6, 0.006, 920);
        this.noise(dest, t, 0.18, g * 0.3, 'bandpass', 1400, 1.2, 3000);
        break;

      // ─ Abilities ─
      case 'ability_blink':
        this.tone(dest, t, 1200, 0.18, 'sawtooth', g * 0.5, 0.004, 220);
        this.noise(dest, t, 0.12, g * 0.3, 'bandpass', 2200, 2, 600);
        break;
      case 'ability_surge':
        this.tone(dest, t, 200, 0.35, 'sawtooth', g * 0.45, 0.01, 760);
        break;
      case 'ability_dash':
        this.noise(dest, t, 0.16, g * 0.5, 'bandpass', 1600, 1.2, 4200);
        break;
      case 'ability_cloak':
        this.tone(dest, t, 1800, 0.4, 'sine', g * 0.35, 0.02, 600);
        this.tone(dest, t, 2700, 0.4, 'sine', g * 0.18, 0.02, 900);
        break;
      case 'ability_barrier':
        this.tone(dest, t, 130, 0.22, 'square', g * 0.55, 0.004, 70);
        this.noise(dest, t, 0.1, g * 0.4, 'lowpass', 800, 0.6, 200);
        break;
      case 'ability_pulse':
        this.tone(dest, t, 1300, 0.3, 'sine', g * 0.5, 0.004, 1300);
        this.tone(dest, t + 0.02, 1950, 0.28, 'sine', g * 0.25, 0.004);
        break;

      // ─ Death / respawn ─
      case 'death':
        this.tone(dest, t, 360, 0.5, 'sawtooth', g * 0.55, 0.004, 70);
        this.noise(dest, t, 0.18, g * 0.4, 'lowpass', 700, 0.6, 150);
        break;
      case 'respawn':
        this.tone(dest, t, 440, 0.35, 'triangle', g * 0.5, 0.006, 880);
        break;
      case 'spawn_protect':
        this.tone(dest, t, 700, 0.3, 'sine', g * 0.35, 0.01, 1000);
        break;

      // ─ Match / UI / progression ─
      case 'match_end':
        this.tone(dest, t, 523, 0.18, 'square', g * 0.5, 0.004);
        this.tone(dest, t + 0.16, 659, 0.18, 'square', g * 0.5, 0.004);
        this.tone(dest, t + 0.32, 784, 0.34, 'square', g * 0.55, 0.004);
        break;
      case 'ui_click':
        this.tone(dest, t, 560, 0.04, 'square', g * 0.4, 0.001, 620);
        break;
      case 'level_up':
        this.tone(dest, t, 523, 0.14, 'triangle', g * 0.5, 0.004);
        this.tone(dest, t + 0.11, 659, 0.14, 'triangle', g * 0.5, 0.004);
        this.tone(dest, t + 0.22, 784, 0.14, 'triangle', g * 0.5, 0.004);
        this.tone(dest, t + 0.33, 1047, 0.34, 'triangle', g * 0.6, 0.004);
        break;
      case 'heartbeat':
        this.tone(dest, t, 60, 0.12, 'sine', g * 0.7, 0.004, 45);
        this.tone(dest, t + 0.16, 55, 0.14, 'sine', g * 0.55, 0.004, 42);
        break;

      // ─ Pickups ─
      case 'pickup_health':
        this.tone(dest, t, 660, 0.1, 'sine', g * 0.5, 0.004);
        this.tone(dest, t + 0.08, 990, 0.18, 'sine', g * 0.55, 0.004);
        break;
      case 'pickup_powerup':
        this.tone(dest, t, 700, 0.1, 'square', g * 0.45, 0.004, 760);
        this.tone(dest, t + 0.08, 1100, 0.12, 'square', g * 0.45, 0.004);
        this.tone(dest, t + 0.16, 1500, 0.22, 'square', g * 0.5, 0.004);
        break;

      // ─ Melee / grenade ─
      case 'melee':
        this.noise(dest, t, 0.14, g * 0.6, 'bandpass', 1800, 1.4, 5000);
        break;
      case 'grenade_explode':
        this.noise(dest, t, 0.4, g * 1.0, 'lowpass', 1400, 0.5, 120);
        this.tone(dest, t, 70, 0.5, 'sine', g * 0.9, 0.002, 32);
        this.noise(dest, t, 0.06, g * 0.7, 'highpass', 3000, 0.7);
        break;

      // ─ Announcer specials ─
      case 'first_blood':
        this.tone(dest, t, 440, 0.5, 'sawtooth', g * 0.5, 0.006, 880);
        this.tone(dest, t + 0.05, 660, 0.45, 'sawtooth', g * 0.35, 0.006);
        break;
      case 'revenge':
        this.tone(dest, t, 700, 0.2, 'square', g * 0.5, 0.004, 350);
        this.tone(dest, t + 0.18, 500, 0.3, 'square', g * 0.5, 0.004, 900);
        break;
      case 'comeback':
        this.tone(dest, t, 392, 0.16, 'triangle', g * 0.5, 0.004);
        this.tone(dest, t + 0.14, 523, 0.16, 'triangle', g * 0.5, 0.004);
        this.tone(dest, t + 0.28, 784, 0.36, 'triangle', g * 0.6, 0.004);
        break;

      // ─ Multi-kill chain: pitch rises by tier ─
      case 'multi_double':  this.sting(dest, t, g, 1.0); break;
      case 'multi_triple':  this.sting(dest, t, g, 1.18); break;
      case 'multi_quad':    this.sting(dest, t, g, 1.4); break;
      case 'multi_mega':    this.sting(dest, t, g, 1.66); break;
      case 'multi_monster': this.sting(dest, t, g, 2.0); break;

      // ─ Killstreak milestones: brighter chord per tier ─
      case 'streak_3':  this.fanfare(dest, t, g, 1.0); break;
      case 'streak_5':  this.fanfare(dest, t, g, 1.12); break;
      case 'streak_7':  this.fanfare(dest, t, g, 1.26); break;
      case 'streak_10': this.fanfare(dest, t, g, 1.5); break;
      case 'streak_15': this.fanfare(dest, t, g, 1.8); break;
      case 'streak_20': this.fanfare(dest, t, g, 2.2); break;

      default:
        // Unknown id — a soft neutral blip so nothing is ever truly silent.
        this.tone(dest, t, 600, 0.06, 'sine', g * 0.4, 0.002);
        break;
    }
  }

  /** Rising two-note sting used for multi-kills (pitch scaled by tier). */
  private sting(dest: AudioNode, t: number, g: number, mul: number) {
    this.tone(dest, t, 520 * mul, 0.1, 'square', g * 0.45, 0.003, 560 * mul);
    this.tone(dest, t + 0.08, 780 * mul, 0.2, 'square', g * 0.5, 0.003, 840 * mul);
  }

  /** Three-note ascending fanfare used for streak milestones. */
  private fanfare(dest: AudioNode, t: number, g: number, mul: number) {
    this.tone(dest, t, 523 * mul, 0.12, 'triangle', g * 0.45, 0.004);
    this.tone(dest, t + 0.1, 659 * mul, 0.12, 'triangle', g * 0.45, 0.004);
    this.tone(dest, t + 0.2, 880 * mul, 0.3, 'triangle', g * 0.55, 0.004);
  }
}
