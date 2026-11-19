import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
import { clampLabelX, phaserColor, rectFromCentre, uiTokens, type UiMode } from '@studio/ui';
import {
  getUiHost,
  prefersReducedMotion,
  watchReducedMotion,
  type ActionHandle,
  type UiHost,
} from '@studio/ui/dom';
import { UiButton, drawPanel, drawScrim, makeUiText } from '@studio/ui/phaser';
import type { Course } from '../logic/course';
import { HOLES } from '../logic/courses';
import {
  advance,
  createMatch,
  matchWinner,
  placeBall,
  shoot,
  stepMatch,
  type MatchState,
  type Player,
  type PlayerResult,
} from '../logic/match';
import { createAiOpponent, type Opponent } from '../logic/opponent';
import { BALL_RADIUS, FIXED_DT, isAtRest, type Ball, type BallEvent, type HoleFlags } from '../logic/physics';
import { createMinigolfSave, recordResult, type MinigolfSaveStore } from '../logic/save';
import { shotFromDrag, type Shot } from '../logic/shot';
import { CourseView } from './CourseView';
import { applyMute, holeSting, matchSting, muteLabel, playTones, shotTone, synth, toggleMute, tonesForEvent } from './sound';
import { buildPlayCompact, statusLabel, updatePlayCompact, type PlayCompactRefs } from '../ui/compact';
import { aimLineLength } from '../ui/aim';
import { BoardArtView, preloadDesktopBoardAssets } from '../ui/boardArt';
import { getPuttDuelDesktop, type PuttDuelDesktop } from '../ui/desktop';
import { soundActionLabel } from '../ui/soundLabel';

/** Scene data for `Play`: pass `resume` to pick up a saved match. */
export interface PlaySceneData {
  resume?: MatchState;
}

/** Where the course's top-left corner sits on the 480x800 screen. */
export const COURSE_ORIGIN = { x: 40, y: 150 } as const;

/** Never simulate more than this much real time in one frame. */
const MAX_FRAME_DT = 0.1;
/** Pause before the bot starts its turn, ms. */
const AI_THINK_DELAY_MS = 600;
/** How long the bot shows its aim line before shooting, ms. */
const AI_AIM_SHOW_MS = 500;
/** Seed used when the URL has no valid `?seed=`. */
const DEFAULT_SEED = 1;
/** Minimum gap between two wall taps so a rattling ball does not spam, ms. */
const WALL_TAP_GAP_MS = 70;
/** Screen y above which the turn pointer flips below the ball (HUD + margin). */
const POINTER_FLIP_Y = 210;

const PLAYERS: readonly Player[] = [0, 1];
const PLAYER_NAMES: readonly [string, string] = ['YOU', 'BOT'];

const CARD = { y: 8, w: 184, h: 112, left: 12, right: 284 } as const;
const cardX = (player: Player): number => (player === 0 ? CARD.left : CARD.right);

/** Parses `?seed=` from the page URL, falling back to `DEFAULT_SEED`. */
const seedFromUrl = (): number => {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const seed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(seed) ? seed : DEFAULT_SEED;
};

/**
 * Parses `?hole=N` (1-based, as shown to players) from the page URL into a
 * 0-based hole index, falling back to the first hole. `createMatch` clamps it.
 */
const holeIndexFromUrl = (): number => {
  const raw = new URLSearchParams(window.location.search).get('hole');
  const hole = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(hole) ? hole - 1 : 0;
};

interface PlayerCard {
  points: Phaser.GameObjects.Text;
  shots: Phaser.GameObjects.Text;
  turn: Phaser.GameObjects.Container;
}

/** The "your turn" bubble: a pill with text and a triangle pointing at the ball. */
interface TurnPointer {
  root: Phaser.GameObjects.Container;
  bob: Phaser.GameObjects.Container;
  pill: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Triangle;
}

type VisibleObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

/**
 * Thin scene: renders the course, both balls and the HUD, forwards touch input
 * to `match.ts`, advances the match physics in fixed slices and lets the AI
 * opponent take its turns on a timer. No rules live here.
 */
export class PlayScene extends Phaser.Scene {
  /** Holes in this match, in play order. */
  private readonly holes: readonly Course[] = HOLES;
  /** The course of the current hole: `holes[state.holeIndex]`. */
  private course!: Course;
  private readonly opponent: Opponent = createAiOpponent();
  private readonly save: MinigolfSaveStore = createMinigolfSave();
  /** Saved match handed in through scene data, consumed by `create`. */
  private resume: MatchState | null = null;

  private state!: MatchState;
  private accumulator = 0;
  /** True from `shoot` until the match leaves `rolling`, so the scene can react once. */
  private rolling = false;
  /** True while a bot turn is scheduled or in progress. */
  private aiBusy = false;
  /** Scene time of the last wall tap tone, for throttling. */
  private lastWallTapAt = -Infinity;
  /** Per player: true while the ball sprite is squashing into the cup. */
  private holing: [boolean, boolean] = [false, false];
  /** True once the hint band has faded (after the human's first settled shot). */
  private hintDismissed = false;

  private host: UiHost | null = null;
  private desktop: PuttDuelDesktop | null = null;
  private desktopActive = false;
  private boardArt: BoardArtView | null = null;
  private mode: UiMode = 'normal';
  private reducedMotion = false;
  private compact: PlayCompactRefs | null = null;
  private readonly normalHud: VisibleObject[] = [];
  private cardFrames!: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  private cards!: [PlayerCard, PlayerCard];
  private muteButton!: UiButton;
  private hintBg!: Phaser.GameObjects.Graphics;
  private hintLabel!: Phaser.GameObjects.Text;
  private holeBand!: Phaser.GameObjects.Container;
  private holeBandTitle!: Phaser.GameObjects.Text;
  private holeBandCourse!: Phaser.GameObjects.Text;
  private holeBandLines!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private holeBandPlayers!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private holeBandAwards!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private holeBandShown = false;
  private continueButton!: UiButton;
  private resultPanel!: Phaser.GameObjects.Container;
  private resultMotif!: Phaser.GameObjects.Graphics;
  private resultText!: Phaser.GameObjects.Text;
  private resultPoints!: Phaser.GameObjects.Text;
  private resultShown = false;
  private playAgainButton!: UiButton;
  private muteAction: ActionHandle | null = null;
  private continueAction: ActionHandle | null = null;
  private playAgainAction: ActionHandle | null = null;
  private unwatchMode: (() => void) | null = null;
  private unwatchDesktop: (() => void) | null = null;
  private unwatchDesktopLayout: (() => void) | null = null;
  private unwatchMotion: (() => void) | null = null;

  private courseView: CourseView | null = null;
  private ballSprites!: [Phaser.GameObjects.Arc, Phaser.GameObjects.Arc];
  private aimDot!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Graphics;
  private aimRing!: Phaser.GameObjects.Arc;
  private aimRingUnder!: Phaser.GameObjects.Arc;
  private powerLabel!: Phaser.GameObjects.Text;
  private turnPointer!: TurnPointer;
  private currentPower: number | null = null;

