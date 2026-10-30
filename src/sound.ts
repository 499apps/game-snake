/**
 * Snake sounds, all synthesised by the kit synth (no audio files). Soft and short: a tiny blip
 * per turn, an eat chime that climbs a pentatonic scale with the combo, and a gentle lullaby
 * when the snake falls asleep. The kit synth honours mute and stays silent in test mode.
 */
import { noteToFreq, type Synth } from './kit/audio';

/** C major pentatonic from C5, so any combo step sounds pleasant. */
const PENTATONIC = [72, 74, 76, 79, 81, 84, 86, 88];

export class SnakeSounds {
  private readonly synth: Synth;

  constructor(synth: Synth) {
    this.synth = synth;
  }

  turn(): void {
    this.synth.tone({ freq: 640, duration: 0.035, type: 'sine', volume: 0.05, release: 0.04 });
  }

  start(): void {
    this.synth.tone({ freq: noteToFreq(67), duration: 0.09, type: 'triangle', volume: 0.14 });
    this.synth.tone({ freq: noteToFreq(74), duration: 0.12, type: 'triangle', volume: 0.14, delay: 0.09 });
  }

  /** Two-note chime, higher for each combo step. */
  eat(combo: number): void {
    const i = Math.max(0, Math.min(PENTATONIC.length - 2, combo - 1));
    const a = PENTATONIC[i] as number;
    const b = PENTATONIC[i + 1] as number;
    this.synth.tone({ freq: noteToFreq(a), duration: 0.08, type: 'triangle', volume: 0.16 });
    this.synth.tone({ freq: noteToFreq(b + 12), duration: 0.14, type: 'sine', volume: 0.1, delay: 0.06 });
  }

  pause(): void {
    this.synth.tone({ freq: noteToFreq(69), slideTo: noteToFreq(64), duration: 0.12, type: 'sine', volume: 0.1 });
  }

  resume(): void {
    this.synth.tone({ freq: noteToFreq(64), slideTo: noteToFreq(69), duration: 0.12, type: 'sine', volume: 0.1 });
  }

  /** A soft bump, never harsh. */
  bump(): void {
    this.synth.tone({ freq: 150, slideTo: 95, duration: 0.18, type: 'triangle', volume: 0.16 });
  }

  /** A slow descending lullaby while the snake curls up. */
  sleep(): void {
    const notes = [79, 76, 72, 74, 67];
    notes.forEach((n, i) => {
      this.synth.tone({
        freq: noteToFreq(n),
        duration: 0.28,
        type: 'sine',
        volume: 0.1,
        attack: 0.03,
        release: 0.25,
        delay: 0.25 + i * 0.26,
      });
    });
  }

  newBest(): void {
    this.synth.success();
  }

  /** The whole board is full: a happy fanfare. */
  win(): void {
    this.synth.success();
    this.synth.tone({ freq: noteToFreq(96), duration: 0.3, type: 'sine', volume: 0.08, delay: 0.32 });
  }
}
