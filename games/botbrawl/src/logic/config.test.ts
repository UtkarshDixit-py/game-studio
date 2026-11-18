import { describe, expect, it } from 'vitest';
import { clamp } from '@studio/core';
import { GAME_ID, SAVE_KEY } from './config';

// Smoke test: the logic layer and @studio/core resolve in plain Node.
describe('botbrawl config', () => {
  it('has a stable id and save key', () => {
    expect(GAME_ID).toBe('botbrawl');
    expect(SAVE_KEY).toBe('botbrawl' + ':save');
  });

  it('can use core helpers', () => {
    expect(clamp(10, 0, 5)).toBe(5);
  });
});
