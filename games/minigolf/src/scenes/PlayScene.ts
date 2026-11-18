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
import { BALL_RADIUS, FIXED_DT, isAtRest, type Ball, type HoleFlags } from '../logic/physics';
import { shotFromDrag, type Shot } from '../logic/shot';
import { CourseView } from './CourseView';

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

const PLAYERS: readonly Player[] = [0, 1];
const PLAYER_NAMES: readonly [string, string] = ['YOU', 'BOT'];

const COLOURS = {
  background: 0x111218,
  ball0: 0xffffff,
  ball1: 0x14161c,
  ball1Edge: 0xdfe6ea,
  aimDot: 0x9a9a9a,
  aimLine: 0xffffff,
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

/** HUD card geometry: two cards side by side inside the 0–130 band. */
const CARD = { y: 12, w: 224, h: 106, gap: 16 } as const;
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

  private state!: MatchState;
  private accumulator = 0;
  /** True from `shoot` until the match leaves `rolling`, so the scene can react once. */
  private rolling = false;
  /** True while a bot turn is scheduled or in progress. */
  private aiBusy = false;

  private courseView: CourseView | null = null;
  private ballSprites!: [Phaser.GameObjects.Arc, Phaser.GameObjects.Arc];
  private aimDot!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Graphics;
  private powerLabel!: Phaser.GameObjects.Text;
  private cards!: [PlayerCard, PlayerCard];
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

  create(): void {
    this.cameras.main.setBackgroundColor(COLOURS.background);

    this.state = createMatch(seedFromUrl(), this.holes, holeIndexFromUrl());
    this.accumulator = 0;
    this.rolling = false;
    this.aiBusy = false;
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

    this.aimDot = this.add.circle(0, 0, 6, COLOURS.aimDot).setName('aimDot').setDepth(20).setVisible(false);
    this.aimLine = this.add.graphics().setName('aimLine').setDepth(15).setVisible(false);
    this.powerLabel = this.add
      .text(0, 0, '0%', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: COLOURS.text })
      .setOrigin(0, 0.5)
      .setName('powerLabel')
      .setDepth(20)
      .setVisible(false);

    this.cards = [this.makeCard(0), this.makeCard(1)];
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
    while (this.accumulator >= FIXED_DT && this.state.phase === 'rolling') {
      stepMatch(this.state, this.course, FIXED_DT);
      this.accumulator -= FIXED_DT;
      stepped = true;
    }
    if (stepped) {
      this.courseView?.setFlags(this.flags());
      this.syncBalls();
    }
    if (this.rolling && this.state.phase !== 'rolling') {
      this.rolling = false;
      this.afterStateChange();
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
    } else if (phase === 'matchOver') {
      this.showResultPanel();
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
    if (this.state.phase === 'rolling') this.rolling = true;
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
  }

  private onPlayAgain(): void {
    this.scene.restart();
  }

  // --------------------------------------------------------------------- input

  private onPointerDown(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]): void {
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

  private syncBalls(): void {
    for (const player of PLAYERS) {
      const ball = this.state.hole.balls[player];
      const sprite = this.ballSprites[player];
      if (!ball) {
        sprite.setVisible(false);
        continue;
      }
      sprite.setPosition(COURSE_ORIGIN.x + ball.x, COURSE_ORIGIN.y + ball.y).setVisible(!ball.holed);
    }
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

  private makeHint(): void {
    const y = 760;
    this.add.rectangle(DESIGN_WIDTH / 2, y, 440, 44, COLOURS.card).setStrokeStyle(2, COLOURS.cardEdge, 1).setDepth(30);
    this.hintLabel = this.add
      .text(DESIGN_WIDTH / 2, y, '', { fontFamily: FONT, fontSize: '15px', color: COLOURS.text })
      .setOrigin(0.5, 0.5)
      .setName('hintLabel')
      .setDepth(31);
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
    const { hole, points, activePlayer, phase, holeIndex } = this.state;
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

    this.hintLabel.setVisible(holeIndex === 0);
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