  private dragStart: { x: number; y: number } | null = null;
  private dragPointerId: number | null = null;
  private pendingShot: Shot | null = null;

  constructor() {
    super('Play');
  }

  init(data?: PlaySceneData): void {
    this.resume = data?.resume ?? null;
  }

  preload(): void {
    if (getPuttDuelDesktop()?.active) preloadDesktopBoardAssets(this);
  }

  create(): void {
    this.host = getUiHost();
    this.host?.markReady();
    this.desktop = getPuttDuelDesktop();
    this.desktopActive = this.desktop?.active ?? false;
    this.mode = this.host?.mode ?? 'normal';
    this.reducedMotion = prefersReducedMotion();
    this.cameras.main.setBackgroundColor(uiTokens.color.background);
    applyMute(this.save);

    // A resumed match is copied so the scene never mutates the save's object.
    this.state = this.resume
      ? (JSON.parse(JSON.stringify(this.resume)) as MatchState)
      : createMatch(seedFromUrl(), this.holes, holeIndexFromUrl());
    this.resume = null;
    this.accumulator = 0;
    // Saves never hold a roll, but if one did, let `update` settle and save it.
    this.rolling = this.state.phase === 'rolling';
    this.aiBusy = false;
    this.lastWallTapAt = -Infinity;
    this.holing = [false, false];
    this.hintDismissed = false;
    this.dragStart = null;
    this.dragPointerId = null;
    this.pendingShot = null;
    this.currentPower = null;
    this.holeBandShown = false;
    this.resultShown = false;
    this.normalHud.length = 0;

    this.loadCourse();

    const ball0 = this.add.circle(0, 0, BALL_RADIUS, phaserColor(uiTokens.course.ballHuman)).setName('ball0').setDepth(10).setVisible(false);
    const ball1 = this.add
      .circle(0, 0, BALL_RADIUS, phaserColor(uiTokens.course.ballBot))
      .setStrokeStyle(2, phaserColor(uiTokens.course.ballBotEdge), 1)
      .setName('ball1')
      .setDepth(10)
      .setVisible(false);
    this.ballSprites = [ball0, ball1];

    this.makeAimRing();
    this.aimDot = this.add
      .circle(0, 0, 6, phaserColor(uiTokens.color.muted))
      .setName('aimDot')
      .setDepth(20)
      .setVisible(false);
    this.aimLine = this.add.graphics().setName('aimLine').setDepth(15).setVisible(false);
    this.powerLabel = makeUiText(this, 0, 0, '0%', 'body', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    })
      .setFontStyle(String(uiTokens.font.weight.heavy))
      .setBackgroundColor(uiTokens.color.surface)
      .setPadding(8, 4, 8, 4)
      .setName('powerLabel')
      .setDepth(20)
      .setVisible(false);
    this.makeTurnPointer();

    this.cardFrames = [this.add.graphics(), this.add.graphics()];
    this.cards = [this.makeCard(0), this.makeCard(1)];
    this.makeMuteButton();
    this.makeHint();
    this.makeHoleBand();
    this.makeResultPanel();

    if (this.host) {
      this.compact = buildPlayCompact(this.host.sidebar);
      const actions = this.host.actions();
      this.muteAction = actions.register({
        id: 'muteButton',
        label: this.soundLabel(this.save.get().muted),
        accessibleLabel: soundActionLabel(this.save.get().muted),
        rect: rectFromCentre(DESIGN_WIDTH / 2, 64, 72, 72),
        variant: 'sound',
        pressed: this.save.get().muted,
        panelParent: this.desktopActive && this.desktop ? this.desktop.playSlots.sound : this.compact.soundSlot,
        onActivate: () => this.onToggleMute(),
        onFirstGesture: () => synth.unlock(),
        onPress: () => this.muteButton.setPressed(true),
        onRelease: () => this.muteButton.setPressed(false),
        onHover: (hover) => this.muteButton.setHovered(hover),
        onFocus: (focused) => this.muteButton.setFocused(focused),
      });
      this.muteButton.bindAction(this.muteAction);

      this.continueAction = actions.register({
        id: 'continueButton',
        label: 'CONTINUE',
        accessibleLabel: 'Continue to the next hole',
        rect: rectFromCentre(DESIGN_WIDTH / 2, 512, 336, 80),
        variant: 'primary',
        visible: false,
        onActivate: () => this.onContinue(),
        onFirstGesture: () => synth.unlock(),
        onPress: () => this.continueButton.setPressed(true),
        onRelease: () => this.continueButton.setPressed(false),
        onHover: (hover) => this.continueButton.setHovered(hover),
        onFocus: (focused) => this.continueButton.setFocused(focused),
      });
      this.continueButton.bindAction(this.continueAction);

      this.playAgainAction = actions.register({
        id: 'playAgainButton',
        label: 'PLAY AGAIN',
        accessibleLabel: 'Play again',
        rect: rectFromCentre(DESIGN_WIDTH / 2, 480, 336, 80),
        variant: 'primary',
        visible: false,
        onActivate: () => this.onPlayAgain(),
        onFirstGesture: () => synth.unlock(),
        onPress: () => this.playAgainButton.setPressed(true),
        onRelease: () => this.playAgainButton.setPressed(false),
        onHover: (hover) => this.playAgainButton.setHovered(hover),
        onFocus: (focused) => this.playAgainButton.setFocused(focused),
      });
      this.playAgainButton.bindAction(this.playAgainAction);

      this.applyMode(this.mode);
      this.applyDesktop(this.desktopActive);
      this.unwatchMode = this.host.onModeChange((mode) => this.applyMode(mode));
      this.unwatchDesktop = this.desktop?.onModeChange((active) => this.applyDesktop(active)) ?? null;
      this.unwatchDesktopLayout = this.desktop?.onLayout(() => { if (this.desktopActive) { this.cancelDrag(); this.refreshDesktop(); } }) ?? null;
    }

    this.unwatchMotion = watchReducedMotion((reduced) => this.applyReducedMotion(reduced));

