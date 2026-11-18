import Phaser from 'phaser';
import { BigButton, DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
import { GAME_TITLE } from '../logic/config';
import { createMinigolfSave, formatRecord, isResumableMatch } from '../logic/save';
import type { PlaySceneData } from './PlayScene';
import { applyMute, muteLabel, synth, toggleMute } from './sound';

const FONT = 'sans-serif';

const COLOURS = {
  background: 0x111218,
  text: '#ffffff',
  muted: '#aab2c2',
  accent: 0x4ade80,
  play: 0x3b82f6,
  resume: 0x16a34a,
  panel: 0x1c1f24,
};

/** True when the URL carries a test jump (`?hole=` or `?seed=`). */
const urlJumpsToPlay = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.has('hole') || params.has('seed');
};

/**
 * Title: game name, lifetime record, the Play / Continue buttons and the mute
 * toggle. Reads the save once on create; the Continue button only exists when
 * a match can be resumed. `?hole=` or `?seed=` in the URL skips straight to
 * `Play`.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    if (urlJumpsToPlay()) {
      this.scene.start('Play');
      return;
    }

    this.cameras.main.setBackgroundColor(COLOURS.background);
    const save = createMinigolfSave();
    const data = save.get();
    const resumable = isResumableMatch(data.inProgress) ? data.inProgress : null;
    const muted = applyMute(save);

    // Browsers only allow audio after a user gesture: the first touch is it.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => synth.unlock());

    const cx = DESIGN_WIDTH / 2;

    // Mute toggle, top-right, out of the way of the big buttons.
    const muteButton = new BigButton(this, DESIGN_WIDTH - 60, 48, {
      label: muteLabel(muted),
      width: 96,
      height: 56,
      color: COLOURS.panel,
      onTap: () => muteButton.setLabel(muteLabel(toggleMute(save))),
    }).setName('muteButton');

    // Decorative "hole" behind the name.
    this.add.circle(cx, 230, 92, 0x1c1f24).setStrokeStyle(4, COLOURS.accent, 1);
    this.add.circle(cx, 230, 14, 0x0b0d10);
    this.add.circle(cx - 40, 262, 8, 0xffffff);
    this.add.circle(cx + 40, 262, 8, 0x14161c).setStrokeStyle(2, 0xdfe6ea, 1);

    this.add
      .text(cx, 372, GAME_TITLE.toUpperCase(), { fontFamily: FONT, fontSize: '52px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('title');

    this.add
      .text(cx, 420, 'You vs the bot · 3 holes', { fontFamily: FONT, fontSize: '18px', color: COLOURS.muted })
      .setOrigin(0.5, 0.5)
      .setName('tagline');

    this.add
      .text(cx, 470, formatRecord(data), { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('record');

    new BigButton(this, cx, 580, {
      label: 'PLAY',
      width: 280,
      height: 72,
      color: COLOURS.play,
      onTap: () => {
        // A new match discards any saved one.
        save.set({ inProgress: null });
        this.scene.start('Play', {} satisfies PlaySceneData);
      },
    }).setName('playButton');

    if (resumable) {
      new BigButton(this, cx, 672, {
        label: `CONTINUE · HOLE ${resumable.holeIndex + 1}`,
        width: 280,
        height: 72,
        color: COLOURS.resume,
        onTap: () => this.scene.start('Play', { resume: resumable } satisfies PlaySceneData),
      }).setName('continueButton');
    }

    this.add
      .text(cx, DESIGN_HEIGHT - 28, 'Touch to play', { fontFamily: FONT, fontSize: '14px', color: COLOURS.muted })
      .setOrigin(0.5, 0.5);
  }
}
