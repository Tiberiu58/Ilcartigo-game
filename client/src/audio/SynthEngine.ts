/**
 * SynthEngine — procedural Web Audio SFX (Phase 36).
 *
 * The game shipped silent: every SoundId in AudioManager mapped to a .wav file
 * that doesn't exist, so combat had no audio at all — the single biggest gap
 * for a "satisfying shooting / flashy feedback" shooter. This engine fixes that
 * by *synthesizing* every sound at runtime with the Web Audio API: punchy
 * gunshots per weapon, Krunker-style hitmarker ticks, headshot dings, kill
 * confirms, reload clicks, footstep thuds, ability whooshes, explosions, and
 * escalating announcer stings — all with zero asset files.
 *
 * Design:
 *   - ONE AudioContext, created lazily and resumed on the first user gesture
 *     (browser autoplay policy). Cheap nodes are created per sound and freed
 *     when they finish (oscillators/buffer-sources auto-disconnect after stop).
 *   - A single shared white-noise buffer backs every noise-based sound.
 *   - `play(id, vol, rate, pan)` maps each SoundId to a hand-tuned recipe.
 *     `vol` is the already-computed master*sfx*falloff gain from AudioManager;
 *     `rate` pitch-scales tonal content (drives the rising-hitmarker chain);
 *     `pan` (-1..1) positions spatial sounds.
 *
 * AudioManager uses this as the default source; a real .wav (listed in an
 * optional manifest) still overrides it per sound.
 */

