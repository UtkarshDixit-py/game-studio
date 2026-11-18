import { describe, expect, it } from 'vitest';
import type { Ball } from './physics';
import { MAX_SHOT_SPEED, applyShot, shotFromDrag } from './shot';

describe('shotFromDrag', () => {
  it('dragging down fires up at 60/180 power', () => {
    const shot = shotFromDrag({ x: 100, y: 100 }, { x: 100, y: 160 });
    expect(shot).not.toBeNull();
    expect(Math.abs(shot!.angle - -Math.PI / 2)).toBeLessThan(1e-9);
    expect(shot!.power).toBeCloseTo(60 / 180, 12);
  });

  it('clamps power to 1 on a 300 px drag', () => {
    const shot = shotFromDrag({ x: 0, y: 0 }, { x: 300, y: 0 });
    expect(shot!.power).toBe(1);
    expect(Math.abs(Math.abs(shot!.angle) - Math.PI)).toBeLessThan(1e-9);
  });

  it('returns null on a 5 px drag', () => {
    expect(shotFromDrag({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
    expect(shotFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('applyShot', () => {
  it('sets velocity from angle and power', () => {
    const ball = applyShot({ x: 0, y: 0, vx: 0, vy: 0 }, { angle: 0, power: 0.5 });
    expect(ball.vx).toBeCloseTo(MAX_SHOT_SPEED * 0.5, 9);
    expect(ball.vy).toBeCloseTo(0, 9);
  });

  it('full power upward gives -640 vy', () => {
    const ball = applyShot({ x: 0, y: 0, vx: 0, vy: 0 }, { angle: -Math.PI / 2, power: 1 });
    expect(ball.vx).toBeCloseTo(0, 9);
    expect(ball.vy).toBeCloseTo(-640, 9);
  });

  it('records where the shot started and restarts the roll clock', () => {
    const ball: Ball = { x: 12, y: 34, vx: 0, vy: 0, rollTime: 7.5, shotOrigin: { x: 1, y: 2 } };
    applyShot(ball, { angle: 0, power: 1 });
    expect(ball.shotOrigin).toEqual({ x: 12, y: 34 });
    expect(ball.rollTime).toBe(0);
  });
});
