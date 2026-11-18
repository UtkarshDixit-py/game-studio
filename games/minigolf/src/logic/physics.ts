// Ball physics. Pure TypeScript: no Phaser, no wall-clock, no Math.random.
// Fixed-step and deterministic: the same inputs always give bitwise-identical
// positions.
import type { Vec2 } from '@studio/core';
import { rectCentre, type Conveyor, type ConveyorDir, type Course, type Portal, type Rect } from './course';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Set once the ball has dropped into the hole. A holed ball never moves. */
  holed?: boolean;
  /** Where the current shot started; the ball returns here after hitting water. */
  shotOrigin?: Vec2;
  /** Seconds the ball has rolled since the current shot. Reset by each shot. */
  rollTime?: number;
  /**
   * Set when the ball comes out of a portal. While locked the ball ignores
   * every portal; the lock clears once the ball's centre is outside all of them.
   */
  portalLock?: boolean;
}

/**
 * What has already happened on this hole. Shared by both players and across
 * shots: broken props stay broken and collected stars stay gone until the
 * next hole. `stepBall` appends to these arrays, never removes.
 */
export interface HoleFlags {
  brokenProps: string[];
  collectedStars: string[];
}

/** Flags for a hole nobody has played yet. */
export const freshHoleFlags = (): HoleFlags => ({ brokenProps: [], collectedStars: [] });

/** Things that happened during one `stepBall` call, for sound and HUD. */
export type BallEvent = 'wall' | 'holed' | 'water' | 'timeout' | 'portal' | 'break' | 'star';

/** Simulation step in seconds. */
export const FIXED_DT = 1 / 120;
export const BALL_RADIUS = 8;
/** Linear deceleration on grass, course units per second squared. */
export const FRICTION_GRASS = 240;
/** Linear deceleration while the ball's centre is inside sand. */
export const FRICTION_SAND = 1200;
/** Fraction of the normal velocity kept after hitting a wall. */
export const WALL_RESTITUTION = 0.85;
/** Fraction of the normal velocity kept after breaking a prop. */
export const PROP_RESTITUTION = 0.5;
/** Distance from the exit portal's centre at which the ball reappears. */
export const PORTAL_EXIT_OFFSET = 23;
/** Below this speed the ball snaps to rest (velocity exactly 0). */
export const REST_SPEED = 5;
/** Faster than this and the ball rolls over the hole instead of dropping in. */
export const HOLE_CAPTURE_SPEED = 260;
/** Speed of a conveyor belt, course units per second. */
export const BELT_SPEED = 160;
/** A ball still moving after this many seconds of roll is stopped where it is. */
export const MAX_ROLL_SECONDS = 12;

/**
 * True when the ball has stopped. Pass the course to also rule out a ball
 * sitting on a conveyor: its velocity can be exactly zero for one step at a
 * turning point, but the belt is about to carry it off, so it is not at rest
 * unless the roll has timed out.
 */
export const isAtRest = (ball: Ball, course?: Course): boolean => {
  if (ball.vx !== 0 || ball.vy !== 0) return false;
  if (!course || ball.holed) return true;
  return !conveyorAt(ball, course) || (ball.rollTime ?? 0) >= MAX_ROLL_SECONDS;
};

/** True when the point lies inside the rectangle (edges inclusive). */
const containsPoint = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

/** True when the ball's centre is inside any sand patch of the course. */
export const isInSand = (ball: Ball, course: Course): boolean =>
  course.sand.some((patch) => containsPoint(patch, ball.x, ball.y));

/** True when the ball's centre is inside any water rect of the course. */
export const isInWater = (ball: Ball, course: Course): boolean =>
  course.water.some((pond) => containsPoint(pond, ball.x, ball.y));

/** The conveyor under the ball's centre, if any (first match wins). */
export const conveyorAt = (ball: Ball, course: Course): Conveyor | undefined =>
  course.conveyors.find((belt) => containsPoint(belt.rect, ball.x, ball.y));

