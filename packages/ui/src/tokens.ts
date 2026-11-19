/**
 * Shared presentation tokens. Phaser-free and DOM-free: safe to import from
 * Node tests, game scenes and static tooling.
 *
 * `D` values are logical pixels in the 480x800 Phaser scene; CSS values are
 * browser layout pixels. They are deliberately not interchangeable.
 */
export const uiTokens = {
  color: {
    background: '#10141F', surface: '#1B2333', raised: '#263249',
    separator: '#34425B', outline: '#72829C', text: '#F4F7FF', muted: '#B8C4D9',
    primary: '#A99CFF', primaryHover: '#B9AEFF', primaryPressed: '#8F80EB',
    onPrimary: '#17152B', secondary: '#65DFBD', onSecondary: '#101A20',
    accent: '#FFC773', success: '#65DFBD', warning: '#FFC773', error: '#FF9AA8',
    disabled: '#34425B', disabledText: '#92A0B8', scrim: '#000000',
  },
  course: {
    grass: '#246342', wall: '#172334', wallEdge: '#B8C4D9',
    water: '#397EEB', waterMark: '#F4F7FF', sand: '#D9BE85', sandMark: '#493A22',
    belt: '#39465F', beltMark: '#F4F7FF', portal: '#BEA1FF',
    prop: '#F0A45D', propMark: '#49301E', star: '#FFD76A', cup: '#080D13',
    ballHuman: '#F4F7FF', ballBot: '#10141F', ballBotEdge: '#F4F7FF',
  },
  font: {
    family: '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    fallback: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    weight: { regular: 400, semibold: 600, bold: 700, heavy: 800 },
    phaser: {
      display: [48, 56, 800], title: [36, 44, 800], heading: [30, 38, 700],
      body: [24, 32, 400], label: [24, 28, 800], caption: [22, 26, 600],
      numeric: [32, 36, 800],
    },
    html: {
      display: [40, 48, 800], title: [32, 40, 800], heading: [24, 32, 700],
      body: [16, 24, 400], label: [16, 20, 800], caption: [14, 20, 600],
      numeric: [24, 28, 800],
    },
  },
  space: [0, 4, 8, 12, 16, 24, 32, 40, 48, 64],
  radius: { small: 8, button: 16, panel: 24, pill: 999 },
  shadow: {
    low: { x: 0, y: 4, blur: 12, alpha: 0.20 },
    high: { x: 0, y: 12, blur: 32, alpha: 0.32 },
  },
  motion: {
    press: 80, release: 120, screen: 180, modal: 160, toast: 140,
    hintDismiss: 700, holeSquash: 260, ringHalfCycle: 650, pointerHalfCycle: 420,
  },
  opacity: { scrim: 0.72 },
  layout: {
    designWidth: 480, designHeight: 800, controlMinD: 72,
    controlMinCss: 44, compactScaleThreshold: 0.625, sidebarCss: 224,
  },
} as const;

/** Convert only at the Phaser renderer boundary. Text uses the hex strings. */
export const phaserColor = (hex: string): number => Number.parseInt(hex.slice(1), 16);

/**
 * Font family chosen for this page session. `main.ts` sets it once after the
 * font readiness check so Phaser rasterises all text with one family and a
 * late webfont cannot reposition already-created text.
 */
let sessionFontFamily: string = uiTokens.font.family;

export const getUiFontFamily = (): string => sessionFontFamily;

export const setUiFontFamily = (family: string): void => {
  sessionFontFamily = family;
};
