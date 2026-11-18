import { describe, expect, it } from 'vitest';
import { emptyCourse } from './course';
import { BALL_RADIUS, FIXED_DT, FRICTION_GRASS, WALL_RESTITUTION, isAtRest, stepBall, type Ball } from './physics';

const run = (ball: Ball, steps: number): Ball => {
  const course = emptyCourse();
  for (let i = 0; i < steps; i++) stepBall(ball, course, FIXED_DT);
  return ball;
};

describe('physics', () => {
  it('a ball at 240 u/s on grass rests between 0.95 s and 1.0 s having travelled 120 ± 2 units', () => {
    const start = { x: 100, y: 100, vx: 240, vy: 0 };
    const ball = { ...start };
    const course = emptyCourse();
    let steps = 0;
    while (!isAtRest(ball) && steps < 200) {
      stepBall(ball, course, FIXED_DT);
      steps++;
    }
    const restTime = steps * FIXED_DT;
    expect(restTime).toBeGreaterThanOrEqual(0.95);
    expect(restTime).toBeLessThanOrEqual(1.0);
    expect(ball.x - start.x).toBeGreaterThanOrEqual(118);
    expect(ball.x - start.x).toBeLessThanOrEqual(122);
    expect(ball.y).toBe(start.y);
  });

  it('rest snap sets velocity to exactly zero', () => {
    const ball = run({ x: 100, y: 100, vx: 3, vy: 3 }, 1);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);
    expect(isAtRest(ball)).toBe(true);
  });

  it('does not move a ball that is at rest', () => {
    const ball = run({ x: 50, y: 60, vx: 0, vy: 0 }, 10);
    expect(ball).toEqual({ x: 50, y: 60, vx: 0, vy: 0 });
  });

  it('left edge: on the contact step vx_after = 0.85 * (|vx_before| - friction*dt) and x >= 8', () => {
    const ball: Ball = { x: 20, y: 280, vx: -300, vy: 0 };
    const course = emptyCourse();
    let vxBefore = ball.vx;
    let steps = 0;
    while (ball.vx < 0 && steps < 100) {
      vxBefore = ball.vx;
      stepBall(ball, course, FIXED_DT);
      steps++;
    }
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(100);
    expect(ball.vx).toBeGreaterThan(0);
    const expected = WALL_RESTITUTION * (Math.abs(vxBefore) - FRICTION_GRASS * FIXED_DT);
    expect(Math.abs(ball.vx - expected)).toBeLessThan(1e-6);
    expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS);
    // Grass friction slowed the approach (300 -> ~292) before the hit.
    expect(-vxBefore).toBeLessThan(300);
    expect(-vxBefore).toBeGreaterThan(300 - FRICTION_GRASS * 0.1);
  });

  it('bounces off every playfield edge and stays inside', () => {
    const course = emptyCourse();
    const starts: Ball[] = [
      { x: 20, y: 280, vx: -400, vy: 0 },
      { x: 380, y: 280, vx: 400, vy: 0 },
      { x: 200, y: 20, vx: 0, vy: -400 },
      { x: 200, y: 540, vx: 0, vy: 400 },
    ];
    for (const ball of starts) {
      for (let i = 0; i < 600; i++) {
        stepBall(ball, course, FIXED_DT);
        expect(ball.x).toBeGreaterThanOrEqual(BALL_RADIUS);
        expect(ball.x).toBeLessThanOrEqual(course.width - BALL_RADIUS);
        expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS);
        expect(ball.y).toBeLessThanOrEqual(course.height - BALL_RADIUS);
      }
      expect(isAtRest(ball)).toBe(true);
    }
  });

  it('bounces off an interior wall', () => {
    const course = emptyCourse();
    course.walls.push({ x: 200, y: 0, w: 20, h: 560 });
    const ball: Ball = { x: 150, y: 280, vx: 400, vy: 0 };
    for (let i = 0; i < 600; i++) stepBall(ball, course, FIXED_DT);
    expect(ball.x).toBeLessThanOrEqual(200 - BALL_RADIUS);
    expect(isAtRest(ball)).toBe(true);
  });

  it('is deterministic: the same 600 steps give bitwise-identical positions', () => {
    const a = run({ x: 37.25, y: 410.5, vx: -511.3, vy: 377.7 }, 600);
    const b = run({ x: 37.25, y: 410.5, vx: -511.3, vy: 377.7 }, 600);
    expect(Object.is(a.x, b.x)).toBe(true);
    expect(Object.is(a.y, b.y)).toBe(true);
    expect(Object.is(a.vx, b.vx)).toBe(true);
    expect(Object.is(a.vy, b.vy)).toBe(true);
  });
});
