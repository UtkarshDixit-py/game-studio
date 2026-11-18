import Phaser from 'phaser';

export const MIN_TOUCH_SIZE = 56;

export interface BigButtonOptions {
  label: string;
  width?: number;
  height?: number;
  color?: number;
  textColor?: string;
  onTap: () => void;
}

/**
 * Thumb-friendly button: never smaller than 56x56, responds on pointerdown
 * (no hover), shrinks slightly while pressed.
 */
export class BigButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: BigButtonOptions) {
    super(scene, x, y);
    const width = Math.max(MIN_TOUCH_SIZE, opts.width ?? 240);
    const height = Math.max(MIN_TOUCH_SIZE, opts.height ?? 72);

    this.bg = scene.add.rectangle(0, 0, width, height, opts.color ?? 0x3b82f6).setStrokeStyle(3, 0xffffff, 0.25);
    const text = scene.add
      .text(0, 0, opts.label, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(height * 0.4)}px`,
        color: opts.textColor ?? '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add([this.bg, text]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: false });

    this.on('pointerdown', () => {
      this.setScale(0.94);
      opts.onTap();
    });
    const release = () => this.setScale(1);
    this.on('pointerup', release);
    this.on('pointerout', release);

    scene.add.existing(this);
  }

  setLabel(label: string): this {
    (this.getAt(1) as Phaser.GameObjects.Text).setText(label);
    return this;
  }
}
