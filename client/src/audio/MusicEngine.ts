/**
 * MusicEngine — procedural background music (menu theme + combat track).
 *
 * Krunker-style arena shooters live on momentum, and music is a big part of
 * that vibe. Now that we have a Web Audio synthesis layer (SynthEngine), this
 * adds two looping, fully-synthesized tracks — a calm minor-key menu theme and
 * a driving combat pulse — with their own volume slider and an on/off toggle.
 *
 * It uses a classic lookahead scheduler: a low-frequency timer wakes up, looks
 * a short window into the future, and schedules every note that falls inside it
 * sample-accurately against ctx.currentTime. The timer only runs while a track
 * is active and audible, so an idle/muted MusicEngine costs nothing.
 *
 * Tracks are generated from a per-bar chord array (bass = root, an arpeggio,
 * and — in combat — sustained stabs), so there are no audio assets.
 */

const STORAGE_VOL = 'ilc.audio.music';
const STORAGE_ON  = 'ilc.audio.music.on';

type TrackName = 'menu' | 'combat';

interface Track {
  bpm: number;
  /** Per-bar chords as MIDI note numbers; [0] is the root. */
  chords: number[][];
  /** Overall loudness scalar for the track (combat ducks under SFX). */
  level: number;
}

// A-minor flavoured progressions. Menu: Am–F–C–G (hopeful-melancholy).
// Combat: Am–Am–F–G driving (darker, more urgent).
const TRACKS: Record<TrackName, Track> = {
  menu: {
    bpm: 92,
    level: 0.9,
    chords: [
      [57, 60, 64], // Am
      [53, 57, 60], // F
      [48, 52, 55], // C
      [55, 59, 62], // G
    ],
  },
  combat: {
    bpm: 132,
    level: 0.7,
    chords: [
      [45, 52, 57], // Am (low)
      [45, 52, 57], // Am
      [41, 48, 53], // F
      [43, 50, 55], // G
    ],
  },
};

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;

  private track: TrackName | null = null;
  private step = 0;          // 16th-note counter
  private nextNoteTime = 0;  // ctx time of the next 16th to schedule
  private gestureHooked = false;

  /** 0..1 music volume (independent of SFX). */
  volume = 0.4;
  /** User toggle. */
  enabled = true;
  /** Mirrors AudioManager.muted so the master mute kills music too. */
  private masterMuted = false;

  constructor() {
    const v = localStorage.getItem(STORAGE_VOL);
    const on = localStorage.getItem(STORAGE_ON);
    if (v !== null) this.volume = clamp01(parseFloat(v));
    if (on !== null) this.enabled = on === '1';
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return false;
    try {
      const ctx: AudioContext = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200; // soften the top so it sits under SFX
      master.connect(lp);
      lp.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.hookGesture();
      return true;
    } catch {
      return false;
    }
  }

  /** Resume + reconcile on the first user gesture (autoplay policy). */
  private hookGesture() {
    if (this.gestureHooked) return;
    this.gestureHooked = true;
    const onGesture = () => {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.reconcile();
    };
    for (const ev of ['pointerdown', 'keydown', 'click', 'mousedown'] as const) {
      window.addEventListener(ev, onGesture, { passive: true });
    }
  }

  resume() {
    if (this.ensure() && this.ctx!.state === 'suspended') this.ctx!.resume();
  }

  setVolume(v: number) {
    this.volume = clamp01(v);
    localStorage.setItem(STORAGE_VOL, String(this.volume));
    this.applyGain();
    this.reconcile();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    localStorage.setItem(STORAGE_ON, on ? '1' : '0');
    this.reconcile();
  }

  /** Called by AudioManager when the master mute flips. */
  setMasterMuted(m: boolean) {
    this.masterMuted = m;
    this.reconcile();
  }

  /** Switch to a track (or null to stop). Idempotent. */
  setTrack(name: TrackName | null) {
    if (this.track === name) { this.reconcile(); return; }
    this.track = name;
    this.step = 0;
    this.reconcile();
  }

  private audible(): boolean {
    return this.enabled && !this.masterMuted && this.volume > 0.001 && this.track !== null;
  }

  /** Start or stop the scheduler to match the current audible state. */
  private reconcile() {
    if (this.audible()) {
      if (!this.ensure()) return;
      if (this.ctx!.state === 'suspended') this.ctx!.resume();
      this.applyGain();
      if (this.timer === null) {
        this.nextNoteTime = this.ctx!.currentTime + 0.06;
        this.timer = window.setInterval(() => this.scheduler(), 25);
      }
    } else if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
      // Fade out cleanly.
      if (this.master && this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(0, t + 0.25);
      }
    }
  }

  private applyGain() {
    if (!this.master || !this.ctx || !this.track) return;
    const target = this.volume * TRACKS[this.track].level * 0.5;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.4);
  }

  // ── scheduler ──────────────────────────────────────────────────────────

  private scheduler() {
    if (!this.ctx || !this.track) return;
    const tr = TRACKS[this.track];
    const sixteenth = 60 / tr.bpm / 4;
    const ahead = 0.2;
    while (this.nextNoteTime < this.ctx.currentTime + ahead) {
      this.scheduleStep(this.step, this.nextNoteTime, tr);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % (tr.chords.length * 16);
    }
  }

  private scheduleStep(step: number, time: number, tr: Track) {
    const bar = Math.floor(step / 16) % tr.chords.length;
    const inBar = step % 16;
    const chord = tr.chords[bar];
    const root = chord[0];

    if (this.track === 'menu') {
      // Soft bass roots on beats 1 and 3.
      if (inBar === 0 || inBar === 8) this.note(time, root - 12, 0.9, 'triangle', 0.5);
      // Gentle eighth-note arpeggio.
      if (inBar % 2 === 0) {
        const n = chord[(inBar / 2) % chord.length];
        this.note(time, n + 12, 0.42, 'triangle', 0.22);
      }
      // Bar-start pad.
      if (inBar === 0) for (const n of chord) this.note(time, n, 1.8, 'sawtooth', 0.07, true);
    } else {
      // Combat: pulsing bass on every quarter, off-beat stabs, driving arp.
      if (inBar % 4 === 0) this.note(time, root - 12, 0.42, 'square', 0.5);
      if (inBar % 4 === 2) this.note(time, root, 0.16, 'square', 0.22); // off-beat
      if (inBar % 2 === 1) {
        const n = chord[(Math.floor(inBar / 2)) % chord.length];
        this.note(time, n + 12, 0.18, 'sawtooth', 0.16);
      }
      // Sustained tense pad each bar.
      if (inBar === 0) for (const n of chord) this.note(time, n, 1.7, 'sawtooth', 0.05, true);
    }
  }

  /** Schedule one synthesized note. */
  private note(time: number, midi: number, dur: number, type: OscillatorType, peak: number, pad = false) {
    if (!this.ctx || !this.master) return;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const atk = pad ? 0.12 : 0.006;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
