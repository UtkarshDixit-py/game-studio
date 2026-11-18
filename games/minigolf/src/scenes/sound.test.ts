import { createMemoryStorage } from '@studio/core';
import { describe, expect, it } from 'vitest';
import type { BallEvent } from '../logic/physics';
import { createMinigolfSave } from '../logic/save';
import {
  HOLE_LOSE,
  HOLE_OUT,
  HOLE_WIN,
  MATCH_DRAW,
  MATCH_LOSE,
  MATCH_WIN,
  SHOT_FREQ_MAX,
  SHOT_FREQ_MIN,
  WATER_SPLASH,
  applyMute,
  holeSting,
  matchSting,
  muteLabel,
  playTones,
  shotTone,
  synth,
  toggleMute,
  tonesForEvent,
} from './sound';

const freqs = (tones: readonly { freq: number }[]) => tones.map((t) => t.freq);
const strictlyDescending = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]!);
const strictlyAscending = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);

describe('shotTone', () => {
  it('pitch scales with power across the shot range', () => {
    expect(shotTone(0).freq).toBe(SHOT_FREQ_MIN);
    expect(shotTone(1).freq).toBe(SHOT_FREQ_MAX);
    expect(shotTone(0.5).freq).toBeCloseTo((SHOT_FREQ_MIN + SHOT_FREQ_MAX) / 2, 9);
    expect(shotTone(0.8).freq).toBeGreaterThan(shotTone(0.3).freq);
  });

  it('clamps power outside [0, 1]', () => {
    expect(shotTone(-1)).toEqual(shotTone(0));
    expect(shotTone(7)).toEqual(shotTone(1));
  });

  it('is longer and louder at full power', () => {
    expect(shotTone(1).duration).toBeGreaterThan(shotTone(0).duration);
    expect(shotTone(1).volume!).toBeGreaterThan(shotTone(0).volume!);
  });
});

describe('tone tables', () => {
  it('water splash descends', () => {
    expect(WATER_SPLASH.length).toBeGreaterThanOrEqual(3);
    expect(strictlyDescending(freqs(WATER_SPLASH))).toBe(true);
  });

  it('hole-out arpeggio ascends', () => {
    expect(HOLE_OUT.length).toBeGreaterThanOrEqual(3);
    expect(strictlyAscending(freqs(HOLE_OUT))).toBe(true);
  });

  it('win stings rise and lose stings fall', () => {
    expect(strictlyAscending(freqs(HOLE_WIN))).toBe(true);
    expect(strictlyDescending(freqs(HOLE_LOSE))).toBe(true);
    expect(strictlyDescending(freqs(MATCH_LOSE))).toBe(true);
    expect(MATCH_WIN[MATCH_WIN.length - 1]!.freq).toBeGreaterThan(MATCH_WIN[0]!.freq);
  });

  it('every tone has a positive pitch and duration', () => {
    const all = [...WATER_SPLASH, ...HOLE_OUT, ...HOLE_WIN, ...HOLE_LOSE, ...MATCH_WIN, ...MATCH_LOSE, ...MATCH_DRAW];
    for (const tone of all) {
      expect(tone.freq).toBeGreaterThan(0);
      expect(tone.duration).toBeGreaterThan(0);
    }
  });
});

describe('tonesForEvent', () => {
  it('maps every audible event and stays silent on timeout', () => {
    const audible: BallEvent[] = ['wall', 'water', 'break', 'star', 'portal', 'holed'];
    for (const event of audible) {
      const tones = tonesForEvent(event);
      expect(tones).not.toBeNull();
      expect(tones!.length).toBeGreaterThan(0);
    }
    expect(tonesForEvent('timeout')).toBeNull();
  });

  it('uses the descending splash for water and the arpeggio for a hole-out', () => {
    expect(tonesForEvent('water')).toBe(WATER_SPLASH);
    expect(tonesForEvent('holed')).toBe(HOLE_OUT);
  });
});

describe('stings', () => {
  it('picks the hole sting from the awarded points', () => {
    expect(holeSting([1, 0])).toBe(HOLE_WIN);
    expect(holeSting([0, 1])).toBe(HOLE_LOSE);
    expect(holeSting([0, 0])).toBeNull();
    expect(holeSting(null)).toBeNull();
  });

  it('picks the match sting from the winner', () => {
    expect(matchSting(0)).toBe(MATCH_WIN);
    expect(matchSting(1)).toBe(MATCH_LOSE);
    expect(matchSting('draw')).toBe(MATCH_DRAW);
  });
});

describe('mute', () => {
  it('applyMute copies the saved flag onto the synth', () => {
    const save = createMinigolfSave(createMemoryStorage());
    expect(applyMute(save)).toBe(false);
    expect(synth.muted).toBe(false);
    save.set({ muted: true });
    expect(applyMute(save)).toBe(true);
    expect(synth.muted).toBe(true);
    synth.muted = false;
  });

  it('toggleMute flips the save and the synth together', () => {
    const save = createMinigolfSave(createMemoryStorage());
    expect(toggleMute(save)).toBe(true);
    expect(save.get().muted).toBe(true);
    expect(synth.muted).toBe(true);
    expect(toggleMute(save)).toBe(false);
    expect(save.get().muted).toBe(false);
    expect(synth.muted).toBe(false);
  });

  it('toggleMute keeps the rest of the save intact', () => {
    const save = createMinigolfSave(createMemoryStorage());
    save.set({ wins: 3 });
    toggleMute(save);
    expect(save.get()).toMatchObject({ version: 1, wins: 3, muted: true });
    synth.muted = false;
  });

  it('labels follow the flag', () => {
    expect(muteLabel(false)).toBe('♪ ON');
    expect(muteLabel(true)).toBe('♪ OFF');
  });

  it('playTones is a no-op without an audio context', () => {
    expect(() => playTones(HOLE_OUT)).not.toThrow();
    expect(() => playTones(null)).not.toThrow();
    expect(() => playTones([])).not.toThrow();
    expect(() => playTones([shotTone(0.5)])).not.toThrow();
  });
});
