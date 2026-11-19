import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
import { rectFromCentre, uiTokens, type UiMode } from '@studio/ui';
import {
  getUiHost,
  prefersReducedMotion,
  watchReducedMotion,
  type ActionHandle,
} from '@studio/ui/dom';
import { UiButton, makeUiText } from '@studio/ui/phaser';
import { GAME_TITLE } from '../logic/config';
import { createMinigolfSave, formatRecord, isResumableMatch } from '../logic/save';
import type { PlaySceneData } from './PlayScene';
import { applyMute, muteLabel, synth, toggleMute } from './sound';
import { buildTitleCompact, type TitleCompactRefs } from '../ui/compact';
import { getPuttDuelDesktop, type PuttDuelDesktop } from '../ui/desktop';
import { soundActionLabel } from '../ui/soundLabel';

/** True when the URL carries a test jump (`?hole=` or `?seed=`). */
const urlJumpsToPlay = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.has('hole') || params.has('seed');
};

const visualHooks = (button: UiButton) => ({
  onPress: () => button.setPressed(true),
  onRelease: () => button.setPressed(false),
  onHover: (hover: boolean) => button.setHovered(hover),
  onFocus: (focused: boolean) => button.setFocused(focused),
});

/**
 * Title: game name, lifetime record, the Play / Continue buttons and the mute
 * toggle. Reads the save once on create; the Continue button only exists when
 * a match can be resumed. `?hole=` or `?seed=` in the URL skips straight to
 * `Play`.
 */
export class TitleScene extends Phaser.Scene {
  private save = createMinigolfSave();
  private muteButton!: UiButton;
  private playButton!: UiButton;
  private continueButton: UiButton | null = null;
  private muteAction: ActionHandle | null = null;
  private playAction: ActionHandle | null = null;
  private continueAction: ActionHandle | null = null;
  private readonly normalChrome: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> = [];
  private compact: TitleCompactRefs | null = null;
  private unwatchMode: (() => void) | null = null;
  private unwatchDesktop: (() => void) | null = null;
  private unwatchMotion: (() => void) | null = null;
  private desktop: PuttDuelDesktop | null = null;
  private desktopActive = false;
  private reducedMotion = false;

  constructor() {
    super('Title');
  }

