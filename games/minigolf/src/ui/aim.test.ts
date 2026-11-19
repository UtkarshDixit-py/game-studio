import { describe, expect, it } from 'vitest';
import { AIM_LINE_LENGTH, AIM_LINE_MIN_LENGTH, aimLineLength } from './aim';

describe('aimLineLength', () => {
  it('keeps the full-power line and grows short pulls to a readable minimum', () => {
    expect(aimLineLength(1)).toBe(AIM_LINE_LENGTH);
    expect(aimLineLength(0.5)).toBe(60);
    expect(aimLineLength(0.25)).toBe(AIM_LINE_MIN_LENGTH);
    expect(aimLineLength(0.1)).toBe(AIM_LINE_MIN_LENGTH);
    expect(aimLineLength(0)).toBe(AIM_LINE_MIN_LENGTH);
  });

  it('keeps the drawing monotonic and inside the full-power length', () => {
    let previous = 0;
    for (const power of [0.05, 0.1, 0.25, 0.5, 0.75, 1]) {
      const length = aimLineLength(power);
      expect(length).toBeGreaterThanOrEqual(previous);
      expect(length).toBeLessThanOrEqual(AIM_LINE_LENGTH);
      previous = length;
    }
  });
});
