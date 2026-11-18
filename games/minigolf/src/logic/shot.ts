// Pull-back (slingshot) aiming. Pure TypeScript, no Phaser.
import { clamp, type Vec2 } from '@studio/core';
import type { Ball } from './physics';

/** Drag length in pixels that gives full power. */
export const MAX_DRAG = 180;
/** Ball speed at full power, course units per second. */
export const MAX_SHOT_SPEED = 640;
/** Releasing below this power cancels the shot. */
export const MIN_POWER = 0.05;

export interface Shot {
  /** Direction of travel in radians (Phaser convention: +y is down). */
  angle: number;
  /** 0..1 */
  power: number;
}

/**
 * Turns a touch-down point and the current drag point into a shot. The ball
 * flies opposite to the drag. Returns null when the drag is too short.
 */
export const shotFromDrag = (down: Vec2, current: Vec2): Shot | null => {
  const dx = current.x - down.x;
  const dy = current.y - down.y;
  const power = clamp(Math.hypot(dx, dy) / MAX_DRAG, 0, 1);
  if (power < MIN_POWER) return null;
  return { angle: Math.atan2(-dy, -dx), power };
};

/** Sets the ball's velocity from a shot. Mutates and returns `ball`. */
export const applyShot = (ball: Ball, shot: Shot): Ball => {
  const speed = shot.power * MAX_SHOT_SPEED;
  ball.vx = Math.cos(shot.angle) * speed;
  ball.vy = Math.sin(shot.angle) * speed;
  return ball;
};
