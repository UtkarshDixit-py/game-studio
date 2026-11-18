import Phaser from 'phaser';
import { BigButton, DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
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

/** Scene data for `Play`: pass `resume` to pick up a saved match. */
export interface PlaySceneData {
  resume?: MatchState;
}

/** Where the course's top-left corner sits on the 480x800 screen. */
export const COURSE_ORIGIN = { x: 40, y: 150 } as const;
/** On-screen length of the aim line at full power. */
const AIM_LINE_LENGTH = 120;
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
/** Length of the squash-and-fade when a ball drops into the cup, ms. */
const HOLE_SQUASH_MS = 260;
/** Length of the hint band fade after the first shot, ms. */
const HINT_FADE_MS = 700;
/** Screen y above which the turn pointer flips below the ball (HUD + margin). */
const POINTER_FLIP_Y = 210;

const PLAYERS: readonly Player[] = [0, 1];
const PLAYER_NAMES: readonly [string, string] = ['YOU', 'BOT'];

const COLOURS = {
  background: 0x111218,
  ball0: 0xffffff,
  ball1: 0x14161c,
  ball1Edge: 0xdfe6ea,
  aimDot: 0x9a9a9a,
  aimLine: 0xffffff,
  aimRing: 0x4ade80,
  pointer: 0xfacc15,
  pointerText: '#0b0d10',
  card: 0x1c1f24,
  cardEdge: 0x565c66,
  cardActiveEdge: 0x4ade80,
  badge: 0x3b82f6,
  pill: '#4ade80',
  pillText: '#0b0d10',
  text: '#ffffff',
  muted: '#aab2c2',
  band: 0x0b0d10,
  dim: 0x000000,
};

const FONT = 'sans-serif';

/** HUD card geometry: two cards at the screen edges with the mute button between. */
const CARD = { y: 12, w: 190, h: 106, gap: 16 } as const;
const cardX = (player: Player): number => (player === 0 ? CARD.gap / 2 : DESIGN_WIDTH - CARD.gap / 2 - CARD.w);

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

/** Short status glyph for the shots label: tick when holed, dash when out. */
const resultGlyph = (result: PlayerResult): string | null => {
  if (result === 'holed') return '✓';
  if (result === 'out') return '—';
  return null;
};

interface PlayerCard {
  frame: Phaser.GameObjects.Rectangle;
  points: Phaser.GameObjects.Text;
  shots: Phaser.GameObjects.Text;
  turn: Phaser.GameObjects.Text;
}

/** The "your turn" bubble: a pill with text and a triangle pointing at the ball. */
interface TurnPointer {
  root: Phaser.GameObjects.Container;
  bob: Phaser.GameObjects.Container;
  pill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  arrow: Phaser.GameObjects.Triangle;
}

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

  private courseView: CourseView | null = null;
  private ballSprites!: [Phaser.GameObjects.Arc, Phaser.GameObjects.Arc];
  private aimDot!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Graphics;
  private aimRing!: Phaser.GameObjects.Arc;
  private powerLabel!: Phaser.GameObjects.Text;
  private turnPointer!: TurnPointer;
  private cards!: [PlayerCard, PlayerCard];
  private muteButton!: BigButton;
  private hintBg!: Phaser.GameObjects.Rectangle;
  private hintLabel!: Phaser.GameObjects.Text;
  private holeBand!: Phaser.GameObjects.Container;
  private holeBandLines!: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private continueButton!: BigButton;
  private resultPanel!: Phaser.GameObjects.Container;
  private resultText!: Phaser.GameObjects.Text;
  private resultPoints!: Phaser.GameObjects.Text;
  private playAgainButton!: BigButton;

  private dragStart: { x: number; y: number } | null = null;
  private pendingShot: Shot | null = null;

  constructor() {
    super('Play');
  }

  init(data?: PlaySceneData): void {
    this.resume = data?.resume ?? null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOURS.background);
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
    this.pendingShot = null;

    this.loadCourse();

    const ball0 = this.add.circle(0, 0, BALL_RADIUS, COLOURS.ball0).setName('ball0').setDepth(10).setVisible(false);
    const ball1 = this.add
      .circle(0, 0, BALL_RADIUS, COLOURS.ball1)
      .setStrokeStyle(2, COLOURS.ball1Edge, 1)
      .setName('ball1')
      .setDepth(10)
      .setVisible(false);
    this.ballSprites = [ball0, ball1];

    this.makeAimRing();
    this.aimDot = this.add.circle(0, 0, 6, COLOURS.aimDot).setName('aimDot').setDepth(20).setVisible(false);
    this.aimLine = this.add.graphics().setName('aimLine').setDepth(15).setVisible(false);
    this.powerLabel = this.add
      .text(0, 0, '0%', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0, 0.5)
      .setName('powerLabel')
      .setDepth(20)
      .setVisible(false);
    this.makeTurnPointer();

    this.cards = [this.makeCard(0), this.makeCard(1)];
    this.makeMuteButton();
    this.makeHint();
    this.makeHoleBand();
    this.makeResultPanel();

    // Touch anywhere: the whole screen is the placement and aim surface.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
    });

    this.afterStateChange();
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
    this.courseView = new CourseView(this, this.course, COURSE_ORIGIN.x, COURSE_ORIGIN.y);
    this.add.existing(this.courseView);
    this.courseView.setFlags(this.flags());
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
    }
    this.afterStateChange();
    this.persist();
  }

  private onPlayAgain(): void {
    // Fresh data so a resumed match is not resumed again.
    this.scene.restart({} satisfies PlaySceneData);
  }

  private onToggleMute(): void {
    const muted = toggleMute(this.save);
    this.muteButton.setLabel(muteLabel(muted));
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
    this.pendingShot = null;
    this.aimDot.setPosition(pointer.x, pointer.y).setVisible(true);
    // The player has taken control: the pointer has done its job.
    this.turnPointer.root.setVisible(false);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragStart || !pointer.isDown) return;
    this.pendingShot = shotFromDrag(this.dragStart, { x: pointer.x, y: pointer.y });
    const sprite = this.ballSprites[0];
    this.renderAim(this.pendingShot, sprite.x, sprite.y);
  }

  private onPointerUp(): void {
    if (!this.dragStart) return;
    const shot = this.pendingShot;
    this.dragStart = null;
    this.pendingShot = null;
    this.aimDot.setVisible(false);
    this.hideAim();
    if (shot && this.state.phase === 'aiming' && this.state.activePlayer === 0) {
      this.fire(shot);
    }
  }

  // ----------------------------------------------------------------- rendering

  /**
   * Moves the ball sprites to the logical balls. A ball that has just been
   * holed squashes and fades into the cup instead of vanishing; the logical
   * ball is untouched. A ball that was already holed when the scene was built
   * (a resumed match) simply stays hidden.
   */
  private syncBalls(): void {
    for (const player of PLAYERS) {
      const ball = this.state.hole.balls[player];
      const sprite = this.ballSprites[player];
      if (!ball) {
        this.resetBallSprite(player);
        sprite.setVisible(false);
        continue;
      }
      if (ball.holed) {
        if (sprite.visible && !this.holing[player]) this.squashIntoHole(player);
        continue;
      }
      this.resetBallSprite(player);
      sprite.setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y).setVisible(true);
    }
  }

  /** Stops any hole animation on a ball sprite and restores its shape. */
  private resetBallSprite(player: Player): void {
    if (!this.holing[player]) return;
    const sprite = this.ballSprites[player];
    this.tweens.killTweensOf(sprite);
    this.holing[player] = false;
    sprite.setScale(1).setAlpha(1);
  }

  /** Squash-and-fade tween on the ball sprite only; ends with the sprite hidden. */
  private squashIntoHole(player: Player): void {
    const sprite = this.ballSprites[player];
    this.holing[player] = true;
    this.tweens.add({
      targets: sprite,
      x: COURSE_ORIGIN.x + this.course.hole.x,
      y: COURSE_ORIGIN.y + this.course.hole.y,
      scaleX: 1.3,
      scaleY: 0.4,
      alpha: 0,
      duration: HOLE_SQUASH_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.holing[player]) return;
        this.holing[player] = false;
        sprite.setVisible(false).setScale(1).setAlpha(1);
      },
    });
  }

  private makeAimRing(): void {
    this.aimRing = this.add
      .circle(0, 0, BALL_RADIUS + 7)
      .setStrokeStyle(2, COLOURS.aimRing, 0.9)
      .setName('aimRing')
      .setDepth(9)
      .setVisible(false);
    this.tweens.add({
      targets: this.aimRing,
      scale: { from: 1, to: 1.4 },
      alpha: { from: 0.95, to: 0.35 },
      duration: 650,
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
      return;
    }
    this.aimRing.setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y).setVisible(true);
  }

  private makeTurnPointer(): void {
    const pill = this.add.rectangle(0, 0, 112, 28, COLOURS.pointer).setStrokeStyle(2, 0xffffff, 0.35);
    const label = this.add
      .text(0, 0, 'YOUR TURN', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: COLOURS.pointerText })
      .setOrigin(0.5, 0.5);
    // Points down at the ball by default; rotated 180° when shown below it.
    const arrow = this.add.triangle(0, 0, 0, 0, 14, 0, 7, 10, COLOURS.pointer).setOrigin(0.5, 0.5);
    const bob = this.add.container(0, 0, [pill, label, arrow]);
    const root = this.add.container(0, 0, [bob]).setName('turnPointer').setDepth(35).setVisible(false);
    this.tweens.add({
      targets: bob,
      y: { from: 0, to: -6 },
      duration: 420,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.turnPointer = { root, bob, pill, label, arrow };
  }

  /** Shows the "your turn" bubble over the human's ball when control returns. */
  private refreshTurnPointer(): void {
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
    // Keep the pill on screen while the arrow stays over the ball.
    const pillShift = bx < 64 ? 64 - bx : bx > DESIGN_WIDTH - 64 ? DESIGN_WIDTH - 64 - bx : 0;
    arrow.setPosition(0, sign * 20).setAngle(below ? 180 : 0);
    pill.setPosition(pillShift, sign * 40);
    label.setPosition(pillShift, sign * 40);
    root.setPosition(bx, by).setVisible(true);
  }

  private makeCard(player: Player): PlayerCard {
    const x = cardX(player);
    const frame = this.add
      .rectangle(x, CARD.y, CARD.w, CARD.h, COLOURS.card)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLOURS.cardEdge, 1)
      .setName(`card${player}`)
      .setDepth(30);
    this.add
      .text(x + 14, CARD.y + 16, PLAYER_NAMES[player], { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0, 0)
      .setDepth(31);
    this.add.circle(x + CARD.w - 30, CARD.y + 28, 18, COLOURS.badge).setDepth(31);
    const points = this.add
      .text(x + CARD.w - 30, CARD.y + 28, '0', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName(`points${player}`)
      .setDepth(32);
    const shots = this.add
      .text(x + 14, CARD.y + 50, 'SHOT 0', { fontFamily: FONT, fontSize: '18px', color: COLOURS.muted })
      .setOrigin(0, 0)
      .setName(`shots${player}`)
      .setDepth(31);
    const turn = this.add
      .text(x + 14, CARD.y + CARD.h - 12, 'TURN', {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: COLOURS.pillText,
        backgroundColor: COLOURS.pill,
        padding: { x: 10, y: 3 },
      })
      .setOrigin(0, 1)
      .setName(`turn${player}`)
      .setDepth(31)
      .setVisible(false);
    return { frame, points, shots, turn };
  }

  /** Mute toggle in the gap between the two HUD cards. */
  private makeMuteButton(): void {
    this.muteButton = new BigButton(this, DESIGN_WIDTH / 2, CARD.y + CARD.h / 2, {
      label: muteLabel(this.save.get().muted),
      width: 76,
      height: 56,
      color: COLOURS.card,
      onTap: () => this.onToggleMute(),
    })
      .setName('muteButton')
      .setDepth(31);
  }

  private makeHint(): void {
    const y = 760;
    this.hintBg = this.add
      .rectangle(DESIGN_WIDTH / 2, y, 440, 44, COLOURS.card)
      .setStrokeStyle(2, COLOURS.cardEdge, 1)
      .setName('hintBand')
      .setDepth(30);
    this.hintLabel = this.add
      .text(DESIGN_WIDTH / 2, y, '', { fontFamily: FONT, fontSize: '15px', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('hintLabel')
      .setDepth(31);
  }

  /** Fades the hint band out once and keeps it hidden for the rest of the match. */
  private dismissHint(): void {
    if (this.hintDismissed) return;
    this.hintDismissed = true;
    const targets = [this.hintBg, this.hintLabel];
    this.tweens.add({
      targets,
      alpha: 0,
      duration: HINT_FADE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        for (const target of targets) target.setVisible(false);
      },
    });
  }

  private makeHoleBand(): void {
    const cy = 400;
    const bg = this.add.rectangle(DESIGN_WIDTH / 2, cy, 440, 220, COLOURS.band, 0.94).setStrokeStyle(2, COLOURS.cardEdge, 1);
    const title = this.add
      .text(DESIGN_WIDTH / 2, cy - 84, '', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('holeBandTitle');
    const line0 = this.add
      .text(DESIGN_WIDTH / 2, cy - 40, '', { fontFamily: FONT, fontSize: '20px', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('holeBandLine0');
    const line1 = this.add
      .text(DESIGN_WIDTH / 2, cy - 8, '', { fontFamily: FONT, fontSize: '20px', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('holeBandLine1');
    this.holeBandLines = [line0, line1];
    this.holeBand = this.add.container(0, 0, [bg, title, line0, line1]).setName('holeBand').setDepth(50).setVisible(false);
    this.continueButton = new BigButton(this, DESIGN_WIDTH / 2, cy + 60, {
      label: 'CONTINUE',
      width: 240,
      height: 64,
      onTap: () => this.onContinue(),
    })
      .setName('continueButton')
      .setDepth(51)
      .setVisible(false);
    this.continueButton.disableInteractive();
  }

  private makeResultPanel(): void {
    const cy = 400;
    const dim = this.add.rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, COLOURS.dim, 0.7);
    const bg = this.add.rectangle(DESIGN_WIDTH / 2, cy, 400, 260, COLOURS.band, 0.98).setStrokeStyle(2, COLOURS.cardEdge, 1);
    this.resultText = this.add
      .text(DESIGN_WIDTH / 2, cy - 80, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('resultText');
    this.resultPoints = this.add
      .text(DESIGN_WIDTH / 2, cy - 24, '', { fontFamily: FONT, fontSize: '20px', color: COLOURS.muted })
      .setOrigin(0.5, 0.5)
      .setName('resultPoints');
    this.resultPanel = this.add
      .container(0, 0, [dim, bg, this.resultText, this.resultPoints])
      .setName('resultPanel')
      .setDepth(60)
      .setVisible(false);
    this.playAgainButton = new BigButton(this, DESIGN_WIDTH / 2, cy + 60, {
      label: 'PLAY AGAIN',
      width: 240,
      height: 64,
      onTap: () => this.onPlayAgain(),
    })
      .setName('playAgainButton')
      .setDepth(61)
      .setVisible(false);
    this.playAgainButton.disableInteractive();
  }

  private refreshHud(): void {
    const { hole, points, activePlayer, phase } = this.state;
    const inPlay = phase === 'placing' || phase === 'aiming' || phase === 'rolling';
    for (const player of PLAYERS) {
      const card = this.cards[player];
      const glyph = resultGlyph(hole.result[player]);
      card.points.setText(String(points[player]));
      card.shots.setText(glyph ?? `SHOT ${hole.shots[player]}`);
      const active = inPlay && activePlayer === player;
      card.turn.setVisible(active);
      card.frame.setStrokeStyle(2, active ? COLOURS.cardActiveEdge : COLOURS.cardEdge, 1);
    }

    this.refreshAimRing();
    this.refreshTurnPointer();
    this.refreshHint(inPlay);
  }

  /**
   * Hint band: hole 1 only, and only until the human's first shot has settled,
   * after which it fades out for good. Once the fade starts the tween owns the
   * band's visibility.
   */
  private refreshHint(inPlay: boolean): void {
    const { hole, activePlayer, phase, holeIndex } = this.state;
    if (holeIndex === 0 && hole.shots[0] >= 1 && phase !== 'rolling') this.dismissHint();
    if (this.hintDismissed) return;

    const show = holeIndex === 0;
    this.hintBg.setVisible(show);
    this.hintLabel.setVisible(show);
    if (!inPlay) {
      this.hintLabel.setText('');
    } else if (activePlayer === 1) {
      this.hintLabel.setText('The bot is taking its turn…');
    } else if (phase === 'placing') {
      this.hintLabel.setText('Tap inside the checkered start zone to place your ball');
    } else if (phase === 'aiming') {
      this.hintLabel.setText('Drag back anywhere and release to shoot');
    } else {
      this.hintLabel.setText('Rolling…');
    }
  }

  private holeBandLine(player: Player): string {
    const { hole } = this.state;
    const glyph = resultGlyph(hole.result[player]) ?? '';
    const awarded = hole.lastResult?.[player] ?? 0;
    const shots = hole.shots[player];
    return `${PLAYER_NAMES[player]}   ${shots} shot${shots === 1 ? '' : 's'} ${glyph}   +${awarded}`;
  }

  private showHoleBand(): void {
    (this.holeBand.getByName('holeBandTitle') as Phaser.GameObjects.Text).setText(
      `HOLE ${this.state.holeIndex + 1} · ${this.course.name}`,
    );
    this.holeBandLines[0].setText(this.holeBandLine(0));
    this.holeBandLines[1].setText(this.holeBandLine(1));
    this.holeBand.setVisible(true);
    this.continueButton.setVisible(true).setInteractive();
  }

  private hideHoleBand(): void {
    this.holeBand.setVisible(false);
    this.continueButton.setVisible(false).disableInteractive();
  }

  private showResultPanel(): void {
    const winner = matchWinner(this.state);
    this.resultText.setText(winner === 0 ? 'YOU WIN' : winner === 1 ? 'BOT WINS' : 'DRAW');
    this.resultPoints.setText(`YOU ${this.state.points[0]}  ·  BOT ${this.state.points[1]}`);
    this.resultPanel.setVisible(true);
    this.playAgainButton.setVisible(true).setInteractive();
  }

  private hideAim(): void {
    this.aimLine.setVisible(false);
    this.powerLabel.setVisible(false);
  }

  /** Draws the tapered aim line and power label from a ball's screen position. */
  private renderAim(shot: Shot | null, bx: number, by: number): void {
    if (!shot) {
      this.hideAim();
      return;
    }
    const len = shot.power * AIM_LINE_LENGTH;
    const dx = Math.cos(shot.angle);
    const dy = Math.sin(shot.angle);
    // Perpendicular for the tapered base.
    const px = -dy;
    const py = dx;
    const baseHalf = 5;
    const tipHalf = 0.75;

    this.aimLine.clear();
    this.aimLine.fillStyle(COLOURS.aimLine, 0.9);
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

    // Label beside the ball, flipped to stay on screen near the right edge.
    const flip = bx + 16 > DESIGN_WIDTH - 70;
    this.powerLabel.setOrigin(flip ? 1 : 0, 0.5);
    this.powerLabel
      .setPosition(flip ? bx - 16 : bx + 16, Math.min(Math.max(by - 18, 12), DESIGN_HEIGHT - 12))
      .setText(`${Math.round(shot.power * 100)}%`)
      .setVisible(true);
  }
}
