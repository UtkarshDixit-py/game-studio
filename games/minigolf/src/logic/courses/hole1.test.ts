import { describe, expect, it } from 'vitest';
import { rectCentre, validateCourse } from '../course';
import { FIXED_DT, freshHoleFlags, isAtRest, stepBall, type Ball, type BallEvent, type HoleFlags } from '../physics';
import { applyShot, type Shot } from '../shot';
import { hole1 } from './hole1';

/** Steps the ball until it is holed or at rest, with a safety cap. Returns every event. */
const rollToRest = (ball: Ball, course = hole1(), flags: HoleFlags = freshHoleFlags()): BallEvent[] => {
  const events: BallEvent[] = [];
  for (let i = 0; i < 3000 && !ball.holed && !isAtRest(ball, course); i++) {
    events.push(...stepBall(ball, course, FIXED_DT, flags));
  }
  return events;
};

/**
 * Found by a brute-force search over angle x power from the tee and hard-coded
 * here. Shot 1 crosses the field to the pocket floor, shot 2 climbs to the gap
 * above the L, shot 3 drops in from above.
 */
const SCRIPTED_SHOTS: Shot[] = [
  { angle: 0.7592, power: 1 },
  { angle: -3.0543, power: 0.925 },
  { angle: 0.5323, power: 0.275 },
];

describe('hole 1: Open field', () => {
  it('is a valid course with the layout the design asks for', () => {
    const course = hole1();
    expect(validateCourse(course)).toEqual([]);
    expect(course.name).toBe('Open field');
    expect(course.cap).toBe(5);
    // Start zone bottom-left, at least 56x56.
    expect(course.start.w).toBeGreaterThanOrEqual(56);
    expect(course.start.h).toBeGreaterThanOrEqual(56);
    expect(course.start.x + course.start.w).toBeLessThan(course.width / 2);
    expect(course.start.y).toBeGreaterThan(course.height / 2);
    // One large pond in the middle ringed by 4 props.
    expect(course.water).toHaveLength(1);
    const pond = course.water[0]!;
    expect(pond.w * pond.h).toBeGreaterThan(15000);
    const pondCentre = rectCentre(pond);
    expect(Math.abs(pondCentre.x - course.width / 2)).toBeLessThan(40);
    expect(Math.abs(pondCentre.y - course.height / 2)).toBeLessThan(40);
    expect(course.props).toHaveLength(4);
    for (const prop of course.props) {
      const c = rectCentre(prop.rect);
      expect(Math.hypot(c.x - pondCentre.x, c.y - pondCentre.y)).toBeLessThan(140);
    }
    // Hole top-right inside an L: two walls, one upright and one foot.
    expect(course.hole.x).toBeGreaterThan(course.width / 2);
    expect(course.hole.y).toBeLessThan(course.height / 4);
    expect(course.walls).toHaveLength(2);
    const upright = course.walls.find((w) => w.h > w.w)!;
    const foot = course.walls.find((w) => w.w > w.h)!;
    expect(upright).toBeDefined();
    expect(foot).toBeDefined();
    // The upright stands left of the hole, the foot lies below it, the top is open.
    expect(upright.x + upright.w).toBeLessThan(course.hole.x - course.hole.r);
    expect(foot.y).toBeGreaterThan(course.hole.y + course.hole.r);
    expect(upright.y).toBeGreaterThan(0);
  });

  it('places the tee in the centre of the start zone', () => {
    const course = hole1();
    expect(rectCentre(course.start)).toEqual({ x: 56, y: 504 });
  });

  it('holes out from the start zone centre with the scripted shots, within the cap', () => {
    const course = hole1();
    const flags = freshHoleFlags();
    const tee = rectCentre(course.start);
    const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
    expect(SCRIPTED_SHOTS.length).toBeLessThanOrEqual(course.cap);

    const all: BallEvent[] = [];
    for (const shot of SCRIPTED_SHOTS) {
      applyShot(ball, shot);
      all.push(...rollToRest(ball, course, flags));
      if (ball.holed) break;
    }
    expect(ball.holed).toBe(true);
    expect(all.filter((e) => e === 'holed')).toHaveLength(1);
    expect(all).not.toContain('water');
    expect(ball.x).toBe(course.hole.x);
    expect(ball.y).toBe(course.hole.y);
  });

  it('the same scripted shots give bitwise-identical results on a second run', () => {
    const run = () => {
      const course = hole1();
      const flags = freshHoleFlags();
      const tee = rectCentre(course.start);
      const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
      const trail: number[] = [];
      for (const shot of SCRIPTED_SHOTS) {
        applyShot(ball, shot);
        rollToRest(ball, course, flags);
        trail.push(ball.x, ball.y);
      }
      return trail;
    };
    expect(run()).toEqual(run());
  });

  it('a shot straight into the pond comes back to the tee with one water event', () => {
    const course = hole1();
    const tee = rectCentre(course.start);
    const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
    const pond = rectCentre(course.water[0]!);
    applyShot(ball, { angle: Math.atan2(pond.y - tee.y, pond.x - tee.x), power: 1 });
    const events = rollToRest(ball, course);
    expect(events.filter((e) => e === 'water')).toHaveLength(1);
    expect(ball.x).toBe(tee.x);
    expect(ball.y).toBe(tee.y);
    expect(isAtRest(ball, course)).toBe(true);
  });
});
