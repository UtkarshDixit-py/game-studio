// Game-specific synth tones and the one shared `SynthAudio` for both scenes.
// Scene layer: Phaser-free so Vitest can check the tone tables, but it is
// presentation, not game logic. Nothing here changes rules or physics.
import { SynthAudio, type Tone, type Wave } from '@studio/core';
import type { Pair, Player } from '../logic/match';
import type { BallEvent } from '../logic/physics';
import type { MinigolfSaveStore } from '../logic/save';

/** The game's only synth. `unlock()` on the first touch; `muted` mirrors the save. */
export const synth = new SynthAudio();

const TRIANGLE: Wave = 'triangle';
const SQUARE: Wave = 'square';
const SAWTOOTH: Wave = 'sawtooth';
const SINE: Wave = 'sine';

/** Shot pitch range, Hz: a tap at 0 power up to a crack at full power. */
export const SHOT_FREQ_MIN = 220;
export const SHOT_FREQ_MAX = 660;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The shot tone: pitch, length and loudness all scale with power in [0, 1]. */
export const shotTone = (power: number): Tone => {
  const p = clamp01(power);
  return {
    freq: SHOT_FREQ_MIN + (SHOT_FREQ_MAX - SHOT_FREQ_MIN) * p,
    duration: 0.08 + 0.08 * p,
    wave: TRIANGLE,
    volume: 0.14 + 0.14 * p,
  };
};

/** Short click when the ball taps a wall or a peg. */
export const WALL_TAP: readonly Tone[] = [{ freq: 520, duration: 0.05, wave: SQUARE, volume: 0.12 }];

/** Descending splash as the ball drops into water. */
export const WATER_SPLASH: readonly Tone[] = [
  { freq: 440, duration: 0.08, wave: SINE, volume: 0.22 },
  { freq: 320, duration: 0.08, wave: SINE, volume: 0.2 },
  { freq: 220, duration: 0.1, wave: SINE, volume: 0.18 },
  { freq: 140, duration: 0.16, wave: SINE, volume: 0.16 },
];

/** Low crunch when a prop breaks. */
export const PROP_BREAK: readonly Tone[] = [
  { freq: 150, duration: 0.14, wave: SAWTOOTH, volume: 0.2 },
  { freq: 95, duration: 0.12, wave: SAWTOOTH, volume: 0.14 },
];

/** Bright rising chime for a star pickup. */
export const STAR_CHIME: readonly Tone[] = [
  { freq: 1047, duration: 0.07, wave: TRIANGLE, volume: 0.16 },
  { freq: 1319, duration: 0.07, wave: TRIANGLE, volume: 0.16 },
  { freq: 1568, duration: 0.16, wave: TRIANGLE, volume: 0.16 },
];

/** Quick two-note blip through a portal. */
export const PORTAL_BLIP: readonly Tone[] = [
  { freq: 392, duration: 0.05, wave: SINE, volume: 0.14 },
  { freq: 784, duration: 0.08, wave: SINE, volume: 0.14 },
];

/** Ascending arpeggio when a ball drops into the cup. */
export const HOLE_OUT: readonly Tone[] = [
  { freq: 523, duration: 0.09, wave: TRIANGLE, volume: 0.18 },
  { freq: 659, duration: 0.09, wave: TRIANGLE, volume: 0.18 },
  { freq: 784, duration: 0.09, wave: TRIANGLE, volume: 0.18 },
  { freq: 1047, duration: 0.2, wave: TRIANGLE, volume: 0.18 },
];

/** Hole won: a short upward sting. */
export const HOLE_WIN: readonly Tone[] = [
  { freq: 392, duration: 0.12, wave: TRIANGLE, volume: 0.18 },
  { freq: 523, duration: 0.26, wave: TRIANGLE, volume: 0.18 },
];

/** Hole lost: a short downward sting. */
export const HOLE_LOSE: readonly Tone[] = [
  { freq: 294, duration: 0.14, wave: SAWTOOTH, volume: 0.14 },
  { freq: 196, duration: 0.3, wave: SAWTOOTH, volume: 0.12 },
];

/** Match won: a longer fanfare. */
export const MATCH_WIN: readonly Tone[] = [
  { freq: 523, duration: 0.11, wave: TRIANGLE, volume: 0.18 },
  { freq: 659, duration: 0.11, wave: TRIANGLE, volume: 0.18 },
  { freq: 784, duration: 0.11, wave: TRIANGLE, volume: 0.18 },
  { freq: 1047, duration: 0.18, wave: TRIANGLE, volume: 0.18 },
  { freq: 784, duration: 0.09, wave: TRIANGLE, volume: 0.16 },
  { freq: 1047, duration: 0.4, wave: TRIANGLE, volume: 0.18 },
];

/** Match lost: a slow descending sting. */
export const MATCH_LOSE: readonly Tone[] = [
  { freq: 330, duration: 0.18, wave: SAWTOOTH, volume: 0.14 },
  { freq: 262, duration: 0.18, wave: SAWTOOTH, volume: 0.13 },
  { freq: 196, duration: 0.45, wave: SAWTOOTH, volume: 0.12 },
];

/** Drawn match: two level notes. */
export const MATCH_DRAW: readonly Tone[] = [
  { freq: 440, duration: 0.16, wave: TRIANGLE, volume: 0.16 },
  { freq: 440, duration: 0.3, wave: TRIANGLE, volume: 0.16 },
];

/** Tones for a physics event, or null for silent events (the roll timeout). */
export const tonesForEvent = (event: BallEvent): readonly Tone[] | null => {
  switch (event) {
    case 'wall':
      return WALL_TAP;
    case 'water':
      return WATER_SPLASH;
    case 'break':
      return PROP_BREAK;
    case 'star':
      return STAR_CHIME;
    case 'portal':
      return PORTAL_BLIP;
    case 'holed':
      return HOLE_OUT;
    case 'timeout':
      return null;
  }
};

/**
 * Sting for a finished hole from the awarded points, judged from the human's
 * side (player 0). Null when nobody took the hole.
 */
export const holeSting = (awarded: Pair<number> | null): readonly Tone[] | null => {
  if (!awarded) return null;
  if (awarded[0] > awarded[1]) return HOLE_WIN;
  if (awarded[1] > awarded[0]) return HOLE_LOSE;
  return null;
};

/** Sting for the match result, judged from the human's side. */
export const matchSting = (winner: Player | 'draw'): readonly Tone[] => {
  if (winner === 0) return MATCH_WIN;
  if (winner === 1) return MATCH_LOSE;
  return MATCH_DRAW;
};

/** Plays one tone or a back-to-back run; a no-op while muted or before unlock. */
export const playTones = (tones: readonly Tone[] | null): void => {
  if (!tones || tones.length === 0) return;
  if (tones.length === 1) synth.play(tones[0]!);
  else synth.sequence([...tones]);
};

/** Copies the saved mute flag onto the synth. Call once per scene create. */
export const applyMute = (save: MinigolfSaveStore): boolean => {
  synth.muted = save.get().muted;
  return synth.muted;
};

/**
 * Flips the mute flag in the save and on the synth, returning the new value.
 * Unlocks audio first: a tap on the button is itself a user gesture.
 */
export const toggleMute = (save: MinigolfSaveStore): boolean => {
  synth.unlock();
  const muted = !save.get().muted;
  save.set({ muted });
  synth.muted = muted;
  return muted;
};

/** Label for the mute button. */
export const muteLabel = (muted: boolean): string => (muted ? '♪ OFF' : '♪ ON');