/** True when the ball's centre is strictly inside the circle. */
const centreInCircle = (ball: Ball, c: { x: number; y: number; r: number }): boolean =>
  Math.hypot(ball.x - c.x, ball.y - c.y) < c.r;

/** The portal whose circle holds the ball's centre, if any (first match wins). */
export const portalAt = (ball: Ball, course: Course): Portal | undefined =>
  course.portals.find((portal) => centreInCircle(ball, portal));

/** Velocity of the belt surface for a conveyor direction (+y is down). */
export const beltVelocity = (dir: ConveyorDir): Vec2 => {
  switch (dir) {
    case 'up':
      return { x: 0, y: -BELT_SPEED };
    case 'down':
      return { x: 0, y: BELT_SPEED };
    case 'left':
      return { x: -BELT_SPEED, y: 0 };
    case 'right':
      return { x: BELT_SPEED, y: 0 };
  }
};

const STILL: Readonly<Vec2> = { x: 0, y: 0 };

/**
 * Advances the ball by `dt` seconds: linear friction (grass or sand, decided by
 * where the centre is at the start of the step), rest snap, collision with the
 * playfield edges, interior walls and unbroken props, portal teleport, water
 * reset, star pickup, hole capture, then the roll timeout. Mutates `ball`,
 * appends to `flags` and returns the events of this step.
 *
 * Friction acts on the velocity relative to the ground. Off a conveyor the
 * ground is still; on one it is the belt, so the ball never rests there but
 * settles at exactly belt speed until it leaves.
 *
 * Friction is applied first, then collisions reflect what is left, so on the
 * contact step `vx_after = 0.85 * (|vx_before| - FRICTION_GRASS * dt)`.
 *
 * `flags` defaults to a throwaway fresh set, so callers without props or stars
 * can leave it out; anyone with them must pass the hole's shared flags.
 */
export const stepBall = (ball: Ball, course: Course, dt: number, flags: HoleFlags = freshHoleFlags()): BallEvent[] => {
  if (ball.holed) return [];
  const conveyor = conveyorAt(ball, course);
  const speed = Math.hypot(ball.vx, ball.vy);
  // A stopped ball stays stopped unless a belt is under it. Once the roll has
  // timed out it stays put even on a belt, until the next shot resets rollTime.
  const timedOut = (ball.rollTime ?? 0) >= MAX_ROLL_SECONDS;
  if (speed === 0 && (!conveyor || timedOut)) return [];

  ball.rollTime = (ball.rollTime ?? 0) + dt;

  // Friction: constant deceleration along the direction of travel relative to
  // the belt (or to still ground).
  const belt = conveyor ? beltVelocity(conveyor.dir) : STILL;
  const rvx = ball.vx - belt.x;
  const rvy = ball.vy - belt.y;
  const relSpeed = Math.hypot(rvx, rvy);
  const friction = isInSand(ball, course) ? FRICTION_SAND : FRICTION_GRASS;
  const slowed = Math.max(0, relSpeed - friction * dt);
  // Below REST_SPEED the relative velocity snaps to zero: at rest on grass, or
  // carried at exactly belt speed on a conveyor.
  const scale = relSpeed === 0 || slowed < REST_SPEED ? 0 : slowed / relSpeed;
  const nvx = rvx * scale + belt.x;
  const nvy = rvy * scale + belt.y;

  // Trapezoidal integration is exact for constant deceleration, so a ball at
  // 240 u/s on grass travels 120 units before stopping.
  ball.x += (ball.vx + nvx) * 0.5 * dt;
  ball.y += (ball.vy + nvy) * 0.5 * dt;
  ball.vx = nvx;
  ball.vy = nvy;

  const events: BallEvent[] = [];

  let hitWall = collideEdges(ball, course);
  for (const wall of course.walls) {
    if (collideRect(ball, wall, WALL_RESTITUTION)) hitWall = true;
  }
  if (hitWall) events.push('wall');

  for (const prop of course.props) {
    if (flags.brokenProps.includes(prop.id)) continue;
    if (collideRect(ball, prop.rect, PROP_RESTITUTION)) {
      flags.brokenProps.push(prop.id);
      events.push('break');
    }
  }

  if (teleportThroughPortal(ball, course)) events.push('portal');

  if (isInWater(ball, course)) {
    const origin = ball.shotOrigin ?? rectCentre(course.start);
    ball.x = origin.x;
    ball.y = origin.y;
    ball.vx = 0;
    ball.vy = 0;
    events.push('water');
    return events;
  }

  for (const star of course.stars) {
    if (flags.collectedStars.includes(star.id)) continue;
    if (centreInCircle(ball, star)) {
      flags.collectedStars.push(star.id);
      events.push('star');
    }
  }

  if (captureInHole(ball, course)) events.push('holed');

  if (ball.rollTime >= MAX_ROLL_SECONDS && !isAtRest(ball)) {
    ball.vx = 0;
    ball.vy = 0;
    events.push('timeout');
  }

  return events;
};

