import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '@studio/core/phaser';
import { emptyCourse, type Course } from '../logic/course';
import { BALL_RADIUS, FIXED_DT, isAtRest, stepBall, type Ball } from '../logic/physics';
import { applyShot, shotFromDrag, type Shot } from '../logic/shot';

/** Where the course's top-left corner sits on the 480x800 screen. */
export const COURSE_ORIGIN = { x: 40, y: 150 } as const;
const BORDER = 12;
/** On-screen length of the aim line at full power. */
const AIM_LINE_LENGTH = 120;
/** Never simulate more than this much real time in one frame. */
const MAX_FRAME_DT = 0.1;

const COLOURS = {
  background: 0x111218,
  border: 0x3a3f47,
  court: 0x2e8b45,
  ball: 0xffffff,
  aimDot: 0x9a9a9a,
  aimLine: 0xffffff,
};

/**
 * Thin scene: draws the court and ball, forwards pointer input to the shot
 * logic and advances the physics in fixed slices.
 */
export class PlayScene extends Phaser.Scene {
  private readonly course: Course = emptyCourse();
  private ball: Ball = { x: 0, y: 0, vx: 0, vy: 0 };
  private accumulator = 0;

  private ballSprite!: Phaser.GameObjects.Arc;
  private aimDot!: Phaser.GameObjects.Arc;
  private aimLine!: Phaser.GameObjects.Graphics;
  private powerLabel!: Phaser.GameObjects.Text;

  private dragStart: { x: number; y: number } | null = null;
  private pendingShot: Shot | null = null;

  constructor() {
    super('Play');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOURS.background);

    this.ball = { x: this.course.width / 2, y: this.course.height / 2, vx: 0, vy: 0 };
    this.accumulator = 0;

    this.drawCourt();

    this.ballSprite = this.add
      .circle(0, 0, BALL_RADIUS, COLOURS.ball)
      .setName('ball0')
      .setDepth(10);
    this.syncBallSprite();

    this.aimDot = this.add.circle(0, 0, 6, COLOURS.aimDot).setName('aimDot').setDepth(20).setVisible(false);
    this.aimLine = this.add.graphics().setName('aimLine').setDepth(15).setVisible(false);
    this.powerLabel = this.add
      .text(0, 0, '0%', { fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0, 0.5)
      .setName('powerLabel')
      .setDepth(20)
      .setVisible(false);

    // Touch anywhere: the whole screen is the aim surface.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onPointerUp, this);
  }

  override update(_time: number, deltaMs: number): void {
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME_DT);
    while (this.accumulator >= FIXED_DT) {
      stepBall(this.ball, this.course, FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    this.syncBallSprite();
  }

  /** Copy of the ball's logical state, for tests and HUD. */
  getBall(): Ball {
    return { ...this.ball };
  }

  isBallAtRest(): boolean {
    return isAtRest(this.ball);
  }

  private drawCourt(): void {
    const g = this.add.graphics().setName('court');
    g.fillStyle(COLOURS.border, 1);
    g.fillRect(
      COURSE_ORIGIN.x - BORDER,
      COURSE_ORIGIN.y - BORDER,
      this.course.width + BORDER * 2,
      this.course.height + BORDER * 2,
    );
    g.fillStyle(COLOURS.court, 1);
    g.fillRect(COURSE_ORIGIN.x, COURSE_ORIGIN.y, this.course.width, this.course.height);
  }

  private syncBallSprite(): void {
    this.ballSprite.setPosition(COURSE_ORIGIN.x + this.ball.x, COURSE_ORIGIN.y + this.ball.y);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.dragStart || !isAtRest(this.ball)) return;
    this.dragStart = { x: pointer.x, y: pointer.y };
    this.pendingShot = null;
    this.aimDot.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragStart || !pointer.isDown) return;
    this.pendingShot = shotFromDrag(this.dragStart, { x: pointer.x, y: pointer.y });
    this.renderAim(this.pendingShot);
  }

  private onPointerUp(): void {
    if (!this.dragStart) return;
    const shot = this.pendingShot;
    this.dragStart = null;
    this.pendingShot = null;
    this.aimDot.setVisible(false);
    this.aimLine.setVisible(false);
    this.powerLabel.setVisible(false);
    if (shot && isAtRest(this.ball)) {
      applyShot(this.ball, shot);
    }
  }

  private renderAim(shot: Shot | null): void {
    if (!shot) {
      this.aimLine.setVisible(false);
      this.powerLabel.setVisible(false);
      return;
    }
    const bx = this.ballSprite.x;
    const by = this.ballSprite.y;
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
    const labelX = bx + 16 > DESIGN_WIDTH - 70 ? bx - 16 : bx + 16;
    this.powerLabel.setOrigin(bx + 16 > DESIGN_WIDTH - 70 ? 1 : 0, 0.5);
    this.powerLabel
      .setPosition(labelX, Math.min(Math.max(by - 18, 12), DESIGN_HEIGHT - 12))
      .setText(`${Math.round(shot.power * 100)}%`)
      .setVisible(true);
  }
}
