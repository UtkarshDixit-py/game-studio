import { createRng } from '@studio/core';
import { describe, expect, it } from 'vitest';
import { stepRng } from './rng';

describe('stepRng', () => {
  it('matches createRng from core bit for bit over a long run', () => {
    for (const seed of [0, 1, 7, 12345, 0xffffffff, -1, 4294967296 + 9]) {
      const rng = createRng(seed);
      let state = seed;
      for (let i = 0; i < 200; i++) {
        const step = stepRng(state);
        expect(step.value).toBe(rng());
        state = step.state;
      }
    }
  });

  it('keeps the state as an unsigned 32-bit integer', () => {
    let state = 0xfffffff0;
    for (let i = 0; i < 50; i++) {
      state = stepRng(state).state;
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThan(4294967296);
    }
  });

  it('is pure: the same state always gives the same step', () => {
    expect(stepRng(42)).toEqual(stepRng(42));
    expect(stepRng(42).value).toBeGreaterThanOrEqual(0);
    expect(stepRng(42).value).toBeLessThan(1);
  });
});
