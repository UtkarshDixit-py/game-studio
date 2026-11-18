import { describe, expect, it } from 'vitest';
import { rectCentre, validateCourse } from '../course';
import { createMatch, placeBall, shoot, stepMatch, type MatchState } from '../match';
import { FIXED_DT, freshHoleFlags, simulateShot, type Ball, type BallEvent } from '../physics';
import { applyShot, type Shot } from '../shot';
import { HOLES } from './index';
import { hole3 } from './hole3';

/**
 * Found by a brute-force search over angle x power and hard-coded here. Shot 1
 * fires straight up the corridor hard enough to beat the down-belt; the
 * up-belt and the top belt carry the ball across the star to the top-right
 * corner. Shot 2 drops it from there into the box and the cup.
 */
const SCRIPTED_SHOTS: Shot[] = [
  { angle: -Math.PI / 2, power: 1 },
  { angle: -2.4958, power: 0.9 },
];

/** Steps the match until the phase leaves `rolling`. Returns every event. */
const rollToRest = (state: MatchState, course = hole3()): BallEvent[] => {
  const events: BallEvent[] = [];
  for (let i = 0; i < 3000 && state.phase === 'rolling'; i++) {
    events.push(...stepMatch(state, course, FIXED_DT));
  }
  expect(state.phase).not.toBe('rolling');
  return events;
};

describe('hole 3: Belt maze', () => {
  it('is a valid course with the layout the design asks for', () => {
    const course = hole3();
    expect(validateCourse(course)).toEqual([]);
    expect(course.name).toBe('Belt maze');
    expect(course.cap).toBe(6);
    // Start zone at least 56x56 at the bottom of the left corridor.
    expect(course.start.w).toBeGreaterThanOrEqual(56);
    expect(course.start.h).toBeGreaterThanOrEqual(56);
    expect(course.start.y + course.start.h).toBeGreaterThan(500);
    const corridorWall = course.walls.find((w) => w.h > 300)!;
    expect(corridorWall).toBeDefined();
    expect(course.start.x + course.start.w).toBeLessThanOrEqual(corridorWall.x);
    // Belts: a down-belt just above the start, an up-belt along the left above
    // it, a right-belt across the top.
    expect(course.conveyors.length).toBeGreaterThanOrEqual(3);
    const down = course.conveyors.find((c) => c.dir === 'down')!;
    const up = course.conveyors.find((c) => c.dir === 'up')!;
    const top = course.conveyors.find((c) => c.dir === 'right' && c.rect.y === 0)!;
    expect(down).toBeDefined();
    expect(up).toBeDefined();
    expect(top).toBeDefined();
    expect(down.rect.y + down.rect.h).toBeLessThanOrEqual(course.start.y);
    expect(down.rect.x + down.rect.w).toBeLessThanOrEqual(corridorWall.x);
    expect(up.rect.y + up.rect.h).toBeLessThanOrEqual(down.rect.y);
    expect(up.rect.x + up.rect.w).toBeLessThanOrEqual(corridorWall.x);
    expect(top.rect.w).toBeGreaterThan(course.width / 2);
    // A walled box around the cup, open at the top, with sand beside the cup.
    const box = course.walls.filter((w) => w !== corridorWall);
    expect(box.length).toBe(3);
    const left = box.find((w) => w.h > w.w && w.x < course.hole.x)!;
    const right = box.find((w) => w.h > w.w && w.x > course.hole.x)!;
    const floor = box.find((w) => w.w > w.h)!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(floor).toBeDefined();
    expect(floor.y).toBeGreaterThan(course.hole.y);
    expect(course.sand).toHaveLength(1);
    const sand = course.sand[0]!;
    expect(sand.x).toBeGreaterThanOrEqual(left.x + left.w);
    expect(sand.x + sand.w).toBeLessThan(course.hole.x - course.hole.r);
    expect(Math.abs(course.hole.x - course.width / 2)).toBeLessThan(40);
    // A star in the top-right.
    expect(course.stars).toHaveLength(1);
    expect(course.stars[0]!.x).toBeGreaterThan(course.width * 0.75);
    expect(course.stars[0]!.y).toBeLessThan(course.height / 4);
  });

  it('a weak first shot is pushed back down the corridor by the down-belt', () => {
    const course = hole3();
    const tee = rectCentre(course.start);
    const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
    applyShot(ball, { angle: -Math.PI / 2, power: 0.3 });
    const sim = simulateShot(ball, course, freshHoleFlags());
    expect(sim.ball.y).toBeGreaterThan(470);
    expect(sim.ball.x).toBeLessThan(80);
    expect(sim.events).not.toContain('star');
  });

  it('holes out within the cap with the scripted shots, collecting the star for an extra shot', () => {
    const course = hole3();
    const state = createMatch(1, HOLES, 2);
    expect(state.holeIndex).toBe(2);
    expect(state.activePlayer).toBe(0);
    expect(SCRIPTED_SHOTS.length).toBeLessThanOrEqual(course.cap);

    // The bot is already out of shots, so the turn stays with the human.
    state.hole.result[1] = 'out';
    placeBall(state, course, rectCentre(course.start));
    expect(state.phase).toBe('aiming');

    const all: BallEvent[] = [];
    let starShot = -1;
    for (let i = 0; i < SCRIPTED_SHOTS.length; i++) {
      expect(state.phase).toBe('aiming');
      expect(state.activePlayer).toBe(0);
      shoot(state, SCRIPTED_SHOTS[i]!);
      const events = rollToRest(state, course);
      all.push(...events);
      if (events.includes('star')) {
        starShot = i;
        expect(state.hole.extraShots).toEqual([1, 0]);
        expect(state.hole.collectedStars).toEqual(['star']);
      }
      if (state.hole.result[0] === 'holed') break;
    }
    expect(state.phase).toBe('holeOver');
    expect(starShot).toBeGreaterThanOrEqual(0);
    expect(all.filter((e) => e === 'star')).toHaveLength(1);
    expect(all.filter((e) => e === 'holed')).toHaveLength(1);
    expect(all).not.toContain('timeout');
    expect(state.hole.result[0]).toBe('holed');
    expect(state.hole.shots[0]).toBeLessThanOrEqual(course.cap);
    expect(state.hole.extraShots[0]).toBe(1);
    const ball = state.hole.balls[0]!;
    expect(ball.holed).toBe(true);
    expect(ball.x).toBe(course.hole.x);
    expect(ball.y).toBe(course.hole.y);
  });

  it('the scripted shots give bitwise-identical results on a second run', () => {
    const run = () => {
      const course = hole3();
      const flags = freshHoleFlags();
      const tee = rectCentre(course.start);
      let ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
      const trail: number[] = [];
      for (const shot of SCRIPTED_SHOTS) {
        applyShot(ball, shot);
        ball = simulateShot(ball, course, flags).ball;
        trail.push(ball.x, ball.y);
        if (ball.holed) break;
      }
      return trail;
    };
    expect(run()).toEqual(run());
  });
});
