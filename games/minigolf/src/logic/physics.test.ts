import { describe, expect, it } from 'vitest';
import { COURSE_HEIGHT, emptyCourse, rectCentre, type Rect } from './course';
import {
  CONVEYOR_COURT_BELT,
  DOWN_CONVEYOR_COURT_BELT,
  PING_PONG_COURT_BELTS,
  PING_PONG_COURT_UP,
  SAND_COURT_STRIP,
  WALL_COURT_WALL,
  WATER_COURT_POND,
  conveyorCourt,
  downConveyorCourt,
  openCourt,
  pingPongCourt,
  sandCourt,
  wallCourt,
  waterCourt,
} from './courses/testCourses';
import {
  BALL_RADIUS,
  BELT_SPEED,
  FIXED_DT,
  FRICTION_GRASS,
  FRICTION_SAND,
  HOLE_CAPTURE_SPEED,
  MAX_ROLL_SECONDS,
  WALL_RESTITUTION,
  conveyorAt,
  isAtRest,
  isInSand,
  isInWater,
  stepBall,
  type Ball,
  type BallEvent,
} from './physics';
import { MAX_SHOT_SPEED, applyShot } from './shot';

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

describe('physics: water, conveyors and the roll timeout', () => {
  it('constants match the spec', () => {
    expect(BELT_SPEED).toBe(160);
    expect(MAX_ROLL_SECONDS).toBe(12);
  });

  it('a ball shot into water ends at exactly its shotOrigin with velocity 0 and one "water" event', () => {
    const course = waterCourt();
    const tee = rectCentre(course.start);
    const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
    // 300 u/s straight up: grass alone would stop it after 187.5 units, 7.5 units
    // past the pond's bottom edge, so the centre does enter the water.
    applyShot(ball, { angle: -Math.PI / 2, power: 300 / MAX_SHOT_SPEED });
    expect(ball.shotOrigin).toEqual({ x: tee.x, y: tee.y });
    expect(ball.y - WATER_COURT_POND.y - WATER_COURT_POND.h).toBe(180);

    const events: BallEvent[] = [];
    for (let i = 0; i < 600; i++) events.push(...stepBall(ball, course, FIXED_DT));

    expect(events.filter((e) => e === 'water')).toHaveLength(1);
    expect(events).not.toContain('wall');
    expect(events).not.toContain('holed');
    expect(Object.is(ball.x, tee.x)).toBe(true);
    expect(Object.is(ball.y, tee.y)).toBe(true);
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(0);
    expect(isAtRest(ball)).toBe(true);
    expect(ball.holed).toBeFalsy();

    // Back on the tee it just sits there.
    const frozen = { ...ball };
    for (let i = 0; i < 120; i++) expect(stepBall(ball, course, FIXED_DT)).toEqual([]);
    expect(ball).toEqual(frozen);
  });

  it('isInWater is true only while the centre is inside a water rect', () => {
    const course = waterCourt();
    const pond = WATER_COURT_POND;
    expect(isInWater({ x: 200, y: pond.y + pond.h + 1, vx: 0, vy: 0 }, course)).toBe(false);
    expect(isInWater({ x: 200, y: pond.y + pond.h, vx: 0, vy: 0 }, course)).toBe(true);
    expect(isInWater({ x: pond.x - 1, y: 250, vx: 0, vy: 0 }, course)).toBe(false);
    expect(isInWater({ x: 200, y: 250, vx: 0, vy: 0 }, emptyCourse())).toBe(false);
  });

  it('without a shotOrigin the water hazard returns the ball to the tee', () => {
    const course = waterCourt();
    const pond = WATER_COURT_POND;
    const ball: Ball = { x: pond.x + pond.w / 2, y: pond.y + pond.h + 1, vx: 0, vy: -200 };
    expect(stepBall(ball, course, FIXED_DT)).toEqual(['water']);
    expect({ x: ball.x, y: ball.y }).toEqual(rectCentre(course.start));
    expect(isAtRest(ball)).toBe(true);
  });

  it('a ball placed with zero velocity on an up-conveyor leaves the belt within 3 s and then rests above it', () => {
    const course = conveyorCourt();
    const belt = CONVEYOR_COURT_BELT.rect;
    const ball: Ball = { x: belt.x + belt.w / 2, y: belt.y + belt.h / 2, vx: 0, vy: 0 };
    expect(isAtRest(ball)).toBe(true);
    expect(conveyorAt(ball, course)).toBeDefined();

    let leftAfterSteps = -1;
    for (let i = 0; i < 3 * 120; i++) {
      stepBall(ball, course, FIXED_DT);
      if (!conveyorAt(ball, course)) {
        leftAfterSteps = i + 1;
        break;
      }
    }
    expect(leftAfterSteps).toBeGreaterThan(0);
    expect(leftAfterSteps * FIXED_DT).toBeLessThanOrEqual(3);
    expect(ball.y).toBeLessThan(belt.y);
    expect(ball.vy).toBeLessThan(0);
    expect(ball.vx).toBe(0);
    expect(ball.x).toBe(belt.x + belt.w / 2);

    let steps = 0;
    while (!isAtRest(ball) && steps < 600) {
      stepBall(ball, course, FIXED_DT);
      steps++;
    }
    expect(isAtRest(ball)).toBe(true);
    expect(ball.y).toBeLessThan(belt.y);
    expect(conveyorAt(ball, course)).toBeUndefined();
  });

  it('a momentary zero velocity on a belt is not rest, unless the roll has timed out', () => {
    const course = pingPongCourt();
    const rect = PING_PONG_COURT_UP.rect;
    const ball: Ball = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, vx: 0, vy: 0 };
    expect(isAtRest(ball)).toBe(true); // velocity alone says stopped...
    expect(isAtRest(ball, course)).toBe(false); // ...but the belt is about to move it
    expect(isAtRest({ ...ball, x: 10, y: 10 }, course)).toBe(true); // off the belt: really at rest
    expect(isAtRest({ ...ball, rollTime: MAX_ROLL_SECONDS }, course)).toBe(true); // timed out on the belt
    expect(isAtRest({ ...ball, vy: -BELT_SPEED }, course)).toBe(false);
  });

  it('on a conveyor the ball never rests: it settles at exactly belt speed', () => {
    const course = conveyorCourt();
    const rect = { x: CONVEYOR_COURT_BELT.rect.x, y: 0, w: CONVEYOR_COURT_BELT.rect.w, h: COURSE_HEIGHT };
    course.conveyors = [{ rect, dir: 'up' }];
    const ball: Ball = { x: rect.x + rect.w / 2, y: 540, vx: 0, vy: 0 };
    for (let i = 0; i < 120; i++) {
      stepBall(ball, course, FIXED_DT);
      expect(isAtRest(ball)).toBe(false);
    }
    // Relative speed started at 160 and fell at 240 u/s², so after 2/3 s the
    // ball is carried at belt speed exactly.
    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(-BELT_SPEED);
  });

  it('a ball entering a down-conveyor at 100 u/s upward is turned around and exits the bottom edge', () => {
    const course = downConveyorCourt();
    const rect = DOWN_CONVEYOR_COURT_BELT.rect;
    const bottom = rect.y + rect.h;
    const ball: Ball = { x: rect.x + rect.w / 2, y: bottom, vx: 0, vy: -100 };
    expect(conveyorAt(ball, course)).toBeDefined();

    let minY = ball.y;
    let exited = false;
    for (let i = 0; i < 600 && !exited; i++) {
      stepBall(ball, course, FIXED_DT);
      minY = Math.min(minY, ball.y);
      if (!conveyorAt(ball, course)) exited = true;
    }
    expect(exited).toBe(true);
    expect(minY).toBeGreaterThan(rect.y); // never reached the top edge
    expect(minY).toBeLessThan(bottom); // but did travel into the belt
    expect(ball.y).toBeGreaterThan(bottom); // left through the bottom edge
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.vx).toBe(0);
    // Constant deceleration is time-symmetric: it leaves at about its entry speed.
    expect(Math.abs(ball.vy - 100)).toBeLessThan(5);
  });

  it('a ball at 500 u/s upward crosses a 60-unit down-conveyor and exits the top', () => {
    const course = downConveyorCourt();
    const rect = DOWN_CONVEYOR_COURT_BELT.rect;
    expect(rect.h).toBe(60);
    const bottom = rect.y + rect.h;
    const ball: Ball = { x: rect.x + rect.w / 2, y: bottom, vx: 0, vy: -500 };

    let exited = false;
    for (let i = 0; i < 120 && !exited; i++) {
      stepBall(ball, course, FIXED_DT);
      expect(ball.y).toBeLessThanOrEqual(bottom); // never pushed back out the bottom
      if (!conveyorAt(ball, course)) exited = true;
    }
    expect(exited).toBe(true);
    expect(ball.y).toBeLessThan(rect.y);
    expect(ball.vy).toBeLessThan(0);
    // The belt and grass friction took some speed off during the crossing.
    expect(-ball.vy).toBeLessThan(500);
    expect(-ball.vy).toBeGreaterThan(400);
  });

  it('a ball bouncing forever between two conveyors is at rest after at most 12 s + one step with one "timeout" event', () => {
    const course = pingPongCourt();
    const up = PING_PONG_COURT_UP;
    expect(up.dir).toBe('up');
    expect(PING_PONG_COURT_BELTS).toHaveLength(2);
    const ball: Ball = { x: up.rect.x + up.rect.w / 2, y: up.rect.y + up.rect.h / 2, vx: 0, vy: 0 };

    const maxSteps = Math.round(MAX_ROLL_SECONDS / FIXED_DT) + 1;
    const events: BallEvent[] = [];
    let restAtStep = -1;
    let visitedDown = false;
    let visitedUp = false;
    for (let i = 0; i < maxSteps; i++) {
      events.push(...stepBall(ball, course, FIXED_DT));
      const belt = conveyorAt(ball, course);
      if (belt?.dir === 'down') visitedDown = true;
      if (belt?.dir === 'up') visitedUp = true;
      if (restAtStep < 0 && isAtRest(ball, course)) restAtStep = i + 1;
    }

    expect(visitedDown).toBe(true);
    expect(visitedUp).toBe(true);
    expect(events).not.toContain('wall');
    expect(events).not.toContain('holed');
    expect(isAtRest(ball)).toBe(true);
    expect(isAtRest(ball, course)).toBe(true);
    // It really was the timeout that stopped it: still rolling until 12 s.
    expect(restAtStep).toBeGreaterThan(0);
    expect(restAtStep * FIXED_DT).toBeGreaterThanOrEqual(MAX_ROLL_SECONDS - FIXED_DT - 1e-9);
    expect(restAtStep).toBeLessThanOrEqual(maxSteps);
    expect(events.filter((e) => e === 'timeout')).toHaveLength(1);
    expect(ball.rollTime).toBeGreaterThanOrEqual(MAX_ROLL_SECONDS - 1e-9);

    // Stopped where it is: on a belt, yet it stays put until the next shot.
    expect(conveyorAt(ball, course)).toBeDefined();
    const frozen = { ...ball };
    for (let i = 0; i < 120; i++) expect(stepBall(ball, course, FIXED_DT)).toEqual([]);
    expect(ball).toEqual(frozen);

    // A new shot restarts the clock and the belt picks the ball up again.
    applyShot(ball, { angle: 0, power: 0 });
    expect(ball.rollTime).toBe(0);
    stepBall(ball, course, FIXED_DT);
    expect(isAtRest(ball)).toBe(false);
  });

  it('a normal shot that stops on its own never reports a timeout', () => {
    const course = openCourt();
    const ball: Ball = { x: 200, y: 480, vx: 0, vy: 0 };
    applyShot(ball, { angle: Math.PI, power: 0.5 });
    const events: BallEvent[] = [];
    for (let i = 0; i < 1441; i++) events.push(...stepBall(ball, course, FIXED_DT));
    expect(isAtRest(ball)).toBe(true);
    expect(events).not.toContain('timeout');
    expect(ball.rollTime).toBeLessThan(MAX_ROLL_SECONDS);
  });

  it('stays deterministic with conveyors in play', () => {
    const play = (): Ball => {
      const course = pingPongCourt();
      const ball: Ball = { x: 187.5, y: 377.25, vx: 83.3, vy: -41.7 };
      for (let i = 0; i < 1441; i++) stepBall(ball, course, FIXED_DT);
      return ball;
    };
    const a = play();
    const b = play();
    expect(Object.is(a.x, b.x)).toBe(true);
    expect(Object.is(a.y, b.y)).toBe(true);
    expect(Object.is(a.vx, b.vx)).toBe(true);
    expect(Object.is(a.vy, b.vy)).toBe(true);
    expect(a.rollTime).toBe(b.rollTime);
  });
});
