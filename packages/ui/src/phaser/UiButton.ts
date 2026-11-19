import Phaser from 'phaser';
import type { ActionHandle } from '../dom/actions';
import { phaserColor, uiTokens } from '../tokens';
import { makeUiText } from './text';

export type UiButtonVariant = 'primary' | 'secondary' | 'sound';

export interface UiButtonOptions {
  label: string;
  width?: number;
  height?: number;
  variant?: UiButtonVariant;
  enabled?: boolean;
  reducedMotion?: boolean;
  elevation?: 0 | 1 | 2;
}

const RADIUS = uiTokens.radius.button;

/**
 * Rounded visual button. It owns no input by default: scenes bind a DOM
 * `ActionHandle` so pointer, keyboard and assistive activation share one path.
 * `setLabel` always notifies the bound action.
 */
export class UiButton extends Phaser.GameObjects.Container {
  readonly buttonWidth: number;
  readonly buttonHeight: number;
  private readonly variant: UiButtonVariant;
  private reducedMotion: boolean;
  private readonly elevation: 0 | 1 | 2;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private action: ActionHandle | null = null;
  private enabled: boolean;
  private pressed = false;
  private focused = false;
  private hovered = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options: UiButtonOptions) {
    super(scene, x, y);
    this.buttonWidth = Math.max(uiTokens.layout.controlMinD, options.width ?? 240);
    this.buttonHeight = Math.max(uiTokens.layout.controlMinD, options.height ?? 80);
    this.variant = options.variant ?? 'primary';
    this.enabled = options.enabled ?? true;
    this.reducedMotion = options.reducedMotion ?? false;
    this.elevation = options.elevation ?? (this.variant === 'primary' ? 1 : 0);

    this.shadow = scene.add.graphics();
    this.bg = scene.add.graphics();
    this.labelText = makeUiText(
      scene,
      0,
      0,
      options.label,
      this.variant === 'sound' ? 'caption' : 'label',
      this.variant === 'primary' ? uiTokens.color.onPrimary : uiTokens.color.text,
      { originX: 0.5, originY: 0.5, align: 'center' },
    );
    if (this.variant === 'sound') this.labelText.setFontStyle(String(uiTokens.font.weight.bold));
    this.add([this.shadow, this.bg, this.labelText]);
    this.setSize(this.buttonWidth, this.buttonHeight);
    this.redraw();
    scene.add.existing(this);
  }

  bindAction(action: ActionHandle): this {
    this.action = action;
    return this;
  }

  setLabel(label: string): this {
    if (this.destroyed) return this;
    this.labelText.setText(label);
    this.action?.setLabel(label);
    return this;
  }

  setEnabled(enabled: boolean): this {
    if (this.destroyed) return this;
    this.enabled = enabled;
    this.action?.setEnabled(enabled);
    this.redraw();
    return this;
  }

  setPressed(pressed: boolean): this {
    if (this.destroyed) return this;
    this.pressed = pressed;
    this.setScale(pressed && !this.reducedMotion ? 0.98 : 1);
    this.redraw();
    return this;
  }

  setReducedMotion(reduced: boolean): this {
    if (this.destroyed) return this;
    this.reducedMotion = reduced;
    if (reduced) this.setScale(1);
    return this;
  }

  setFocused(focused: boolean): this {
    if (this.destroyed) return this;
    this.focused = focused;
    this.redraw();
    return this;
  }

  setHovered(hovered: boolean): this {
    if (this.destroyed) return this;
    this.hovered = hovered;
    this.redraw();
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.destroyed = true;
    this.action = null;
    super.destroy(fromScene);
  }

  private redraw(): void {
    if (this.destroyed) return;
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const halfW = w / 2;
    const halfH = h / 2;
    this.shadow.clear();
    this.bg.clear();

    if (this.enabled && this.elevation > 0) {
      const shadow = this.elevation === 2 ? uiTokens.shadow.high : uiTokens.shadow.low;
      this.shadow.fillStyle(0x000000, shadow.alpha);
      this.shadow.fillRoundedRect(-halfW, -halfH + shadow.y, w, h, RADIUS);
    }

    let fill: string;
    let textColor: string;
    let stroke: string | null = null;
    if (!this.enabled) {
      fill = uiTokens.color.disabled;
      textColor = uiTokens.color.disabledText;
    } else if (this.variant === 'primary') {
      fill = this.pressed
        ? uiTokens.color.primaryPressed
        : this.hovered
          ? uiTokens.color.primaryHover
          : uiTokens.color.primary;
      textColor = uiTokens.color.onPrimary;
    } else {
      fill = this.hovered || this.pressed ? uiTokens.color.raised : uiTokens.color.surface;
      textColor = uiTokens.color.text;
      stroke = uiTokens.color.outline;
    }

    this.bg.fillStyle(phaserColor(fill), 1);
    this.bg.fillRoundedRect(-halfW, -halfH, w, h, RADIUS);
    if (stroke) {
      this.bg.lineStyle(1, phaserColor(stroke), 1);
      this.bg.strokeRoundedRect(-halfW, -halfH, w, h, RADIUS);
    }
    if (this.focused) {
      this.bg.lineStyle(2, phaserColor(uiTokens.color.background), 1);
      this.bg.strokeRoundedRect(-halfW - 3, -halfH - 3, w + 6, h + 6, RADIUS + 3);
      this.bg.lineStyle(3, phaserColor(uiTokens.color.text), 1);
      this.bg.strokeRoundedRect(-halfW - 6, -halfH - 6, w + 12, h + 12, RADIUS + 6);
    }
    this.labelText.setColor(textColor);
  }
}