export class SynthEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    // Resume the context on the first user gesture (autoplay policy). The game
    // starts behind menu clicks / pointer-lock, so this fires well before
    // combat audio is needed.
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.ensureCtx();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('click', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('click', unlock);
    }
  }

  /** Lazily create the AudioContext + master gain + noise buffer. */
  private ensureCtx(): boolean {
    if (this.ctx) return true;
    try {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      // Shared 1s white-noise buffer.
      const len = Math.floor(this.ctx.sampleRate * 1.0);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  /** Entry point from AudioManager. Tolerant of a not-yet-unlocked context. */
  play(id: string, vol = 1, rate = 1, pan = 0): void {
    if (vol <= 0.0005) return;
    if (!this.ensureCtx() || !this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') {
      // Best-effort resume; the gesture listener normally handles this, but a
      // programmatic kick here covers edge cases. If still suspended the
      // scheduled nodes simply won't be heard — no error.
      this.ctx.resume().catch(() => {});
    }
    const t = this.ctx.currentTime + 0.001;
    const dest = this.panNode(pan);
    try {
      this.render(id, t, vol, rate <= 0 ? 1 : rate, dest);
    } catch {
      /* never let a synth glitch break the frame */
    }
  }

  /** Build a stereo-pan node feeding master (or master directly if centred). */
  private panNode(pan: number): AudioNode {
    if (!this.ctx || !this.master) return this.ctx!.destination;
    if (Math.abs(pan) < 0.02 || typeof this.ctx.createStereoPanner !== 'function') {
      return this.master;
    }
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  // ---- low-level voice helpers -------------------------------------------

  /** A pitched oscillator with an attack/decay gain envelope. */
  private tone(
    t0: number,
    freq: number,
    type: OscillatorType,
    dur: number,
    peak: number,
    dest: AudioNode,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    }
    const atk = Math.min(0.008, dur * 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** A filtered burst of the shared white-noise buffer. */
  private noise(
    t0: number,
    dur: number,
    peak: number,
    filterType: BiquadFilterType,
    filterFreq: number,
    q: number,
    dest: AudioNode,
    filterEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.004, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** A short tonal "blip" (UI ticks, hitmarkers). */
  private blip(t0: number, freq: number, dur: number, peak: number, dest: AudioNode, type: OscillatorType = 'square'): void {
    this.tone(t0, freq, type, dur, peak, dest);
  }

  /** Play a rising sequence of notes (announcer stings / fanfares).
   *  DISABLED per user request: these melodic arpeggios read as "background
   *  music" during play, so every arp-based SFX (kill-streak/multi-kill stings,
   *  announcer specials, level-up, pickups, respawn) is now silent. The dry
   *  effects (gunshots, hitmarkers, reloads, UI clicks) are unaffected. To
   *  re-enable, restore the loop below. */
  private arp(_t0: number, _freqs: number[], _step: number, _dur: number, _peak: number, _dest: AudioNode, _type: OscillatorType = 'triangle'): void {
    /* intentionally silent */
  }

  // ---- recipe dispatch ----------------------------------------------------

  private render(id: string, t: number, v: number, rate: number, dest: AudioNode): void {
    // Weapon fire shares a generic "gunshot" shape parameterised per weapon.
    switch (id) {
      case 'fire_ar':       return this.gun(t, v, dest, { body: 150, noiseHz: 1400, q: 0.7, dur: 0.13, lvl: 0.9 });
      case 'fire_smg':      return this.gun(t, v, dest, { body: 210, noiseHz: 2000, q: 0.6, dur: 0.08, lvl: 0.7 });
      case 'fire_sniper':   return this.gun(t, v, dest, { body: 90,  noiseHz: 900,  q: 0.9, dur: 0.34, lvl: 1.15, tail: true });
      case 'fire_shotgun':  return this.gun(t, v, dest, { body: 80,  noiseHz: 700,  q: 0.4, dur: 0.28, lvl: 1.1, tail: true });
      case 'fire_marksman': return this.gun(t, v, dest, { body: 120, noiseHz: 1200, q: 0.8, dur: 0.2,  lvl: 1.0, tail: true });
      case 'fire_lmg':      return this.gun(t, v, dest, { body: 110, noiseHz: 1100, q: 0.6, dur: 0.14, lvl: 0.95 });
      case 'fire_pistol':   return this.gun(t, v, dest, { body: 200, noiseHz: 1700, q: 0.7, dur: 0.1,  lvl: 0.8 });
      case 'fire_railgun':  return this.railgun(t, v, dest);
      case 'fire_magnum':   return this.gun(t, v, dest, { body: 70, noiseHz: 850, q: 0.8, dur: 0.26, lvl: 1.2, tail: true });

      case 'reload':        return this.reload(t, v, dest);
      case 'empty_click':   { this.blip(t, 1800, 0.03, v * 0.4, dest, 'square'); return; }

      // Hitmarker — bright short tick; rate climbs with the hit-chain.
      case 'hit_confirm':   { this.blip(t, 880 * rate, 0.05, v * 0.55, dest, 'square'); this.blip(t, 1300 * rate, 0.035, v * 0.3, dest, 'triangle'); return; }
      case 'hit_headshot':  { this.blip(t, 1500 * rate, 0.07, v * 0.6, dest, 'square'); this.blip(t + 0.01, 2100 * rate, 0.05, v * 0.35, dest, 'triangle'); return; }

      case 'jump':          { this.tone(t, 320, 'sine', 0.12, v * 0.5, dest, 540); return; }
      case 'land':          { this.tone(t, 150, 'sine', 0.13, v * 0.55, dest, 70); this.noise(t, 0.08, v * 0.3, 'lowpass', 600, 0.6, dest); return; }
      case 'jump_pad':      { this.tone(t, 300, 'triangle', 0.28, v * 0.6, dest, 1200); return; }
      case 'footstep':      { this.noise(t, 0.05, v * 0.5, 'lowpass', 520, 0.7, dest); return; }

      case 'ability_blink':   { this.tone(t, 1400, 'sine', 0.18, v * 0.5, dest, 280); this.noise(t, 0.12, v * 0.25, 'bandpass', 1800, 3, dest, 600); return; }
      case 'ability_surge':   { this.tone(t, 240, 'sawtooth', 0.3, v * 0.45, dest, 720); return; }
      case 'ability_dash':    { this.noise(t, 0.18, v * 0.4, 'bandpass', 2200, 2, dest, 500); return; }
      case 'ability_cloak':   { this.tone(t, 900, 'sine', 0.35, v * 0.4, dest, 220); return; }
      case 'ability_barrier': { this.tone(t, 120, 'square', 0.18, v * 0.55, dest, 80); this.noise(t, 0.1, v * 0.3, 'lowpass', 400, 0.7, dest); return; }
      case 'ability_pulse':   { this.tone(t, 600, 'sine', 0.4, v * 0.45, dest, 1500); return; }

      case 'death':         { this.tone(t, 300, 'sawtooth', 0.5, v * 0.55, dest, 60); this.noise(t, 0.18, v * 0.3, 'lowpass', 500, 0.6, dest); return; }
      case 'respawn':       { this.arp(t, [400, 600, 900], 0.05, 0.16, v * 0.4, dest, 'sine'); return; }
      case 'spawn_protect': { this.tone(t, 700, 'sine', 0.3, v * 0.3, dest, 1100); return; }

      case 'kill_feedback': { this.blip(t, 1046, 0.07, v * 0.55, dest, 'square'); this.blip(t + 0.05, 1568, 0.1, v * 0.5, dest, 'square'); return; }
      case 'match_end':     return this.fanfare(t, v, dest);
      case 'ui_click':      { this.blip(t, 660, 0.025, v * 0.35, dest, 'square'); return; }
      case 'level_up':      { this.arp(t, [523, 659, 784, 1046], 0.08, 0.2, v * 0.5, dest, 'triangle'); return; }

      case 'heartbeat':     { this.tone(t, 70, 'sine', 0.16, v * 0.7, dest, 45); return; }

      case 'pickup_health':  { this.arp(t, [660, 990], 0.06, 0.16, v * 0.45, dest, 'sine'); return; }
      case 'pickup_powerup': { this.arp(t, [440, 660, 880, 1320], 0.05, 0.18, v * 0.5, dest, 'sawtooth'); return; }

      case 'melee':          { this.noise(t, 0.16, v * 0.5, 'bandpass', 2600, 1.5, dest, 800); return; }
      case 'grenade_explode': return this.explosion(t, v, dest);

      // Announcer specials — escalating celebratory stings.
      case 'first_blood':   { this.arp(t, [392, 523, 784], 0.07, 0.22, v * 0.55, dest, 'sawtooth'); return; }
      case 'revenge':       { this.arp(t, [330, 440, 587, 880], 0.06, 0.2, v * 0.55, dest, 'square'); return; }
      case 'comeback':      { this.arp(t, [262, 392, 523, 784], 0.07, 0.24, v * 0.55, dest, 'triangle'); return; }

      case 'multi_double':  { this.arp(t, [523, 698], 0.06, 0.2, v * 0.5, dest); return; }
      case 'multi_triple':  { this.arp(t, [523, 698, 880], 0.06, 0.2, v * 0.55, dest); return; }
      case 'multi_quad':    { this.arp(t, [523, 698, 880, 1046], 0.06, 0.2, v * 0.6, dest); return; }
      case 'multi_mega':    { this.arp(t, [523, 698, 880, 1046, 1318], 0.055, 0.22, v * 0.62, dest); return; }
      case 'multi_monster': { this.arp(t, [392, 523, 698, 880, 1046, 1568], 0.05, 0.24, v * 0.65, dest, 'sawtooth'); return; }

      case 'streak_3':      { this.arp(t, [440, 554], 0.06, 0.18, v * 0.45, dest); return; }
      case 'streak_5':      { this.arp(t, [440, 554, 659], 0.06, 0.2, v * 0.5, dest); return; }
      case 'streak_7':      { this.arp(t, [523, 659, 784], 0.06, 0.2, v * 0.55, dest, 'sawtooth'); return; }
      case 'streak_10':     { this.arp(t, [523, 659, 784, 1046], 0.055, 0.22, v * 0.6, dest, 'sawtooth'); return; }
      case 'streak_15':     { this.arp(t, [392, 523, 659, 880, 1046], 0.05, 0.24, v * 0.62, dest, 'sawtooth'); return; }
      case 'streak_20':     { this.arp(t, [330, 440, 587, 784, 988, 1318], 0.05, 0.26, v * 0.66, dest, 'sawtooth'); return; }

      default:
        // Unknown id → a soft neutral tick so nothing is silent-by-typo.
        this.blip(t, 700, 0.03, v * 0.25, dest, 'sine');
    }
  }

  // ---- composite recipes --------------------------------------------------

  private gun(
    t: number,
    v: number,
    dest: AudioNode,
    p: { body: number; noiseHz: number; q: number; dur: number; lvl: number; tail?: boolean },
  ): void {
    const lvl = v * p.lvl;
    // Crack: a bright noise burst, filter sweeping down for a "pew" tail.
    this.noise(t, p.dur, lvl * 0.85, 'bandpass', p.noiseHz, p.q, dest, p.noiseHz * 0.4);
    // Body: a low pitched thump dropping fast — the chest-punch.
    this.tone(t, p.body, 'sine', p.dur * 0.9, lvl * 0.7, dest, p.body * 0.45);
    // Click transient up top for snap.
    this.blip(t, 2600, 0.012, lvl * 0.3, dest, 'square');
    // Big guns get a low-frequency rumble tail.
    if (p.tail) this.noise(t + p.dur * 0.4, p.dur, lvl * 0.4, 'lowpass', 360, 0.6, dest, 120);
  }

  private railgun(t: number, v: number, dest: AudioNode): void {
    // Sci-fi electric discharge: a fast upward pitch sweep + crackly noise.
    this.tone(t, 200, 'sawtooth', 0.32, v * 0.6, dest, 1800);
    this.tone(t, 400, 'square', 0.28, v * 0.35, dest, 90);
    this.noise(t, 0.3, v * 0.4, 'bandpass', 2600, 4, dest, 600);
    this.blip(t, 3200, 0.02, v * 0.4, dest, 'square');
  }

  private reload(t: number, v: number, dest: AudioNode): void {
    // Two mechanical clicks — mag out, mag in.
    this.noise(t, 0.04, v * 0.45, 'highpass', 1800, 0.8, dest);
    this.blip(t + 0.005, 900, 0.03, v * 0.3, dest, 'square');
    this.noise(t + 0.16, 0.05, v * 0.5, 'highpass', 1500, 0.8, dest);
    this.blip(t + 0.17, 700, 0.04, v * 0.35, dest, 'square');
  }

  private explosion(t: number, v: number, dest: AudioNode): void {
    // Low-frequency boom + broadband noise blast with a long rumble tail.
    this.tone(t, 140, 'sine', 0.55, v * 0.9, dest, 35);
    this.noise(t, 0.5, v * 0.75, 'lowpass', 900, 0.5, dest, 120);
    this.noise(t, 0.12, v * 0.5, 'bandpass', 1600, 1, dest, 400);
  }

  private fanfare(t: number, v: number, dest: AudioNode): void {
    // Short victory flourish.
    this.arp(t, [523, 659, 784], 0.1, 0.18, v * 0.5, dest, 'square');
    this.tone(t + 0.3, 1046, 'square', 0.4, v * 0.55, dest);
  }
}