  create(): void {
    const host = getUiHost();
    host?.markReady();
    if (urlJumpsToPlay()) {
      this.scene.start('Play');
      return;
    }

    this.cameras.main.setBackgroundColor(uiTokens.color.background);
    this.reducedMotion = prefersReducedMotion();
    this.save = createMinigolfSave();
    const data = this.save.get();
    const resumable = isResumableMatch(data.inProgress) ? data.inProgress : null;
    const muted = applyMute(this.save);
    const desktop = getPuttDuelDesktop();
    this.desktop = desktop;
    this.desktopActive = desktop?.active ?? false;

    // Browsers only allow audio after a user gesture: the first touch is it.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => synth.unlock());

    const cx = DESIGN_WIDTH / 2;

    // Decorative golf motif: kept in compact mode while text/actions move.
    const motif = this.add
      .circle(cx, 216, 80, Number.parseInt(uiTokens.color.surface.slice(1), 16))
      .setStrokeStyle(3, Number.parseInt(uiTokens.color.secondary.slice(1), 16), 1)
      .setName('motif');
    const cup = this.add.circle(cx, 216, 12, Number.parseInt(uiTokens.course.cup.slice(1), 16));
    const humanBall = this.add.circle(208, 244, 8, Number.parseInt(uiTokens.course.ballHuman.slice(1), 16));
    const botBall = this.add
      .circle(272, 244, 8, Number.parseInt(uiTokens.course.ballBot.slice(1), 16))
      .setStrokeStyle(2, Number.parseInt(uiTokens.course.ballBotEdge.slice(1), 16), 1);
    // Keep references alive for the scene lifetime; the motif is decorative.
    void cup;
    void humanBall;
    void botBall;

    this.muteButton = new UiButton(this, 420, 52, {
      label: this.soundLabel(muted),
      width: 72,
      height: 72,
      variant: 'sound',
      reducedMotion: this.reducedMotion,
    }).setName('muteButton');
    this.normalChrome.push(this.muteButton);

    const title = makeUiText(this, cx, 356, GAME_TITLE, 'display', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('title');
    const tagline = makeUiText(this, cx, 412, 'You vs the bot · 3 holes', 'body', uiTokens.color.muted, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('tagline');
    const record = makeUiText(this, cx, 464, formatRecord(data), 'label', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('record');
    const footer = makeUiText(this, cx, 756, 'Touch controls', 'caption', uiTokens.color.muted, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('footer');
    this.normalChrome.push(title, tagline, record, footer);

    this.playButton = new UiButton(this, cx, 568, {
      label: 'PLAY',
      width: 336,
      height: 80,
      variant: 'primary',
      reducedMotion: this.reducedMotion,
    }).setName('playButton');
    this.normalChrome.push(this.playButton);

    if (resumable) {
      this.continueButton = new UiButton(this, cx, 664, {
        label: `CONTINUE · HOLE ${resumable.holeIndex + 1}`,
        width: 336,
        height: 80,
        variant: 'secondary',
        reducedMotion: this.reducedMotion,
      }).setName('continueButton');
      this.normalChrome.push(this.continueButton);
    }

    if (host) {
      this.compact = buildTitleCompact(host.sidebar, {
        record: formatRecord(data),
        resumableHole: resumable ? resumable.holeIndex + 1 : null,
      });
      desktop?.showTitle({
        record: formatRecord(data),
        resumableHole: resumable ? resumable.holeIndex + 1 : null,
      });
      const actions = host.actions();
      this.muteAction = actions.register({
        id: 'muteButton',
        label: this.soundLabel(muted),
        accessibleLabel: soundActionLabel(muted),
        rect: rectFromCentre(420, 52, 72, 72),
        variant: 'sound',
        pressed: muted,
        panelParent: this.desktopActive && desktop ? desktop.titleSlots.sound : this.compact.soundSlot,
        onActivate: () => this.toggleMute(),
        onFirstGesture: () => synth.unlock(),
        ...visualHooks(this.muteButton),
      });
      this.muteButton.bindAction(this.muteAction);

      this.playAction = actions.register({
        id: 'playButton',
        label: 'PLAY',
        accessibleLabel: 'Play Putt Duel',
        rect: rectFromCentre(cx, 568, 336, 80),
        variant: 'primary',
        panelParent: this.desktopActive && desktop ? desktop.titleSlots.play : this.compact.playSlot,
        onActivate: () => {
          // A new match discards any saved one.
          this.save.set({ inProgress: null });
          this.scene.start('Play', {} satisfies PlaySceneData);
        },
        onFirstGesture: () => synth.unlock(),
        ...visualHooks(this.playButton),
      });
      this.playButton.bindAction(this.playAction);

      if (resumable && this.continueButton) {
        const hole = resumable.holeIndex + 1;
        this.continueAction = actions.register({
          id: 'continueButton',
          label: `CONTINUE · HOLE ${hole}`,
          accessibleLabel: `Continue saved match at hole ${hole}`,
          rect: rectFromCentre(cx, 664, 336, 80),
          variant: 'secondary',
          panelParent: this.desktopActive && desktop ? desktop.titleSlots.continue : this.compact.continueSlot,
          onActivate: () => this.scene.start('Play', { resume: resumable } satisfies PlaySceneData),
          onFirstGesture: () => synth.unlock(),
          ...visualHooks(this.continueButton),
        });
        this.continueButton.bindAction(this.continueAction);
      }

      this.applyMode(host.mode);
      this.applyDesktop(this.desktopActive);
      this.unwatchMode = host.onModeChange((mode) => this.applyMode(mode));
      this.unwatchDesktop = desktop?.onModeChange((active) => this.applyDesktop(active)) ?? null;
    }

    this.unwatchMotion = watchReducedMotion((reduced) => {
      this.reducedMotion = reduced;
      this.muteButton.setReducedMotion(reduced);
      this.playButton.setReducedMotion(reduced);
      this.continueButton?.setReducedMotion(reduced);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.muteAction?.destroy();
      this.playAction?.destroy();
      this.continueAction?.destroy();
      this.muteAction = null;
      this.playAction = null;
      this.continueAction = null;
      this.unwatchMode?.();
      this.unwatchMode = null;
      this.unwatchDesktop?.();
      this.unwatchDesktop = null;
      this.desktop = null;
      this.unwatchMotion?.();
      this.unwatchMotion = null;
      this.compact = null;
      getUiHost()?.sidebar.replaceChildren();
    });
  }

  private toggleMute(): void {
    toggleMute(this.save);
    this.updateMuteText();
  }

  private soundLabel(muted: boolean): string {
    return this.desktopActive ? (muted ? 'OFF' : 'ON') : muteLabel(muted);
  }

  private updateMuteText(): void {
    const muted = this.save.get().muted;
    this.muteButton.setLabel(this.soundLabel(muted));
    this.muteAction?.setAccessibleLabel(soundActionLabel(muted));
    this.muteAction?.setPressed(muted);
  }

  private applyDesktop(active: boolean): void {
    this.desktopActive = active;
    const data = this.save.get();
    const resumable = isResumableMatch(data.inProgress) ? data.inProgress : null;
    if (active) {
      this.desktop?.showTitle({
        record: formatRecord(data),
        resumableHole: resumable ? resumable.holeIndex + 1 : null,
      });
      if (this.desktop) {
        this.muteAction?.setPanelParent(this.desktop.titleSlots.sound);
        this.playAction?.setPanelParent(this.desktop.titleSlots.play!);
        this.continueAction?.setPanelParent(this.desktop.titleSlots.continue!);
      }
    } else if (this.compact) {
      this.muteAction?.setPanelParent(this.compact.soundSlot);
      this.playAction?.setPanelParent(this.compact.playSlot);
      this.continueAction?.setPanelParent(this.compact.continueSlot);
    }
    this.updateMuteText();
    this.applyMode(getUiHost()?.mode ?? 'normal');
  }

  private applyMode(mode: UiMode): void {
    const compact = mode === 'compact';
    for (const object of this.normalChrome) object.setVisible(!compact);
  }
}
