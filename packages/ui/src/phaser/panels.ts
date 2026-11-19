import Phaser from 'phaser';
import { uiTokens } from '../tokens';

export interface PanelOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  elevation?: 0 | 1 | 2;
  name?: string;
}

/**
 * A static rounded panel with a cached procedural silhouette. Drawing happens
 * once at creation; no per-frame blur, filter or draw work.
 */
export const drawPanel = (scene: Phaser.Scene, options: PanelOptions): Phaser.GameObjects.Graphics => {
  const {
    x, y, w, h,
    radius = uiTokens.radius.panel,
    fill = uiTokens.color.surface,
    stroke,
    strokeWidth = 1,
    elevation = 0,
    name,
  } = options;
  const g = scene.add.graphics();
  if (elevation > 0) {
    const shadow = elevation === 2 ? uiTokens.shadow.high : uiTokens.shadow.low;
    g.fillStyle(0x000000, shadow.alpha);
    g.fillRoundedRect(x, y + shadow.y, w, h, radius);
  }
  g.fillStyle(Number.parseInt(fill.slice(1), 16), 1);
  g.fillRoundedRect(x, y, w, h, radius);
  if (stroke) {
    g.lineStyle(strokeWidth, Number.parseInt(stroke.slice(1), 16), 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
  if (name) g.setName(name);
  return g;
};

/** Full-viewport modal backdrop; callers own depth and visibility. */
export const drawScrim = (
  scene: Phaser.Scene,
  width: number,
  height: number,
  name?: string,
): Phaser.GameObjects.Rectangle => {
  const scrim = scene.add
    .rectangle(width / 2, height / 2, width, height, Number.parseInt(uiTokens.color.scrim.slice(1), 16), uiTokens.opacity.scrim);
  if (name) scrim.setName(name);
  return scrim;
};