    // Touch anywhere: the whole screen is the placement and aim surface.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);
      this.host?.actions().closeDialog();
      this.muteAction?.destroy();
      this.continueAction?.destroy();
      this.playAgainAction?.destroy();
      this.muteAction = null;
      this.continueAction = null;
      this.playAgainAction = null;
      this.unwatchMode?.();
      this.unwatchMode = null;
      this.unwatchDesktop?.();
      this.unwatchDesktop = null;
      this.unwatchDesktopLayout?.();
      this.unwatchDesktopLayout = null;
      this.setDesktopPointerListeners(false);
      this.boardArt?.destroy();
      this.boardArt = null;
      this.desktop = null;
      this.unwatchMotion?.();
      this.unwatchMotion = null;
      this.tweens.killTweensOf(this.aimRing);
      this.tweens.killTweensOf(this.aimRingUnder);
      this.tweens.killTweensOf(this.turnPointer.bob);
      this.compact = null;
      this.host?.sidebar.replaceChildren();
      this.host = null;
    });

    this.afterStateChange();
    if (!this.holeBandShown && !this.resultShown) {
      // A scene transition moves focus to the first available action.
      requestAnimationFrame(() => this.host?.actions().focus('muteButton'));
    }
  }

  override update(_time: number, deltaMs: number): void {
    if (this.state.phase !== 'rolling') {
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_DT);
    let stepped = false;
    const events: BallEvent[] = [];
    while (this.accumulator >= FIXED_DT && this.state.phase === 'rolling') {
      events.push(...stepMatch(this.state, this.course, FIXED_DT));
      this.accumulator -= FIXED_DT;
      stepped = true;
    }
    if (stepped) {
      this.playEvents(events);
      this.courseView?.setFlags(this.flags());
      this.boardArt?.setFlags(this.flags());
      this.syncBalls();
    }
    if (this.rolling && this.state.phase !== 'rolling') {
      this.rolling = false;
      this.afterStateChange();
      this.persist();
    }
  }

  /** Deep copy of the match state, for tests and HUD. */
  getState(): MatchState {
    return JSON.parse(JSON.stringify(this.state)) as MatchState;
  }

  /** Copy of the human's ball, or null until it is placed. */
  getBall(): Ball | null {
    const ball = this.state.hole.balls[0];
    return ball ? { ...ball } : null;
  }

  /** Desktop board-art seam for visual/e2e inspection. */
  getBoardArt(): BoardArtView | null {
    return this.boardArt;
  }

  /** True when nothing is rolling: the active ball is unplaced or at rest. */
  isBallAtRest(): boolean {
    const ball = this.state.hole.balls[this.state.activePlayer];
    return !ball || isAtRest(ball, this.course);
  }

  // ---------------------------------------------------------------- state flow

  private flags(): HoleFlags {
    return { brokenProps: this.state.hole.brokenProps, collectedStars: this.state.hole.collectedStars };
  }

  /**
   * Writes the match to the save. Called only once the match has settled:
   * after a turn (including into `holeOver`) and after Continue. Never during
   * a roll. At match over the result is recorded and `inProgress` cleared.
   */
  private persist(): void {
    const { phase } = this.state;
    if (phase === 'rolling') return;
    if (phase === 'matchOver') {
      recordResult(this.save, matchWinner(this.state));
      return;
    }
    this.save.set({ inProgress: this.getState() });
  }

  /**
   * Points `course` at the match's current hole and (re)builds its view. The
   * previous view, if any, is destroyed; ball sprites are re-synced by the
   * caller through `afterStateChange`.
   */
  private loadCourse(): void {
    this.course = this.holes[this.state.holeIndex] ?? this.holes[0]!;
    this.courseView?.destroy();
    this.boardArt?.destroy();
    this.boardArt = null;
    this.courseView = new CourseView(this, this.course, COURSE_ORIGIN.x, COURSE_ORIGIN.y);
    this.add.existing(this.courseView);
    this.courseView.setFlags(this.flags());
    if (this.desktopActive) {
      this.courseView.setVisible(!this.ensureBoardArt());
    }
    this.applyCourseChrome();
  }

  /** Called whenever the match settles into a new phase outside `rolling`. */
  private afterStateChange(): void {
    this.syncBalls();
    this.refreshHud();
    const { phase, activePlayer } = this.state;
    if (phase === 'holeOver') {
      this.showHoleBand();
      playTones(holeSting(this.state.hole.lastResult));
    } else if (phase === 'matchOver') {
      this.showResultPanel();
      playTones(matchSting(matchWinner(this.state)));
    } else if (activePlayer === 1 && (phase === 'placing' || phase === 'aiming')) {
      this.scheduleAiTurn();
    }
    this.announceState();
  }

  private scheduleAiTurn(): void {
    if (this.aiBusy) return;
    this.aiBusy = true;
    this.time.delayedCall(AI_THINK_DELAY_MS, () => {
      if (this.state.activePlayer !== 1) {
        this.aiBusy = false;
        return;
      }
      if (this.state.phase === 'placing') {
        placeBall(this.state, this.course, this.opponent.choosePlacement(this.state, this.course));
        this.syncBalls();
        this.refreshHud();
      }
      if (this.state.phase !== 'aiming') {
        this.aiBusy = false;
        return;
      }
      const shot = this.opponent.chooseShot(this.state, this.course);
      const sprite = this.ballSprites[1];
      this.renderAim(shot, sprite.x, sprite.y);
      this.time.delayedCall(AI_AIM_SHOW_MS, () => {
        this.hideAim();
        this.aiBusy = false;
        if (this.state.phase === 'aiming' && this.state.activePlayer === 1) this.fire(shot);
      });
    });
  }

  private fire(shot: Shot): void {
    shoot(this.state, shot);
    if (this.state.phase === 'rolling') {
      this.rolling = true;
      synth.play(shotTone(shot.power));
    }
    this.refreshHud();
  }

  private onContinue(): void {
    if (this.state.phase !== 'holeOver') return;
    this.hideHoleBand();
    const previous = this.state.holeIndex;
    advance(this.state, this.holes.length);
    if (this.state.holeIndex !== previous) {
      this.loadCourse();
    } else {
      this.courseView?.setFlags(this.flags());
      this.boardArt?.setFlags(this.flags());
    }
    this.afterStateChange();
    this.persist();
  }

  private onPlayAgain(): void {
    this.host?.actions().closeDialog();
    // Fresh data so a resumed match is not resumed again.
    this.scene.restart({} satisfies PlaySceneData);
  }

  private onToggleMute(): void {
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

  private ensureBoardArt(): boolean {
    if (this.boardArt) return true;
    if (!this.course) return false;
    if (!this.textures.exists(`pd-h${this.state.holeIndex + 1}-base`)) return false;
    this.boardArt = new BoardArtView(this, this.course, this.state.holeIndex, this.reducedMotion);
    this.boardArt.setFlags(this.flags());
    return true;
  }

  private refreshDesktop(): void {
    if (!this.desktopActive || !this.desktop) return;
    const { hole, points, activePlayer, phase, holeIndex } = this.state;
    this.desktop.updatePlay({
      holeIndex,
      courseName: this.course.name,
      cap: this.course.cap,
      points,
      shots: hole.shots,
      results: hole.result,
      activePlayer,
      phase,
      power: this.currentPower,
    });
    this.boardArt?.setPlacementVisible(phase === 'placing' && activePlayer === 0);
  }

  private applyDesktop(active: boolean): void {
    this.desktopActive = active;
    if (active && this.desktop) {
      this.courseView?.setVisible(!this.ensureBoardArt());
      this.desktop.showPlay();
      this.powerLabel.setVisible(false);
      this.muteAction?.setPanelParent(this.desktop.playSlots.sound);
      this.aimRing.setStrokeStyle(2, phaserColor('#F2B23E'), 0.9);
      this.aimRingUnder.setVisible(false);
      this.turnPointer.root.setVisible(false);
      this.ballSprites?.forEach((sprite) => sprite.setAlpha(0));
      this.setDesktopPointerListeners(true);
    } else {
      this.boardArt?.destroy();
      this.boardArt = null;
      this.courseView?.setVisible(true);
      this.muteAction?.setPanelParent(this.compact?.soundSlot ?? this.host?.sidebar ?? document.body);
      this.aimRing.setStrokeStyle(2, phaserColor(uiTokens.color.secondary), 0.9);
      this.aimRingUnder.setVisible(false);
      this.ballSprites?.forEach((sprite) => sprite.setAlpha(1));
      this.setDesktopPointerListeners(false);
    }
    this.updateMuteText();
    this.applyMode(this.mode);
    this.refreshHud();
  }

  private setDesktopPointerListeners(active: boolean): void {
    if (active) {
      // Window-level events let a board drag continue past the clipped board,
      // including the release, so the full 180-unit pull is reachable.
      window.addEventListener('pointermove', this.onDesktopPointerMove);
      window.addEventListener('pointerup', this.onDesktopPointerUp);
      window.addEventListener('pointercancel', this.onDesktopPointerCancel);
      window.addEventListener('blur', this.onDesktopBlur);
      window.addEventListener('resize', this.onDesktopResize);
      window.addEventListener('orientationchange', this.onDesktopResize);
    } else {
      window.removeEventListener('pointermove', this.onDesktopPointerMove);
      window.removeEventListener('pointerup', this.onDesktopPointerUp);
      window.removeEventListener('pointercancel', this.onDesktopPointerCancel);
      window.removeEventListener('blur', this.onDesktopBlur);
      window.removeEventListener('resize', this.onDesktopResize);
      window.removeEventListener('orientationchange', this.onDesktopResize);
    }
  }

  private readonly onDesktopPointerMove = (event: PointerEvent): void => {
    if (!this.desktopActive) return;
    if (!this.dragStart) return;
    // A missed window release must not leave the drag following a free cursor.
    if (event.buttons === 0) {
      this.cancelDrag();
      return;
    }
    this.updateDragFromClient(event.clientX, event.clientY, event.pointerId);
  };

  private readonly onDesktopPointerUp = (event: PointerEvent): void => {
    if (!this.desktopActive || !this.dragStart) return;
    if (this.dragPointerId !== null && event.pointerId !== this.dragPointerId) return;
    this.updateDragFromClient(event.clientX, event.clientY, event.pointerId);
    this.onPointerUp();
  };

  private readonly onDesktopPointerCancel = (): void => {
    if (!this.desktopActive) return;
    this.cancelDrag();
  };

  private readonly onDesktopBlur = (): void => {
    if (!this.desktopActive) return;
    this.cancelDrag();
  };

  private readonly onDesktopResize = (): void => {
    if (!this.desktopActive) return;
    this.cancelDrag();
  };

  /**
   * Projects a window pointer position into the 480x800 game space. Unlike the
   * Phaser pointer, this keeps updating after the pointer leaves the clipped
   * board, without changing the shot maths.
   */
  private updateDragFromClient(clientX: number, clientY: number, pointerId: number): void {
    if (!this.dragStart) return;
    if (this.dragPointerId !== null && pointerId !== this.dragPointerId) return;
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = {
      x: ((clientX - rect.left) / rect.width) * DESIGN_WIDTH,
      y: ((clientY - rect.top) / rect.height) * DESIGN_HEIGHT,
    };
    this.pendingShot = shotFromDrag(this.dragStart, point);
    const sprite = this.ballSprites[0];
    this.renderAim(this.pendingShot, sprite.x, sprite.y);
  }

  private cancelDrag(): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    this.dragPointerId = null;
    this.pendingShot = null;
    this.aimDot.setVisible(false);
    this.hideAim();
  }

  // --------------------------------------------------------------------- audio

  /** Plays the tones for one frame's physics events; wall taps are throttled. */
  private playEvents(events: readonly BallEvent[]): void {
    let wallTapped = false;
    for (const event of events) {
      if (event === 'wall') {
        if (wallTapped || this.time.now - this.lastWallTapAt < WALL_TAP_GAP_MS) continue;
        wallTapped = true;
        this.lastWallTapAt = this.time.now;
      }
      playTones(tonesForEvent(event));
    }
  }

  // --------------------------------------------------------------------- input

  private onPointerDown(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
    // Browsers only allow audio after a user gesture: the first touch is it.
    synth.unlock();
    // Taps on buttons are theirs alone.
    if (currentlyOver.length > 0) return;
    const { phase, activePlayer } = this.state;
    if (activePlayer !== 0) return;

    if (phase === 'placing') {
      placeBall(this.state, this.course, {
        x: pointer.x - COURSE_ORIGIN.x,
        y: pointer.y - COURSE_ORIGIN.y,
      });
      if (this.state.phase === 'aiming') {
        this.syncBalls();
        this.refreshHud();
      }
      return;
    }

    if (phase !== 'aiming' || this.dragStart) return;
    this.dragStart = { x: pointer.x, y: pointer.y };
    // Phaser keeps the DOM pointerId for touch but not for mouse; null means
    // the desktop window handlers accept the primary mouse pointer.
    this.dragPointerId = pointer.pointerId ?? null;
    this.pendingShot = null;
    this.currentPower = null;
    // The desktop tabletop uses the amber ring and tapered line; the legacy
    // drag-origin dot would add an unrelated ball-like mark to the board.
    this.aimDot.setPosition(pointer.x, pointer.y).setVisible(!this.desktopActive);
    // The player has taken control: the pointer has done its job.
    this.turnPointer.root.setVisible(false);
    this.refreshCompact();
    this.refreshDesktop();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragStart || !pointer.isDown) return;
    // Desktop tracks on window events so the pull and release keep working
    // outside the clipped board.
    if (this.desktopActive) return;
    this.pendingShot = shotFromDrag(this.dragStart, { x: pointer.x, y: pointer.y });
    const sprite = this.ballSprites[0];
    this.renderAim(this.pendingShot, sprite.x, sprite.y);
  }

  private onGameOut(): void {
    // Desktop keeps the pointer until the window-level release so leaving the
    // clipped canvas does not fire a shot early. The phone fallback keeps its
    // existing input-outside release behavior.
    if (this.desktopActive) return;
    this.onPointerUp();
  }

  private onPointerUp(pointer?: Phaser.Input.Pointer): void {
    if (!this.dragStart) return;
    const shot = this.pendingShot;
    const canceled = pointer?.wasCanceled === true;
    this.dragStart = null;
    this.dragPointerId = null;
    this.pendingShot = null;
    this.aimDot.setVisible(false);
    this.hideAim();
    if (!canceled && shot && this.state.phase === 'aiming' && this.state.activePlayer === 0) {
      this.fire(shot);
    }
  }

  // ----------------------------------------------------------------- rendering

  /**
   * Moves the ball sprites to the logical balls. A ball that has just been
   * holed squashes and fades into the cup instead of vanishing; the logical
   * ball is untouched. Reduced motion hides it immediately.
   */
  private syncBalls(): void {
    for (const player of PLAYERS) {
      const ball = this.state.hole.balls[player];
      const sprite = this.ballSprites[player];
      if (!ball) {
        this.resetBallSprite(player);
        sprite.setVisible(false);
        this.boardArt?.hideBall(player);
        continue;
      }
      if (ball.holed) {
        if (this.reducedMotion) {
          this.resetBallSprite(player);
          sprite.setVisible(false);
          this.boardArt?.hideBall(player);
          continue;
        }
        if (sprite.visible && !this.holing[player]) this.squashIntoHole(player);
        continue;
      }
      this.resetBallSprite(player);
      sprite.setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y).setVisible(true);
      this.boardArt?.setBall(player, ball.x, ball.y, true);
    }
  }

  /** Stops any hole animation on a ball sprite and restores its shape. */
  private resetBallSprite(player: Player): void {
    if (!this.holing[player]) return;
    const sprite = this.ballSprites[player];
    this.tweens.killTweensOf(sprite);
    this.holing[player] = false;
    this.boardArt?.resetBall(player);
    sprite.setScale(1).setAlpha(this.desktopActive ? 0 : 1);
  }

  /** Squash-and-fade tween on the ball sprite only; ends with the sprite hidden. */
  private squashIntoHole(player: Player): void {
    const sprite = this.ballSprites[player];
    this.holing[player] = true;
    this.boardArt?.squashBall(player, this.course.hole.x, this.course.hole.y, uiTokens.motion.holeSquash, () => undefined);
    this.tweens.add({
      targets: sprite,
      x: COURSE_ORIGIN.x + this.course.hole.x,
      y: COURSE_ORIGIN.y + this.course.hole.y,
      scaleX: 1.3,
      scaleY: 0.4,
      alpha: 0,
      duration: uiTokens.motion.holeSquash,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.holing[player]) return;
        this.holing[player] = false;
        sprite.setVisible(false).setScale(1).setAlpha(1);
      },
    });
  }

  private makeAimRing(): void {
    this.aimRingUnder = this.add
      .circle(0, 0, BALL_RADIUS + 7)
      .setStrokeStyle(4, phaserColor('#5A3C05'), 0.55)
      .setName('decor-aim-ring-ink')
      .setDepth(8)
      .setVisible(false);
    this.aimRing = this.add
      .circle(0, 0, BALL_RADIUS + 7)
      .setStrokeStyle(2, phaserColor(uiTokens.color.secondary), 0.9)
      .setName('aimRing')
      .setDepth(9)
      .setVisible(false);
    this.startRingTween();
  }

  private startRingTween(): void {
    this.tweens.killTweensOf(this.aimRing);
    this.tweens.killTweensOf(this.aimRingUnder);
    this.aimRing.setScale(1).setAlpha(0.9);
    this.aimRingUnder.setScale(1).setAlpha(0.55);
    if (this.reducedMotion) return;
    this.tweens.add({
      targets: this.aimRing,
      scale: { from: 1, to: 1.4 },
      alpha: { from: 0.95, to: 0.35 },
      duration: uiTokens.motion.ringHalfCycle,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.tweens.add({
      targets: this.aimRingUnder,
      scale: { from: 1, to: 1.4 },
      alpha: { from: 0.55, to: 0.15 },
      duration: uiTokens.motion.ringHalfCycle,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Shows the pulsing ring around the active ball while it is being aimed. */
  private refreshAimRing(): void {
    const { phase, activePlayer } = this.state;
    const ball = this.state.hole.balls[activePlayer];
    if (phase !== 'aiming' || !ball || ball.holed) {
      this.aimRing.setVisible(false);
      this.aimRingUnder.setVisible(false);
      return;
    }
    this.aimRing.setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y).setVisible(true);
    this.aimRingUnder
      .setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y)
      .setVisible(this.desktopActive);
  }

  private makeTurnPointer(): void {
    const pill = this.add.graphics();
    pill.fillStyle(phaserColor(uiTokens.color.secondary), 1);
    pill.fillRoundedRect(-72, -18, 144, 36, 18);
    const label = makeUiText(this, 0, 0, 'YOUR TURN', 'caption', uiTokens.color.onSecondary, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    })
      .setFontStyle(String(uiTokens.font.weight.bold));
    // Points down at the ball by default; rotated 180° when shown below it.
    const arrow = this.add
      .triangle(0, 0, 0, 0, 14, 0, 7, 10, phaserColor(uiTokens.color.secondary))
      .setOrigin(0.5, 0.5);
    const bob = this.add.container(0, 0, [pill, label, arrow]);
    const root = this.add.container(0, 0, [bob]).setName('turnPointer').setDepth(35).setVisible(false);
    this.turnPointer = { root, bob, pill, label, arrow };
    this.startPointerTween();
  }

  private startPointerTween(): void {
    this.tweens.killTweensOf(this.turnPointer.bob);
    this.turnPointer.bob.y = 0;
    if (this.reducedMotion) return;
    this.tweens.add({
      targets: this.turnPointer.bob,
      y: { from: 0, to: -6 },
      duration: uiTokens.motion.pointerHalfCycle,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Shows the "your turn" bubble over the human's ball when control returns. */
  private refreshTurnPointer(): void {
    if (this.desktopActive) {
      this.turnPointer.root.setVisible(false);
      return;
    }
    const { phase, activePlayer } = this.state;
    const ball = this.state.hole.balls[0];
    const { root, pill, label, arrow } = this.turnPointer;
    if (phase !== 'aiming' || activePlayer !== 0 || !ball || ball.holed || this.dragStart) {
      root.setVisible(false);
      return;
    }
    const bx = COURSE_ORIGIN.x + ball.x;
    const by = COURSE_ORIGIN.y + ball.y;
    const below = by < POINTER_FLIP_Y;
    const sign = below ? 1 : -1;
    // Keep the pill inside the 12 D margin while the arrow stays over the ball.
    const pillShift = clampLabelX(bx, 72) - bx;
    arrow.setPosition(0, sign * 20).setAngle(below ? 180 : 0);
    pill.setPosition(pillShift, sign * 40);
    label.setPosition(pillShift, sign * 40);
    root.setPosition(bx, by).setVisible(true);
  }

  private makeCard(player: Player): PlayerCard {
    const x = cardX(player);
    const frame = this.cardFrames[player];
    const frameContainer = this.add.container(x, CARD.y, [frame]).setName(`card${player}`).setDepth(30);

    const name = makeUiText(this, x + 14, CARD.y + 12, PLAYER_NAMES[player], 'label', uiTokens.color.text, {
      originX: 0,
      originY: 0,
    })
      .setFontStyle(String(uiTokens.font.weight.bold))
      .setDepth(31);
    const badge = this.add
      .circle(x + CARD.w - 30, CARD.y + 28, 20, phaserColor(uiTokens.color.primary))
      .setDepth(31);
    const points = makeUiText(this, x + CARD.w - 30, CARD.y + 28, '0', 'numeric', uiTokens.color.onPrimary, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    })
      .setFontSize(28)
      .setName(`points${player}`)
      .setDepth(32);
    const shots = makeUiText(this, x + 14, CARD.y + 48, 'SHOT 0', 'label', uiTokens.color.muted, {
      originX: 0,
      originY: 0,
    })
      .setFontStyle(String(uiTokens.font.weight.regular))
      .setName(`shots${player}`)
      .setDepth(31);
    const turn = this.add.container(x + 14, CARD.y + 80).setName(`turn${player}`).setDepth(31).setVisible(false);
    const pill = this.add.graphics();
    pill.fillStyle(phaserColor(uiTokens.color.secondary), 1);
    pill.fillRoundedRect(0, 0, 92, 24, 12);
    const turnText = makeUiText(this, 46, 12, 'TURN', 'caption', uiTokens.color.onSecondary, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    })
      .setFontStyle(String(uiTokens.font.weight.bold))
      .setFontSize(22);
    turn.add([pill, turnText]);

    this.normalHud.push(frameContainer, name, badge, points, shots, turn);
    this.drawCardFrame(player, false);
    return { points, shots, turn };
  }

  private drawCardFrame(player: Player, active: boolean): void {
    const g = this.cardFrames[player];
    g.clear();
    g.fillStyle(0x000000, uiTokens.shadow.low.alpha);
    g.fillRoundedRect(0, uiTokens.shadow.low.y, CARD.w, CARD.h, uiTokens.radius.button);
    g.fillStyle(phaserColor(uiTokens.color.surface), 1);
    g.fillRoundedRect(0, 0, CARD.w, CARD.h, uiTokens.radius.button);
    g.lineStyle(active ? 2 : 1, phaserColor(active ? uiTokens.color.secondary : uiTokens.color.separator), 1);
    g.strokeRoundedRect(0, 0, CARD.w, CARD.h, uiTokens.radius.button);
  }

  /** Mute toggle in the gap between the two HUD cards. */
  private makeMuteButton(): void {
    this.muteButton = new UiButton(this, DESIGN_WIDTH / 2, 64, {
      label: muteLabel(this.save.get().muted),
      width: 72,
      height: 72,
      variant: 'sound',
      reducedMotion: this.reducedMotion,
    })
      .setName('muteButton')
      .setDepth(31);
    this.normalHud.push(this.muteButton);
  }

  private makeHint(): void {
    this.hintBg = drawPanel(this, {
      x: DESIGN_WIDTH / 2 - 220,
      y: 760 - 32,
      w: 440,
      h: 64,
      radius: uiTokens.radius.button,
      fill: uiTokens.color.surface,
      elevation: 0,
      name: 'hintBand',
    }).setDepth(30);
    this.hintLabel = makeUiText(this, DESIGN_WIDTH / 2, 760, '', 'label', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
      wordWrapWidth: 408,
    })
      .setFontStyle(String(uiTokens.font.weight.regular))
      .setName('hintLabel')
      .setDepth(31);
    this.normalHud.push(this.hintBg, this.hintLabel);
  }

  /** Fades the hint band out once and keeps it hidden for the rest of the match. */
  private dismissHint(): void {
    if (this.hintDismissed) return;
    this.hintDismissed = true;
    const targets = [this.hintBg, this.hintLabel];
    if (this.reducedMotion) {
      for (const target of targets) target.setVisible(false);
      return;
    }
    this.tweens.add({
      targets,
      alpha: 0,
      duration: uiTokens.motion.hintDismiss,
      ease: 'Quad.easeOut',
      onComplete: () => {
        for (const target of targets) target.setVisible(false);
      },
    });
  }

  private makeHoleBand(): void {
    const scrim = drawScrim(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const panel = drawPanel(this, {
      x: 40,
      y: 220,
      w: 400,
      h: 360,
      radius: uiTokens.radius.panel,
      fill: uiTokens.color.surface,
      stroke: uiTokens.color.outline,
      elevation: 2,
    });
    this.holeBandTitle = makeUiText(this, 72, 244, '', 'heading', uiTokens.color.text, {
      originX: 0,
      originY: 0,
    }).setName('holeBandTitle');
    this.holeBandCourse = makeUiText(this, 72, 280, '', 'body', uiTokens.color.muted, {
      originX: 0,
      originY: 0,
    }).setName('holeBandCourse');

    const rowBg0 = drawPanel(this, {
      x: 72, y: 336, w: 336, h: 48, radius: uiTokens.radius.small, fill: uiTokens.color.raised, elevation: 0,
    });
    const rowBg1 = drawPanel(this, {
      x: 72, y: 392, w: 336, h: 48, radius: uiTokens.radius.small, fill: uiTokens.color.raised, elevation: 0,
    });
    const makeRowText = (x: number, y: number, token: 'label' | 'caption' | 'body', name: string, align: 'left' | 'right') =>
      makeUiText(this, x, y, '', token, uiTokens.color.text, {
        originX: align === 'right' ? 1 : 0,
        originY: 0.5,
        align,
      }).setName(name);
    this.holeBandPlayers = [
      makeRowText(88, 360, 'label', 'holeBandPlayer0', 'left'),
      makeRowText(88, 416, 'label', 'holeBandPlayer1', 'left'),
    ];
    this.holeBandLines = [
      makeRowText(164, 360, 'caption', 'holeBandLine0', 'left'),
      makeRowText(164, 416, 'caption', 'holeBandLine1', 'left'),
    ];
    this.holeBandAwards = [
      makeRowText(392, 360, 'body', 'holeBandAward0', 'right'),
      makeRowText(392, 416, 'body', 'holeBandAward1', 'right'),
    ];

    this.holeBand = this.add
      .container(0, 0, [
        scrim,
        panel,
        this.holeBandTitle,
        this.holeBandCourse,
        rowBg0,
        rowBg1,
        ...this.holeBandPlayers,
        ...this.holeBandLines,
        ...this.holeBandAwards,
      ])
      .setName('holeBand')
      .setDepth(80)
      .setVisible(false);

    this.continueButton = new UiButton(this, DESIGN_WIDTH / 2, 512, {
      label: 'CONTINUE',
      width: 336,
      height: 80,
      variant: 'primary',
      reducedMotion: this.reducedMotion,
    })
      .setName('continueButton')
      .setDepth(83)
      .setVisible(false);
  }

  private makeResultPanel(): void {
    const scrim = drawScrim(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const panel = drawPanel(this, {
      x: 40,
      y: 224,
      w: 400,
      h: 352,
      radius: uiTokens.radius.panel,
      fill: uiTokens.color.surface,
      stroke: uiTokens.color.outline,
      elevation: 2,
    });
    this.resultMotif = this.add.graphics();
    this.resultText = makeUiText(this, DESIGN_WIDTH / 2, 312, '', 'title', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('resultText');
    this.resultPoints = makeUiText(this, DESIGN_WIDTH / 2, 376, '', 'body', uiTokens.color.text, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    }).setName('resultPoints');
    this.resultPanel = this.add
      .container(0, 0, [scrim, panel, this.resultMotif, this.resultText, this.resultPoints])
      .setName('resultPanel')
      .setDepth(60)
      .setVisible(false);

    this.playAgainButton = new UiButton(this, DESIGN_WIDTH / 2, 480, {
      label: 'PLAY AGAIN',
      width: 336,
      height: 80,
      variant: 'primary',
      reducedMotion: this.reducedMotion,
    })
      .setName('playAgainButton')
      .setDepth(61)
      .setVisible(false);
  }

  private refreshHud(): void {
    const { hole, points, activePlayer, phase } = this.state;
    const inPlay = phase === 'placing' || phase === 'aiming' || phase === 'rolling';
    for (const player of PLAYERS) {
      const card = this.cards[player];
      card.points.setText(String(points[player]));
      card.shots.setText(statusLabel(hole.result[player], hole.shots[player]));
      const active = inPlay && activePlayer === player;
      card.turn.setVisible(active && !this.isCompact);
      this.drawCardFrame(player, active);
    }

    this.refreshAimRing();
    this.refreshTurnPointer();
    this.refreshHint(inPlay);
    this.refreshCompact();
    this.refreshDesktop();
  }

  /**
   * Hint band: hole 1 only, and only until the human's first shot has settled,
   * after which it fades out for good. Once the fade starts the tween owns the
   * band's visibility.
   */
  private refreshHint(inPlay: boolean): void {
    const { hole, activePlayer, phase, holeIndex } = this.state;
    if (holeIndex === 0 && hole.shots[0] >= 1 && phase !== 'rolling') this.dismissHint();
    if (this.hintDismissed) {
      this.hintBg.setVisible(false);
      this.hintLabel.setVisible(false);
      return;
    }

    const show = holeIndex === 0 && !this.isCompact;
    this.hintBg.setVisible(show);
    this.hintLabel.setVisible(show);
    if (!inPlay) {
      this.hintLabel.setText('');
    } else if (activePlayer === 1) {
      this.hintLabel.setText('The bot is taking its turn…');
    } else if (phase === 'placing') {
      this.hintLabel.setText('Tap the checkered start zone\nto place your ball');
    } else if (phase === 'aiming') {
      this.hintLabel.setText('Drag back anywhere and release to shoot');
    } else {
      this.hintLabel.setText('Rolling…');
    }
  }

  private holeBandLine(player: Player): string {
    const { hole } = this.state;
    const shots = hole.shots[player];
    const status = hole.result[player] === 'holed' ? 'HOLED' : hole.result[player] === 'out' ? 'OUT' : 'PLAYING';
    return `${shots} shot${shots === 1 ? '' : 's'} · ${status}`;
  }

  private showHoleBand(): void {
    this.holeBandShown = true;
    const hole = this.state.holeIndex + 1;
    this.holeBandTitle.setText(`HOLE ${hole}`);
    this.holeBandCourse.setText(this.course.name);
    for (const player of PLAYERS) {
      this.holeBandPlayers[player].setText(PLAYER_NAMES[player]);
      this.holeBandLines[player].setText(this.holeBandLine(player));
      this.holeBandAwards[player].setText(`+${this.state.hole.lastResult?.[player] ?? 0}`);
    }
    this.holeBand.setVisible(!this.isCompact);
    this.continueButton.setVisible(!this.isCompact);
    this.continueAction?.setVisible(true);
    const desktopContent = this.desktopActive && this.desktop
      ? this.desktop.holeCompleteContent(
          hole,
          this.course.name,
          PLAYERS.map((player) => ({
            player,
            line: this.holeBandLine(player),
            award: this.state.hole.lastResult?.[player] ?? 0,
          })),
        )
      : null;
    this.host?.actions().openDialog({
      actionId: 'continueButton',
      title: `HOLE ${hole}`,
      body: this.desktopActive
        ? this.course.name
        : `${this.course.name}. ${PLAYER_NAMES[0]} ${this.holeBandLine(0)} ${this.holeBandAwards[0].text}. ${PLAYER_NAMES[1]} ${this.holeBandLine(1)} ${this.holeBandAwards[1].text}.`,
      art: desktopContent?.art,
      content: desktopContent?.content,
    });
  }

  private hideHoleBand(): void {
    this.holeBandShown = false;
    this.holeBand.setVisible(false);
    this.continueButton.setVisible(false);
    this.continueAction?.setVisible(false);
    this.host?.actions().closeDialog();
  }

  private showResultPanel(): void {
    this.resultShown = true;
    const winner = matchWinner(this.state);
    const heading = winner === 0 ? 'YOU WIN' : winner === 1 ? 'BOT WINS' : 'DRAW';
    this.resultText.setText(heading);
    this.resultPoints.setText(`YOU ${this.state.points[0]}  ·  BOT ${this.state.points[1]}`);
    this.drawResultMotif(winner);
    this.resultPanel.setVisible(!this.isCompact);
    this.playAgainButton.setVisible(!this.isCompact);
    this.playAgainAction?.setVisible(true);
    const desktopContent = this.desktopActive && this.desktop ? this.desktop.resultContent(winner) : null;
    this.host?.actions().openDialog({
      actionId: 'playAgainButton',
      title: heading,
      body: `YOU ${this.state.points[0]} · BOT ${this.state.points[1]}`,
      art: desktopContent?.art,
    });
  }

  private drawResultMotif(winner: Player | 'draw'): void {
    const g = this.resultMotif;
    const cx = DESIGN_WIDTH / 2;
    const cy = 256;
    g.clear();
    if (winner === 0) {
      g.lineStyle(3, phaserColor(uiTokens.color.success), 1);
      g.strokeCircle(cx, cy, 24);
      g.lineStyle(4, phaserColor(uiTokens.color.success), 1);
      g.beginPath();
      g.moveTo(cx - 12, cy);
      g.lineTo(cx - 2, cy + 10);
      g.lineTo(cx + 14, cy - 12);
      g.strokePath();
    } else if (winner === 1) {
      g.lineStyle(3, phaserColor(uiTokens.color.error), 1);
      g.lineBetween(cx - 10, cy - 24, cx - 10, cy + 24);
      g.fillStyle(phaserColor(uiTokens.color.error), 1);
      g.fillTriangle(cx - 10, cy - 24, cx + 24, cy - 14, cx - 10, cy - 4);
    } else {
      g.fillStyle(phaserColor(uiTokens.color.accent), 1);
      g.fillRoundedRect(cx - 20, cy - 10, 40, 8, 4);
      g.fillRoundedRect(cx - 20, cy + 4, 40, 8, 4);
    }
  }

  private hideAim(): void {
    this.aimLine.setVisible(false);
    this.powerLabel.setVisible(false);
    this.currentPower = null;
    this.refreshCompact();
    this.refreshDesktop();
  }

  /** Draws the tapered aim line and power chip from a ball's screen position. */
  private renderAim(shot: Shot | null, bx: number, by: number): void {
    if (!shot) {
      this.hideAim();
      return;
    }
    // A minimum display length keeps the direction readable at low power; the
    // shot's actual power and angle are untouched.
    const len = aimLineLength(shot.power);
    const dx = Math.cos(shot.angle);
    const dy = Math.sin(shot.angle);
    // Perpendicular for the tapered base.
    const px = -dy;
    const py = dx;
    const baseHalf = 5;
    const tipHalf = 0.75;

    this.aimLine.clear();
    this.aimLine.fillStyle(phaserColor(uiTokens.color.text), 0.9);
    this.aimLine.fillPoints(
      [
        { x: bx + px * baseHalf, y: by + py * baseHalf },
        { x: bx + dx * len + px * tipHalf, y: by + dy * len + py * tipHalf },
        { x: bx + dx * len - px * tipHalf, y: by + dy * len - py * tipHalf },
        { x: bx - px * baseHalf, y: by - py * baseHalf },
      ],
      true,
    );
    this.aimLine.setVisible(true);

    // The label may move to stay on screen; the ball and aim geometry do not.
    const labelX = clampLabelX(bx, 40);
    const labelY = by < 60 ? by + 32 : by - 32;
    // The desktop placard is the sole power readout; the legacy badge would
    // sit over the aim line.
    this.powerLabel
      .setPosition(labelX, Math.min(Math.max(labelY, 24), DESIGN_HEIGHT - 24))
      .setText(`${Math.round(shot.power * 100)}%`)
      .setVisible(!this.desktopActive);
    this.currentPower = shot.power;
    this.refreshCompact();
    this.refreshDesktop();
  }

  // ------------------------------------------------------------------ layout

  private get isCompact(): boolean {
    return this.mode === 'compact';
  }

  private applyMode(mode: UiMode): void {
    this.mode = mode;
    const compact = mode === 'compact';
    for (const object of this.normalHud) object.setVisible(!compact);
    this.holeBand.setVisible(!compact && this.holeBandShown);
    this.continueButton.setVisible(!compact && this.holeBandShown);
    this.resultPanel.setVisible(!compact && this.resultShown);
    this.playAgainButton.setVisible(!compact && this.resultShown);
    if (compact) this.powerLabel.setVisible(false);
    this.applyCourseChrome();
    // Re-apply the per-turn visibility (TURN pills) after the blanket show.
    this.refreshHud();
  }

  private applyCourseChrome(): void {
    const visible = !this.isCompact;
    const capPill = this.courseView?.getByName('capPill') as VisibleObject | null;
    const capBanner = this.courseView?.getByName('capBanner') as VisibleObject | null;
    capPill?.setVisible(visible);
    capBanner?.setVisible(visible);
  }

  private refreshCompact(): void {
    if (!this.compact || !this.course) return;
    const { hole, points, activePlayer, phase, holeIndex } = this.state;
    const inPlay = phase === 'placing' || phase === 'aiming' || phase === 'rolling';
    const cards: [{ points: number; status: string; active: boolean }, { points: number; status: string; active: boolean }] = [
      { points: points[0], status: statusLabel(hole.result[0], hole.shots[0]), active: inPlay && activePlayer === 0 },
      { points: points[1], status: statusLabel(hole.result[1], hole.shots[1]), active: inPlay && activePlayer === 1 },
    ];
    let status = '';
    if (phase === 'placing' && activePlayer === 0) {
      status = 'Tap the checkered start zone to place your ball.';
    } else if (phase === 'aiming' && activePlayer === 0) {
      status =
        this.currentPower === null
          ? 'Drag back anywhere and release to shoot.'
          : `Power ${Math.round(this.currentPower * 100)}%. Release to shoot.`;
    } else if (phase === 'rolling') {
      status = 'Rolling…';
    } else if (activePlayer === 1 && (phase === 'placing' || phase === 'aiming')) {
      status = 'The bot is taking its turn…';
    } else if (phase === 'holeOver') {
      status = 'Hole complete.';
    } else if (phase === 'matchOver') {
      status = 'Match complete.';
    }
    updatePlayCompact(this.compact, {
      holeLine: `Hole ${holeIndex + 1} · MAX SHOTS ${this.course.cap}`,
      cards,
      status,
    });
  }

  private applyReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.muteButton.setReducedMotion(reduced);
    this.continueButton.setReducedMotion(reduced);
    this.playAgainButton.setReducedMotion(reduced);
    this.startRingTween();
    this.startPointerTween();
    this.boardArt?.setReducedMotion(reduced);
    if (reduced) {
      if (this.hintDismissed) {
        this.hintBg.setVisible(false);
        this.hintLabel.setVisible(false);
      }
      for (const player of PLAYERS) {
        if (this.holing[player]) {
          this.tweens.killTweensOf(this.ballSprites[player]);
          this.holing[player] = false;
          this.boardArt?.hideBall(player);
          this.ballSprites[player].setVisible(false).setScale(1).setAlpha(this.desktopActive ? 0 : 1);
        }
      }
    }
  }

  private announceState(): void {
    const host = this.host;
    if (!host) return;
    const { phase, points, hole, activePlayer, holeIndex } = this.state;
    if (phase === 'holeOver') {
      host.announce(`Hole ${holeIndex + 1} complete. You ${points[0]} points, bot ${points[1]} points.`);
    } else if (phase === 'matchOver') {
      const winner = matchWinner(this.state);
      const heading = winner === 0 ? 'You win' : winner === 1 ? 'Bot wins' : 'Draw';
      host.announce(`${heading}. You ${points[0]} points, bot ${points[1]} points.`);
    } else {
      const turn = activePlayer === 0 ? 'your turn' : 'bot turn';
      host.announce(
        `You ${points[0]} point${points[0] === 1 ? '' : 's'}, shot ${hole.shots[0]}, ${turn}. Bot ${points[1]} point${points[1] === 1 ? '' : 's'}, shot ${hole.shots[1]}.`,
      );
    }
  }
}
