/**
 * Tiny WebAudio synthesizer. No audio files: every sound is generated here.
 * Calm, short, pleasant. A global mute is persisted under "g499:mute".
 *
 * Audio must never break a game: a missing or failing audio device, a rejected resume() or a
 * throwing node all degrade to silence without exceptions or console errors. In silent mode
 * (test pages) no AudioContext is created at all; mute state and storage behave the same.
 */
import { storage, type KitStorage } from './storage';

export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface ToneOptions {
  freq: number;
  duration?: number;
  type?: WaveType;
  volume?: number;
  attack?: number;
  release?: number;
  /** Glide to this frequency over the duration. */
  slideTo?: number;
  /** Start delay in seconds. */
  delay?: number;
}

/** MIDI note number to frequency in Hz (69 = A4 = 440 Hz). */
export function noteToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const MUTE_KEY = 'mute';

export interface SynthOptions {
  /** Never create an AudioContext (test mode). Mute state and storage work the same. */
  silent?: boolean;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedFlag: boolean;
  /** Set after an audio failure: stay silent for the rest of the page life. */
  private broken = false;
  private readonly silentMode: boolean;
  private readonly store: KitStorage;
  private readonly listeners = new Set<(muted: boolean) => void>();

  constructor(store: KitStorage = storage, opts: SynthOptions = {}) {
    this.store = store;
    this.silentMode = opts.silent === true;
    this.mutedFlag = store.get<boolean>(MUTE_KEY, false) === true;
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  /** True when no sound can play: silent mode or a failed audio device. */
  get silent(): boolean {
    return this.silentMode || this.broken;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  onMuteChange(cb: (muted: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    this.store.set(MUTE_KEY, muted);
    this.applyGain(true);
    for (const cb of this.listeners) cb(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    return this.mutedFlag;
  }

  /** Re-read the persisted mute flag without writing anything (after "clear my data"). */
  reload(): void {
    this.mutedFlag = this.store.get<boolean>(MUTE_KEY, false) === true;
    this.applyGain(false);
    for (const cb of this.listeners) cb(this.mutedFlag);
  }

  /** Create or resume the AudioContext. Call from a user gesture (pointerdown / keydown). */
  unlock(): void {
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'suspended') return;
    try {
      // A rejected resume() (no gesture yet, device busy) is retried on the next gesture.
      void ctx.resume().catch(() => undefined);
    } catch {
      this.degrade();
    }
  }

  private applyGain(cancel: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;
      if (cancel) master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(this.mutedFlag ? 0 : 1, t, 0.02);
    } catch {
      this.degrade();
    }
  }

  /** Drop the context after an audio error. Quiet: no throw, no console output. */
  private degrade(): void {
    this.broken = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (!ctx) return;
    try {
      ctx.onstatechange = null;
      if (ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    } catch {
      /* already gone */
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.silentMode || this.broken) return null;
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
    let ctx: AudioContext | null = null;
    try {
      ctx = new window.AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.mutedFlag ? 0 : 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      // The browser closes the context when the device fails; follow it quietly.
      const created = ctx;
      created.onstatechange = () => {
        try {
          if (created.state === 'closed' && this.ctx === created) this.degrade();
        } catch {
          this.degrade();
        }
      };
      try {
        created.addEventListener('error', () => this.degrade());
      } catch {
        /* older engines have no error event */
      }
      return ctx;
    } catch {
      this.ctx = ctx;
      this.degrade();
      return null;
    }
  }

  /** Run a sound builder; any audio exception turns the synth silent instead of throwing. */
  private play(build: (ctx: AudioContext, master: GainNode) => void): void {
    if (this.mutedFlag) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    try {
      build(ctx, master);
    } catch {
      this.degrade();
    }
  }

  tone(opts: ToneOptions): void {
    this.play((ctx, master) => this.buildTone(ctx, master, opts));
  }

  private buildTone(ctx: AudioContext, master: GainNode, opts: ToneOptions): void {
    const duration = opts.duration ?? 0.12;
    const attack = opts.attack ?? 0.005;
    const release = opts.release ?? 0.08;
    const volume = opts.volume ?? 0.25;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
    gain.gain.setValueAtTime(volume, t0 + Math.max(attack, duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + release + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Short soft blip (hover, move). */
  blip(): void {
    this.tone({ freq: 880, duration: 0.07, type: 'sine', volume: 0.12 });
  }

  /** Bubbly pop (press, pick up). */
  pop(): void {
    this.tone({ freq: 620, slideTo: 310, duration: 0.11, type: 'triangle', volume: 0.22 });
  }

  /** Very short tick (menu navigation). */
  tick(): void {
    this.tone({ freq: 1320, duration: 0.03, type: 'square', volume: 0.05, release: 0.03 });
  }

  /** Happy rising arpeggio (goal, level up). */
  success(): void {
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => {
      this.tone({
        freq: noteToFreq(n),
        duration: 0.14,
        type: 'triangle',
        volume: 0.18,
        delay: i * 0.07,
      });
    });
  }

  /** Gentle descending tone (miss). Never harsh. */
  fail(): void {
    this.tone({ freq: 330, slideTo: 220, duration: 0.25, type: 'sine', volume: 0.16 });
  }

  /** Soft filtered noise swoosh (swipe, whoosh). */
  whoosh(): void {
    this.play((ctx, master) => this.buildWhoosh(ctx, master));
  }

  private buildWhoosh(ctx: AudioContext, master: GainNode): void {
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.2);
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.listeners.clear();
    if (!ctx) return;
    try {
      ctx.onstatechange = null;
      if (ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    } catch {
      /* already gone */
    }
  }
}

export function createSynth(store?: KitStorage, opts?: SynthOptions): Synth {
  return new Synth(store, opts);
}

/**
 * Unlock audio on the first user gesture. Returns a function that removes the listeners.
 */
export function attachAutoUnlock(synth: Synth, target: EventTarget = window): () => void {
  const handler = () => synth.unlock();
  const events = ['pointerdown', 'keydown', 'touchstart'];
  for (const ev of events) target.addEventListener(ev, handler, { passive: true });
  return () => {
    for (const ev of events) target.removeEventListener(ev, handler);
  };
}
