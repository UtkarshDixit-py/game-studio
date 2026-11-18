export type Wave = OscillatorType;

export interface Tone {
  freq: number;
  /** seconds */
  duration: number;
  wave?: Wave;
  volume?: number;
}

/**
 * Tiny WebAudio synth so games need no audio assets. Call unlock() from a
 * touch handler once; browsers block audio until a user gesture.
 */
export class SynthAudio {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play({ freq, duration, wave = 'square', volume = 0.2 }: Tone): void {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }

  /** Plays tones back to back. */
  sequence(tones: Tone[]): void {
    if (this.muted || !this.ctx) return;
    let offset = 0;
    for (const tone of tones) {
      const delay = offset;
      setTimeout(() => this.play(tone), delay * 1000);
      offset += tone.duration;
    }
  }
}

export const tones = {
  tap: { freq: 660, duration: 0.06 },
  success: { freq: 880, duration: 0.15, wave: 'triangle' as Wave },
  fail: { freq: 160, duration: 0.25, wave: 'sawtooth' as Wave },
};
