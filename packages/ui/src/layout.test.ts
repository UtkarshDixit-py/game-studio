import { describe, expect, it } from 'vitest';
import {
  clampLabelX,
  compactLayout,
  fitScale,
  meetsControlFloor,
  projectRect,
  rectFromCentre,
  safeSize,
  selectMode,
  sidebarWidth,
} from './layout';

describe('safe area and mode', () => {
  it('subtracts safe-area insets', () => {
    expect(safeSize({ width: 390, height: 844 }, { top: 47, right: 0, bottom: 34, left: 0 })).toEqual({
      width: 390,
      height: 763,
    });
    expect(safeSize({ width: 844, height: 390 }, { top: 24, right: 16, bottom: 34, left: 16 })).toEqual({
      width: 812,
      height: 332,
    });
  });

  it('selects normal portrait above the .625 scale cutoff', () => {
    expect(selectMode(320, 568)).toBe('normal');
    expect(selectMode(375, 812)).toBe('normal');
    expect(selectMode(480, 800)).toBe('normal');
    expect(selectMode(768, 1024)).toBe('normal');
    expect(selectMode(300, 800)).toBe('normal'); // exactly .625
  });

  it('selects compact for landscape and below the cutoff', () => {
    expect(selectMode(844, 390)).toBe('compact');
    expect(selectMode(640, 360)).toBe('compact');
    expect(selectMode(299, 800)).toBe('compact');
    expect(selectMode(320, 320)).toBe('compact');
  });

  it('computes the FIT scale and sidebar columns', () => {
    expect(fitScale(480, 800)).toBe(1);
    expect(fitScale(320, 800)).toBeCloseTo(2 / 3, 6);
    expect(sidebarWidth(844)).toBe(224);
    expect(sidebarWidth(300)).toBe(195);
    const layout = compactLayout(844);
    expect(layout.sidebar).toBe(224);
    expect(layout.stage).toBe(572);
    expect(layout.padding).toBe(16);
    expect(layout.gap).toBe(16);
  });
});

describe('action projection', () => {
  it('projects an unscaled rectangle through the canvas bounds', () => {
    const projected = projectRect(
      rectFromCentre(240, 568, 336, 80),
      { left: 10, top: 20, width: 320, height: 533.333 },
    );
    expect(projected.left).toBeCloseTo(58, 4);
    expect(projected.top).toBeCloseTo(372, 4);
    expect(projected.width).toBeCloseTo(224, 4);
    expect(projected.height).toBeCloseTo(53.333, 3);
  });

  it('measures the 44 CSS px control floor at runtime sizes', () => {
    const at320 = (d: number) => projectRect(rectFromCentre(240, 400, d, d), { left: 0, top: 0, width: 320, height: 533.33 });
    expect(meetsControlFloor(at320(72))).toBe(true);
    expect(at320(72).width).toBeCloseTo(48, 5);
    // The 56 D start zone is course data, not chrome: it is 37.33 CSS px at
    // 320-wide FIT and stays a documented exception.
    expect(meetsControlFloor(at320(56))).toBe(false);
    expect(at320(56).width).toBeCloseTo(37.333, 3);
  });

  it('clamps labels to the scene margin without moving geometry', () => {
    expect(clampLabelX(2, 30)).toBe(42);
    expect(clampLabelX(478, 30)).toBe(438);
    expect(clampLabelX(240, 30)).toBe(240);
  });
});