/** Result of rolling a shot to rest: the resting (or holed) ball and every event on the way. */
export interface ShotSimulation {
  ball: Ball;
  events: BallEvent[];
}

/** Hard cap on steps for one simulated roll: the roll timeout plus a little slack. */
const MAX_SIMULATION_STEPS = Math.ceil(MAX_ROLL_SECONDS / FIXED_DT) + 4;

/**
 * Rolls a ball that has just been shot (velocity already set, e.g. by
 * `applyShot`) to rest or into the hole with the real fixed-step physics, and
 * returns where it ended up plus every event along the way. Neither the
 * caller's `ball` nor `flags` is touched: both are cloned first, so the AI can
 * try many candidate shots against the same hole state.
 */
export const simulateShot = (ball: Ball, course: Course, flags: HoleFlags = freshHoleFlags()): ShotSimulation => {
  const copy: Ball = { ...ball };
  if (ball.shotOrigin) copy.shotOrigin = { x: ball.shotOrigin.x, y: ball.shotOrigin.y };
  const flagsCopy: HoleFlags = { brokenProps: [...flags.brokenProps], collectedStars: [...flags.collectedStars] };
  const events: BallEvent[] = [];
  for (let i = 0; i < MAX_SIMULATION_STEPS; i++) {
    if (copy.holed || isAtRest(copy, course)) break;
    const stepEvents = stepBall(copy, course, FIXED_DT, flagsCopy);
    for (const event of stepEvents) events.push(event);
  }
  return { ball: copy, events };
};

/**
 * Portal handling for one step. A ball that just came out of a portal is
 * locked until its centre is outside every portal; after that, entering a
 * portal moves the ball to its pair's exit point, `PORTAL_EXIT_OFFSET` along
 * the pair's `exitDir`, keeping its speed but heading along `exitDir`.
 * Returns true when the ball was teleported.
 */
const teleportThroughPortal = (ball: Ball, course: Course): boolean => {
  if (course.portals.length === 0) return false;
  const inside = portalAt(ball, course);
  if (ball.portalLock) {
    if (inside) return false;
    ball.portalLock = false;
    return false;
  }
  if (!inside) return false;
  const exit = course.portals.find((portal) => portal.id === inside.pair);
  if (!exit) return false;

  const speed = Math.hypot(ball.vx, ball.vy);
  const dirLen = Math.hypot(exit.exitDir.x, exit.exitDir.y);
  if (dirLen === 0) return false;
  const dx = exit.exitDir.x / dirLen;
  const dy = exit.exitDir.y / dirLen;
  ball.x = exit.x + dx * PORTAL_EXIT_OFFSET;
  ball.y = exit.y + dy * PORTAL_EXIT_OFFSET;
  ball.vx = dx * speed;
  ball.vy = dy * speed;
  ball.portalLock = true;
  return true;
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
 * component is reflected and damped by `restitution`. Returns true when the
 * rectangle was touched.
 */
const collideRect = (ball: Ball, rect: Rect, restitution: number): boolean => {
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
    const k = -(1 + restitution) * vn;
    ball.vx += nx * k;
    ball.vy += ny * k;
  }
  return true;
};
