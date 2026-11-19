import Phaser from 'phaser';
import { getUiFontFamily, uiTokens } from '../tokens';

export type UiTextToken = keyof typeof uiTokens.font.phaser;

export interface UiTextOptions {
  align?: 'left' | 'center' | 'right';
  wordWrapWidth?: number;
  maxLines?: number;
  originX?: number;
  originY?: number;
}

/** Phaser text style for one token: size, line box and weight. */
export const uiTextStyle = (
  token: UiTextToken,
  color: string,
  options: UiTextOptions = {},
): Phaser.Types.GameObjects.Text.TextStyle => {
  const [size, line, weight] = uiTokens.font.phaser[token];
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: getUiFontFamily(),
    fontSize: `${size}px`,
    fontStyle: String(weight),
    color,
    lineSpacing: Math.max(0, line - size),
    align: options.align ?? 'left',
  };
  if (options.wordWrapWidth !== undefined) {
    style.wordWrap = { width: options.wordWrapWidth, useAdvancedWrap: true };
  }
  if (options.maxLines !== undefined) style.maxLines = options.maxLines;
  return style;
};

/** Create crisp text with the session font and a token line box. */
export const makeUiText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  token: UiTextToken,
  color: string,
  options: UiTextOptions = {},
): Phaser.GameObjects.Text => {
  const text = scene.add
    .text(x, y, content, uiTextStyle(token, color, options))
    .setOrigin(options.originX ?? 0, options.originY ?? 0);
  text.setResolution(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
  return text;
};

/** Measured bounds after the session font was selected; useful in tests. */
export const measuredBounds = (text: Phaser.GameObjects.Text): Phaser.Geom.Rectangle => text.getBounds();
