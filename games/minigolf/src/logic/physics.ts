// Ball physics. Pure TypeScript: no Phaser, no wall-clock, no Math.random.
// Fixed-step and deterministic: the same inputs always give bitwise-identical
// positions.
import type { Course, Rect } from './course';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Set once the ball has dropped into the hole. A holed ball never moves. */
  holed?: boolean;
}

/** Things that happened during one `stepBall` call, for sound and HUD. */
export type BallEvent = 'wall' | 'holed';

/** Simulation step in seconds. */
export const FIXED_DT = 1 / 120;
export const BALL_RADIUS = 8;
/** Linear deceleration on grass, course units per second squared. */
export const FRICTION_GRASS = 240;
/** Linear deceleration while the ball's centre is inside sand. */
export const FRICTION_SAND = 1200;
/** Fraction of the normal velocity kept after hitting a wall. */
export const WALL_RESTITUTION = 0.85;
/** Below this speed the ball snaps to rest (velocity exactly 0). */
export const REST_SPEED = 5;
/** Faster than this and the ball rolls over the hole instead of dropping in. */
export const HOLE_CAPTURE_SPEED = 260;

export const isAtRest = (ball: Ball): boolean => ball.vx === 0 && ball.vy === 0;

/** True when the point lies inside the rectangle (edges inclusive). */
const containsPoint = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/** True when the ball's centre is inside any sand patch of the course. */
export const isInSand = (ball: Ball, course: Course): boolean =>
  course.sand.some((patch) => containsPoint(patch, ball.x, ball.y));

/**
 * Advances the ball by `dt` seconds: linear friction (grass or sand, decided by
 * where the centre is at the start of the step), rest snap, collision with the
 * playfield edges and interior walls, then hole capture. Mutates `ball` and
 * returns the events of this step.
 *
 * Friction is applied first, then collisions reflect what is left, so on the
 * contact step `vx_after = 0.85 * (|vx_before| - FRICTION_GRASS * dt)`.
 */
export const stepBall = (ball: Ball, course: Course, dt: number): BallEvent[] => {
  if (ball.holed) return [];
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed === 0) return [];

  // Friction: constant deceleration along the direction of travel.
  const friction = isInSand(ball, course) ? FRICTION_SAND : FRICTION_GRASS;
  const slowed = Math.max(0, speed - friction * dt);
  const scale = slowed < REST_SPEED ? 0 : slowed / speed;
  const nvx = ball.vx * scale;
  const nvy = ball.vy * scale;

  // Trapezoidal integration is exact for constant deceleration, so a ball at
  // 240 u/s on grass travels 120 units before stopping.
  ball.x += (ball.vx + nvx) * 0.5 * dt;
  ball.y += (ball.vy + nvy) * 0.5 * dt;
  ball.vx = nvx;
  ball.vy = nvy;

  const events: BallEvent[] = [];

  let hitWall = collideEdges(ball, course);
  for (const wall of course.walls) {
    if (collideRect(ball, wall)) hitWall = true;
  }
  if (hitWall) events.push('wall');

  if (captureInHole(ball, course)) events.push('holed');

  return events;
};

/**
 * Drops the ball into the cup when its centre is within the hole radius and it
 * is slow enough. The ball is centred in the hole and stopped for good.
 */
const captureInHole = (ball: Ball, course: Course): boolean => {
  const { hole } = course;
  const dist = Math.hypot(ball.x - hole.x, ball.y - hole.y);
  if (dist >= hole.r) return false;
  if (Math.hypot(ball.vx, ball.vy) > HOLE_CAPTURE_SPEED) return false;
  ball.x = hole.x;
  ball.y = hole.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.holed = true;
  return true;
};

/**
 * Pushes the ball back inside the playfield and reflects the normal velocity.
 * Returns true when an edge was touched.
 */
const collideEdges = (ball: Ball, course: Course): boolean => {
  const r = BALL_RADIUS;
  let hit = false;
  if (ball.x < r) {
    ball.x = r;
    if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION;
    hit = true;
  } else if (ball.x > course.width - r) {
    ball.x = course.width - r;
    if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION;
    hit = true;
  }
  if (ball.y < r) {
    ball.y = r;
    if (ball.vy < 0) ball.vy = -ball.vy * WALL_RESTITUTION;
    hit = true;
  } else if (ball.y > course.height - r) {
    ball.y = course.height - r;
    if (ball.vy > 0) ball.vy = -ball.vy * WALL_RESTITUTION;
    hit = true;
  }
  return hit;
};

/**
 * Circle vs solid axis-aligned rectangle. The ball is pushed out along the
 * normal from the closest point of the rectangle and its normal velocity
 * component is reflected and damped. Returns true when the wall was touched.
 */
const collideRect = (ball: Ball, rect: Rect): boolean => {
  const r = BALL_RADIUS;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;

  // Broad phase: expanded rectangle.
  if (ball.x <= left - r || ball.x >= right + r || ball.y <= top - r || ball.y >= bottom + r) return false;

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
    if (dist >= r || dist === 0) return false;
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
  return true;
};
