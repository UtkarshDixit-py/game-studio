// Pure layout maths for the shared host and action overlay. No DOM, no Phaser.
import { uiTokens } from './tokens';

export type UiMode = 'normal' | 'compact';

export interface Size {
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProjectedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const emptyInsets = (): Insets => ({ top: 0, right: 0, bottom: 0, left: 0 });

/** Safe content size after CSS safe-area insets. */
export const safeSize = (viewport: Size, insets: Insets): Size => ({
  width: Math.max(0, viewport.width - insets.left - insets.right),
  height: Math.max(0, viewport.height - insets.top - insets.bottom),
});

/** The FIT scale of the 480x800 design into a safe rectangle. */
export const fitScale = (width: number, height: number): number =>
  Math.min(width / uiTokens.layout.designWidth, height / uiTokens.layout.designHeight);

/**
 * Normal portrait chrome while the safe area is portrait and the canvas scale
 * is at least .625; otherwise the native compact chrome takes over.
 */
export const selectMode = (safeWidth: number, safeHeight: number): UiMode => {
  if (safeWidth >= safeHeight) return 'compact';
  return fitScale(safeWidth, safeHeight) < uiTokens.layout.compactScaleThreshold ? 'compact' : 'normal';
};

/** Sidebar width: 224 CSS px, or 65% of a smaller safe width. */
export const sidebarWidth = (safeWidth: number): number =>
  Math.min(uiTokens.layout.sidebarCss, Math.max(0, safeWidth * 0.65));

export interface CompactLayout {
  sidebar: number;
  stage: number;
  gap: number;
  padding: number;
}

/** Columns for the tested landscape layout (16 px padding and gap). */
export const compactLayout = (safeWidth: number, gap = 16, padding = 16): CompactLayout => {
  const sidebar = sidebarWidth(safeWidth - padding * 2);
  const stage = Math.max(0, safeWidth - padding * 2 - gap - sidebar);
  return { sidebar, stage, gap, padding };
};

/** Project an unscaled scene rectangle into viewport CSS pixels. */
export const projectRect = (rect: Rect, canvas: CanvasRectLike): ProjectedRect => {
  const scale = canvas.width / uiTokens.layout.designWidth;
  return {
    left: canvas.left + rect.x * scale,
    top: canvas.top + rect.y * scale,
    width: rect.w * scale,
    height: rect.h * scale,
  };
};

/** A scene rectangle from a centre point, as the scene's buttons use. */
export const rectFromCentre = (x: number, y: number, w: number, h: number): Rect => ({
  x: x - w / 2,
  y: y - h / 2,
  w,
  h,
});

/** True when a projected control meets the 44 CSS px floor. */
export const meetsControlFloor = (rect: ProjectedRect): boolean =>
  rect.width + 1e-6 >= uiTokens.layout.controlMinCss && rect.height + 1e-6 >= uiTokens.layout.controlMinCss;

/**
 * Keep a label's centre inside the 12 D scene margin. Labels may move; the
 * authoritative ball, aim line and hit rectangles must not.
 */
export const clampLabelX = (x: number, halfWidth: number, margin = 12): number => {
  const min = margin + halfWidth;
  const max = uiTokens.layout.designWidth - margin - halfWidth;
  if (min > max) return uiTokens.layout.designWidth / 2;
  return Math.min(Math.max(x, min), max);
};

/** Page-zoom friendly reading width for static prose. */
export const readingWidth = (safeWidth: number, max = 880): number => Math.min(max, safeWidth);
