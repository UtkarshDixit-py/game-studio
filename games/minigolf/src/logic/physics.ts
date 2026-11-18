// Ball physics. Pure TypeScript: no Phaser, no wall-clock, no Math.random.
// Fixed-step and deterministic: the same inputs always give bitwise-identical
// positions.
import type { Course, Rect } from './course';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Simulation step in seconds. */
export const FIXED_DT = 1 / 120;
export const BALL_RADIUS = 8;
/** Linear deceleration on grass, course units per second squared. */
export const FRICTION_GRASS = 240;
/** Fraction of the normal velocity kept after hitting a wall. */
export const WALL_RESTITUTION = 0.85;
/** Below this speed the ball snaps to rest (velocity exactly 0). */
export const REST_SPEED = 5;

export const isAtRest = (ball: Ball): boolean => ball.vx === 0 && ball.vy === 0;

/**
 * Advances the ball by `dt` seconds: linear friction, rest snap, then
 * collision with the playfield edges and interior walls. Mutates and returns
 * `ball` so callers can use either style.
 *
 * Friction is applied first, then collisions reflect what is left, so on the
 * contact step `vx_after = 0.85 * (|vx_before| - FRICTION_GRASS * dt)`.
 */
export const stepBall = (ball: Ball, course: Course, dt: number): Ball => {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed === 0) return ball;

  // Friction: constant deceleration along the direction of travel.
  const slowed = Math.max(0, speed - FRICTION_GRASS * dt);
  const scale = slowed < REST_SPEED ? 0 : slowed / speed;
  const nvx = ball.vx * scale;
  const nvy = ball.vy * scale;

  // Trapezoidal integration is exact for constant deceleration, so a ball at
  // 240 u/s on grass travels 120 units before stopping.
  ball.x += (ball.vx + nvx) * 0.5 * dt;
  ball.y += (ball.vy + nvy) * 0.5 * dt;
  ball.vx = nvx;
  ball.vy = nvy;

  collideEdges(ball, course);
  for (const wall of course.walls) collideRect(ball, wall);

  return ball;
};

/** Pushes the ball back inside the playfield and reflects the normal velocity. */
const collideEdges = (ball: Ball, course: Course): void => {
  const r = BALL_RADIUS;
  if (ball.x < r) {
    ball.x = r;
    if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION;
  } else if (ball.x > course.width - r) {
    ball.x = course.width - r;
    if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION;
  }
  if (ball.y < r) {
    ball.y = r;
    if (ball.vy < 0) ball.vy = -ball.vy * WALL_RESTITUTION;
  } else if (ball.y > course.height - r) {
    ball.y = course.height - r;
    if (ball.vy > 0) ball.vy = -ball.vy * WALL_RESTITUTION;
  }
};

/**
 * Circle vs solid axis-aligned rectangle. The ball is pushed out along the
 * hit normal and its normal velocity component is reflected and damped.
 */
const collideRect = (ball: Ball, rect: Rect): void => {
  const r = BALL_RADIUS;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;

  // Broad phase: expanded rectangle.
  if (ball.x <= left - r || ball.x >= right + r || ball.y <= top - r || ball.y >= bottom + r) return;

  const inside = ball.x > left && ball.x < right && ball.y > top && ball.y < bottom;
  let nx = 0;
  let ny = 0;
  let push = 0;

  if (inside) {
    // Centre is inside the wall: exit along the axis with the smallest overlap.
    const dl = ball.x - left;
    const dr = right - ball.x;
    const dt = ball.y - top;
    const db = bottom - ball.y;
    const min = Math.min(dl, dr, dt, db);
    if (min === dl) nx = -1;
    else if (min === dr) nx = 1;
    else if (min === dt) ny = -1;
    else ny = 1;
    push = min + r;
  } else {
    const cx = ball.x < left ? left : ball.x > right ? right : ball.x;
    const cy = ball.y < top ? top : ball.y > bottom ? bottom : ball.y;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist >= r || dist === 0) return;
    nx = dx / dist;
    ny = dy / dist;
    push = r - dist;
  }

  ball.x += nx * push;
  ball.y += ny * push;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    // Remove the inward normal component and add back the damped reflection.
    const k = -(1 + WALL_RESTITUTION) * vn;
    ball.vx += nx * k;
    ball.vy += ny * k;
  }
};
