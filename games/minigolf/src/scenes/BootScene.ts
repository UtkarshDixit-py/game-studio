import Phaser from 'phaser';
import { SynthAudio, tones } from '@studio/core';
import { BigButton, DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
import { GAME_TITLE } from '../logic/config';

// Placeholder scene. Replace via tasks in TASKS.md; keep scenes thin and put
// rules in src/logic/.
export class BootScene extends Phaser.Scene {
  private readonly audio = new SynthAudio();
  private taps = 0;

  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1f6f3a');
    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.3, GAME_TITLE, {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const counter = this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.45, 'taps: 0', { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff' })
      .setOrigin(0.5)
      .setName('tapCounter');

    new BigButton(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.65, {
      label: 'TAP',
      onTap: () => {
        this.audio.unlock();
        this.audio.play(tones.tap);
        this.taps += 1;
        counter.setText(`taps: ${this.taps}`);
      },
    }).setName('tapButton');
  }
}
