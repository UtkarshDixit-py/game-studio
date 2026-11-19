import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phaserColor, uiTokens } from './tokens';

const css = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8');
const variables = new Map<string, string>();
for (const match of css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
  // Keep the first (root) declaration; the reduced-motion block repeats
  // motion variables with 0ms and must not overwrite the normal scale.
  if (!variables.has(match[1]!)) variables.set(match[1]!, match[2]!.trim());
}

const cssColor = (name: string): string => {
  const value = variables.get(name);
  if (!value) throw new Error(`missing --${name}`);
  return value.toUpperCase();
};

const normalizeFamily = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean);

const channel = (hex: string, offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
const linear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const luminance = (hex: string): number =>
  0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const colorPairs: Array<[string, string, string]> = [
  ['background', 'ui-background', uiTokens.color.background],
  ['surface', 'ui-surface', uiTokens.color.surface],
  ['raised', 'ui-raised', uiTokens.color.raised],
  ['separator', 'ui-separator', uiTokens.color.separator],
  ['outline', 'ui-outline', uiTokens.color.outline],
  ['text', 'ui-text', uiTokens.color.text],
  ['muted', 'ui-muted', uiTokens.color.muted],
  ['primary', 'ui-primary', uiTokens.color.primary],
  ['primaryHover', 'ui-primary-hover', uiTokens.color.primaryHover],
  ['primaryPressed', 'ui-primary-pressed', uiTokens.color.primaryPressed],
  ['onPrimary', 'ui-on-primary', uiTokens.color.onPrimary],
  ['secondary', 'ui-secondary', uiTokens.color.secondary],
  ['onSecondary', 'ui-on-secondary', uiTokens.color.onSecondary],
  ['accent', 'ui-accent', uiTokens.color.accent],
  ['success', 'ui-success', uiTokens.color.success],
  ['warning', 'ui-warning', uiTokens.color.warning],
  ['error', 'ui-error', uiTokens.color.error],
  ['disabled', 'ui-disabled', uiTokens.color.disabled],
  ['disabledText', 'ui-disabled-text', uiTokens.color.disabledText],
  ['scrim', 'ui-scrim', uiTokens.color.scrim],
  ['grass', 'course-grass', uiTokens.course.grass],
  ['wall', 'course-wall', uiTokens.course.wall],
  ['wallEdge', 'course-wall-edge', uiTokens.course.wallEdge],
  ['water', 'course-water', uiTokens.course.water],
  ['waterMark', 'course-water-mark', uiTokens.course.waterMark],
  ['sand', 'course-sand', uiTokens.course.sand],
  ['sandMark', 'course-sand-mark', uiTokens.course.sandMark],
  ['belt', 'course-belt', uiTokens.course.belt],
  ['beltMark', 'course-belt-mark', uiTokens.course.beltMark],
  ['portal', 'course-portal', uiTokens.course.portal],
  ['prop', 'course-prop', uiTokens.course.prop],
  ['propMark', 'course-prop-mark', uiTokens.course.propMark],
  ['star', 'course-star', uiTokens.course.star],
  ['cup', 'course-cup', uiTokens.course.cup],
  ['ballHuman', 'course-ball-human', uiTokens.course.ballHuman],
  ['ballBot', 'course-ball-bot', uiTokens.course.ballBot],
  ['ballBotEdge', 'course-ball-bot-edge', uiTokens.course.ballBotEdge],
];

describe('UI tokens', () => {
  it('keeps TypeScript and CSS colours in parity', () => {
    for (const [, cssName, value] of colorPairs) {
      expect(cssColor(cssName), cssName).toBe(value.toUpperCase());
    }
  });

  it('keeps font families, weights, spacing, radii and motion in parity', () => {
    expect(normalizeFamily(variables.get('ui-font')!)).toEqual(normalizeFamily(uiTokens.font.family));
    expect(normalizeFamily(variables.get('ui-font-fallback')!)).toEqual(normalizeFamily(uiTokens.font.fallback));
    expect(normalizeFamily(variables.get('ui-font-mono')!)).toEqual(normalizeFamily(uiTokens.font.mono));
    expect(variables.get('ui-weight-regular')).toBe(String(uiTokens.font.weight.regular));
    expect(variables.get('ui-weight-semibold')).toBe(String(uiTokens.font.weight.semibold));
    expect(variables.get('ui-weight-bold')).toBe(String(uiTokens.font.weight.bold));
    expect(variables.get('ui-weight-heavy')).toBe(String(uiTokens.font.weight.heavy));

    uiTokens.space.forEach((value, index) => {
      expect(variables.get(`ui-space-${index}`)).toBe(`${value}px`);
    });
    expect(variables.get('ui-radius-small')).toBe(`${uiTokens.radius.small}px`);
    expect(variables.get('ui-radius-button')).toBe(`${uiTokens.radius.button}px`);
    expect(variables.get('ui-radius-panel')).toBe(`${uiTokens.radius.panel}px`);
    expect(variables.get('ui-radius-pill')).toBe(`${uiTokens.radius.pill}px`);

    expect(variables.get('ui-press')).toBe(`${uiTokens.motion.press}ms`);
    expect(variables.get('ui-release')).toBe(`${uiTokens.motion.release}ms`);
    expect(variables.get('ui-screen')).toBe(`${uiTokens.motion.screen}ms`);
    expect(variables.get('ui-modal')).toBe(`${uiTokens.motion.modal}ms`);
    expect(variables.get('ui-toast')).toBe(`${uiTokens.motion.toast}ms`);
    expect(variables.get('ui-hint-dismiss')).toBe(`${uiTokens.motion.hintDismiss}ms`);
    expect(variables.get('ui-hole-squash')).toBe(`${uiTokens.motion.holeSquash}ms`);
    expect(variables.get('ui-ring-half-cycle')).toBe(`${uiTokens.motion.ringHalfCycle}ms`);
    expect(variables.get('ui-pointer-half-cycle')).toBe(`${uiTokens.motion.pointerHalfCycle}ms`);
    expect(Number(variables.get('ui-scrim-alpha'))).toBe(uiTokens.opacity.scrim);
    expect(variables.get('ui-control-min')).toBe(`${uiTokens.layout.controlMinCss}px`);
    expect(variables.get('ui-sidebar')).toBe(`${uiTokens.layout.sidebarCss}px`);
  });

  it('keeps the HTML type scale in parity', () => {
    const tokens = ['display', 'title', 'heading', 'body', 'label', 'caption', 'numeric'] as const;
    for (const token of tokens) {
      const [size, line] = uiTokens.font.html[token];
      expect(variables.get(`ui-${token}`), token).toBe(`${size}px`);
      expect(variables.get(`ui-${token}-line`), token).toBe(`${line}px`);
    }
  });

  it('meets the approved contrast pairs', () => {
    const pairs: Array<[string, string, number]> = [
      [uiTokens.color.text, uiTokens.color.background, 17.16],
      [uiTokens.color.text, uiTokens.color.surface, 14.68],
      [uiTokens.color.muted, uiTokens.color.surface, 8.94],
      [uiTokens.color.muted, uiTokens.color.raised, 7.30],
      [uiTokens.color.onPrimary, uiTokens.color.primary, 7.54],
      [uiTokens.color.onPrimary, uiTokens.color.primaryPressed, 5.48],
      [uiTokens.color.onSecondary, uiTokens.color.secondary, 10.79],
      [uiTokens.color.background, uiTokens.color.accent, 11.97],
      [uiTokens.color.error, uiTokens.color.surface, 7.82],
      [uiTokens.color.outline, uiTokens.color.surface, 4.04],
      [uiTokens.color.text, uiTokens.course.grass, 6.67],
      [uiTokens.course.wallEdge, uiTokens.course.grass, 4.06],
      [uiTokens.course.waterMark, uiTokens.course.water, 3.66],
      [uiTokens.course.beltMark, uiTokens.course.belt, 8.85],
    ];
    for (const [foreground, background, expected] of pairs) {
      const actual = contrast(foreground, background);
      expect(actual, `${foreground} on ${background}`).toBeCloseTo(expected, 1);
    }
  });

  it('converts only at the Phaser boundary', () => {
    expect(phaserColor('#A99CFF')).toBe(0xa99cff);
    expect(phaserColor('#10141F')).toBe(0x10141f);
  });
});
