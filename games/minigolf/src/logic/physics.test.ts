import { describe, expect, it } from 'vitest';
import { emptyCourse, type Rect } from './course';
import { SAND_COURT_STRIP, WALL_COURT_WALL, openCourt, sandCourt, wallCourt } from './courses/testCourses';
import {
  BALL_RADIUS,
  FIXED_DT,
  FRICTION_GRASS,
  FRICTION_SAND,
  HOLE_CAPTURE_SPEED,
  WALL_RESTITUTION,
  isAtRest,
  isInSand,
  stepBall,
  type Ball,
  type BallEvent,
} from './physics';

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

/** Distance from the ball centre to the closest point of a rectangle. */
const distanceToRect = (ball: Ball, rect: Rect): number => {
  const cx = Math.min(Math.max(ball.x, rect.x), rect.x + rect.w);
  const cy = Math.min(Math.max(ball.y, rect.y), rect.y + rect.h);
  return Math.hypot(ball.x - cx, ball.y - cy);
};

const centreInside = (ball: Ball, rect: Rect): boolean =>
  ball.x > rect.x && ball.x < rect.x + rect.w && ball.y > rect.y && ball.y < rect.y + rect.h;

describe('physics: walls, sand and the hole', () => {
  it('constants match the spec', () => {
    expect(FRICTION_SAND).toBe(1200);
    expect(HOLE_CAPTURE_SPEED).toBe(260);
  });

  it('head-on at a 20x100 wall: the normal component reflects × 0.85 and the ball is never inside the wall over 300 steps', () => {
    const course = wallCourt();
    const wall = WALL_COURT_WALL;
    expect(wall.w).toBe(20);
    expect(wall.h).toBe(100);
    // Roll straight at the middle of the wall's left face.
    const ball: Ball = { x: 100, y: wall.y + wall.h / 2, vx: 300, vy: 0 };

    let wallEvents = 0;
    let contactChecked = false;
    for (let i = 0; i < 300; i++) {
      const before = { ...ball };
      const events = stepBall(ball, course, FIXED_DT);
      wallEvents += events.filter((e) => e === 'wall').length;

      expect(centreInside(ball, wall)).toBe(false);
      expect(distanceToRect(ball, wall)).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);

      if (before.vx > 0 && ball.vx < 0) {
        // The contact step: friction first, then the damped reflection.
        const expected = -WALL_RESTITUTION * (before.vx - FRICTION_GRASS * FIXED_DT);
        expect(Math.abs(ball.vx - expected)).toBeLessThan(1e-6);
        expect(ball.vy).toBe(0);
        expect(events).toContain('wall');
        contactChecked = true;
      }
    }
    expect(contactChecked).toBe(true);
    expect(wallEvents).toBe(1);
    expect(ball.x).toBeLessThanOrEqual(wall.x - BALL_RADIUS);
    expect(isAtRest(ball)).toBe(true);
  });

  it('angled hit on a wall face: only the normal component flips × 0.85, the tangential one just loses friction', () => {
    const course = wallCourt();
    const wall = WALL_COURT_WALL;
    const ball: Ball = { x: 100, y: 250, vx: 300, vy: 100 };
    let checked = false;
    for (let i = 0; i < 300 && !checked; i++) {
      const before = { ...ball };
      stepBall(ball, course, FIXED_DT);
      if (before.vx > 0 && ball.vx < 0) {
        const speed = Math.hypot(before.vx, before.vy);
        const scale = (speed - FRICTION_GRASS * FIXED_DT) / speed;
        expect(Math.abs(ball.vx - -WALL_RESTITUTION * before.vx * scale)).toBeLessThan(1e-6);
        expect(Math.abs(ball.vy - before.vy * scale)).toBeLessThan(1e-6);
        // Contact was on the left face, not a corner.
        expect(ball.y).toBeGreaterThan(wall.y + BALL_RADIUS);
        expect(ball.y).toBeLessThan(wall.y + wall.h - BALL_RADIUS);
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it('a ball sliding along a wall face from any side is pushed out, never trapped', () => {
    const course = wallCourt();
    const wall = WALL_COURT_WALL;
    const starts: Ball[] = [
      { x: wall.x + wall.w / 2, y: wall.y - 60, vx: 0, vy: 350 }, // from above
      { x: wall.x + wall.w / 2, y: wall.y + wall.h + 60, vx: 0, vy: -350 }, // from below
      { x: wall.x + wall.w + 60, y: wall.y + wall.h / 2, vx: -350, vy: 0 }, // from the right
    ];
    for (const ball of starts) {
      for (let i = 0; i < 300; i++) {
        stepBall(ball, course, FIXED_DT);
        expect(centreInside(ball, wall)).toBe(false);
        expect(distanceToRect(ball, wall)).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
      }
      expect(isAtRest(ball)).toBe(true);
    }
  });

  it('touching a playfield edge reports a wall event', () => {
    const events = stepBall({ x: 10, y: 280, vx: -300, vy: 0 }, emptyCourse(), FIXED_DT);
    expect(events).toEqual(['wall']);
  });

  it('rolling on grass with no contact reports no events', () => {
    const events = stepBall({ x: 100, y: 100, vx: 100, vy: 0 }, emptyCourse(), FIXED_DT);
    expect(events).toEqual([]);
  });

  it('isInSand is true only while the centre is inside a sand rect', () => {
    const course = sandCourt();
    const strip = SAND_COURT_STRIP;
    expect(isInSand({ x: strip.x - 1, y: 280, vx: 0, vy: 0 }, course)).toBe(false);
    expect(isInSand({ x: strip.x, y: 280, vx: 0, vy: 0 }, course)).toBe(true);
    expect(isInSand({ x: strip.x + strip.w / 2, y: 280, vx: 0, vy: 0 }, course)).toBe(true);
    expect(isInSand({ x: strip.x + strip.w, y: 280, vx: 0, vy: 0 }, course)).toBe(true);
    expect(isInSand({ x: strip.x + strip.w + 1, y: 280, vx: 0, vy: 0 }, course)).toBe(false);
    expect(isInSand({ x: 200, y: 280, vx: 0, vy: 0 }, emptyCourse())).toBe(false);
  });

  it('a ball crossing a 100-unit sand strip at 300 u/s exits slower than 100 u/s or stops inside it', () => {
    const course = sandCourt();
    const strip = SAND_COURT_STRIP;
    expect(strip.w).toBe(100);
    // Enter the strip at exactly 300 u/s: start on its left edge.
    const ball: Ball = { x: strip.x, y: 280, vx: 300, vy: 0 };
    for (let i = 0; i < 600; i++) stepBall(ball, course, FIXED_DT);

    const exited = ball.x > strip.x + strip.w;
    if (exited) {
      expect(Math.hypot(ball.vx, ball.vy)).toBeLessThan(100);
    } else {
      expect(isAtRest(ball)).toBe(true);
      expect(ball.x).toBeGreaterThanOrEqual(strip.x);
      expect(ball.x).toBeLessThanOrEqual(strip.x + strip.w);
    }
    // At 1200 u/s² a 300 u/s ball needs 37.5 units to stop, so it rests inside.
    expect(exited).toBe(false);
    expect(ball.x - strip.x).toBeGreaterThan(36);
    expect(ball.x - strip.x).toBeLessThan(39);
  });

  it('sand decelerates at 1200 u/s²: a 240 u/s ball stops in 0.2 s after 24 units', () => {
    const course = sandCourt();
    const start: Ball = { x: SAND_COURT_STRIP.x + 10, y: 280, vx: 240, vy: 0 };
    const ball = { ...start };
    let steps = 0;
    while (!isAtRest(ball) && steps < 100) {
      stepBall(ball, course, FIXED_DT);
      steps++;
    }
    expect(Math.abs(steps * FIXED_DT - 0.2)).toBeLessThan(FIXED_DT + 1e-9);
    expect(Math.abs(ball.x - start.x - 24)).toBeLessThan(0.5);
    expect(ball.y).toBe(start.y);
  });

  it('a ball through the hole centre at 400 u/s is not holed', () => {
    const course = openCourt();
    const hole = course.hole;
    const ball: Ball = { x: hole.x - 50, y: hole.y, vx: 400, vy: 0 };
    const events: BallEvent[] = [];
    let minDist = Infinity;
    for (let i = 0; i < 600; i++) {
      events.push(...stepBall(ball, course, FIXED_DT));
      minDist = Math.min(minDist, Math.hypot(ball.x - hole.x, ball.y - hole.y));
    }
    expect(minDist).toBeLessThan(hole.r); // it really did pass over the cup
    expect(events).not.toContain('holed');
    expect(ball.holed).toBeFalsy();
    expect(ball.x).toBeGreaterThan(hole.x + hole.r);
    expect(isAtRest(ball)).toBe(true);
  });

  it('the same ball at 200 u/s is holed, reports "holed" exactly once and then never moves', () => {
    const course = openCourt();
    const hole = course.hole;
    const ball: Ball = { x: hole.x - 50, y: hole.y, vx: 200, vy: 0 };
    const events: BallEvent[] = [];
    for (let i = 0; i < 600; i++) events.push(...stepBall(ball, course, FIXED_DT));

    expect(events.filter((e) => e === 'holed')).toHaveLength(1);
    expect(ball.holed).toBe(true);
    expect(ball.x).toBe(hole.x);
    expect(ball.y).toBe(hole.y);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);
    expect(isAtRest(ball)).toBe(true);

    // Further steps: no movement, no events.
    const frozen = { ...ball };
    for (let i = 0; i < 120; i++) {
      expect(stepBall(ball, course, FIXED_DT)).toEqual([]);
    }
    expect(ball).toEqual(frozen);
  });

  it('a holed ball does not move even if something sets its velocity', () => {
    const course = openCourt();
    const ball: Ball = { x: course.hole.x, y: course.hole.y, vx: 300, vy: -120, holed: true };
    for (let i = 0; i < 60; i++) {
      expect(stepBall(ball, course, FIXED_DT)).toEqual([]);
    }
    expect(ball.x).toBe(course.hole.x);
    expect(ball.y).toBe(course.hole.y);
  });

  it('capture speed is inclusive: 260 u/s over the cup drops in, 261 u/s rolls over', () => {
    const hole = openCourt().hole;
    // Friction takes 2 u/s off during the step, so 262 -> 260 and 263 -> 261.
    const slow: Ball = { x: hole.x - 1, y: hole.y, vx: 262, vy: 0 };
    expect(stepBall(slow, openCourt(), FIXED_DT)).toEqual(['holed']);
    expect(slow.holed).toBe(true);

    const fast: Ball = { x: hole.x - 1, y: hole.y, vx: 263, vy: 0 };
    expect(stepBall(fast, openCourt(), FIXED_DT)).toEqual([]);
    expect(fast.holed).toBeFalsy();
    expect(Math.abs(Math.hypot(fast.vx, fast.vy) - 261)).toBeLessThan(1e-9);
  });

  it('a ball that comes to rest with its centre over the cup drops in', () => {
    const course = openCourt();
    const hole = course.hole;
    const ball: Ball = { x: hole.x - 5, y: hole.y, vx: 6, vy: 0 };
    const events: BallEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...stepBall(ball, course, FIXED_DT));
    expect(events.filter((e) => e === 'holed')).toHaveLength(1);
    expect(ball.holed).toBe(true);
  });

  it('a ball passing beside the cup (centre outside r=11) is not holed', () => {
    const course = openCourt();
    const hole = course.hole;
    const ball: Ball = { x: hole.x - 50, y: hole.y + hole.r + 0.5, vx: 150, vy: 0 };
    const events: BallEvent[] = [];
    for (let i = 0; i < 600; i++) events.push(...stepBall(ball, course, FIXED_DT));
    expect(events).not.toContain('holed');
    expect(ball.holed).toBeFalsy();
  });

  it('stays deterministic with walls, sand and a hole in play', () => {
    const play = (): Ball => {
      const ball: Ball = { x: 60, y: 500, vx: 310.7, vy: -455.3 };
      const course = sandCourt();
      course.walls.push({ ...WALL_COURT_WALL });
      for (let i = 0; i < 900; i++) stepBall(ball, course, FIXED_DT);
      return ball;
    };
    const a = play();
    const b = play();
    expect(Object.is(a.x, b.x)).toBe(true);
    expect(Object.is(a.y, b.y)).toBe(true);
    expect(Object.is(a.vx, b.vx)).toBe(true);
    expect(Object.is(a.vy, b.vy)).toBe(true);
    expect(a.holed).toBe(b.holed);
  });
});
