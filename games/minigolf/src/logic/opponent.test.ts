import { describe, expect, it } from 'vitest';
import { rectCentre, type Course } from './course';
import { hole1 } from './courses/hole1';
import { openCourt, waterCourt } from './courses/testCourses';
import { createMatch, placeBall, shoot, stepMatch, type MatchState } from './match';
import { createAiOpponent, searchBestShot, scoreSimulation } from './opponent';
import { BALL_RADIUS, FIXED_DT, freshHoleFlags, isInWater, simulateShot } from './physics';
import { MIN_POWER, applyShot } from './shot';

const STEP_CAP = 3000;

const rollToRest = (state: MatchState, course: Course): void => {
  for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) stepMatch(state, course, FIXED_DT);
  expect(state.phase).not.toBe('rolling');
};

/** A match on `course` with the bot (player 1) placed at the tee and ready to aim. */
const botAiming = (course: Course, seed = 7): MatchState => {
  const state = createMatch(seed, [course, course, course]);
  state.activePlayer = 1;
  placeBall(state, course, rectCentre(course.start));
  return state;
};

const snapshot = (state: MatchState): MatchState => JSON.parse(JSON.stringify(state)) as MatchState;

describe('createAiOpponent', () => {
  it('with skill 1 holes out on the open court in at most 2 shots', () => {
    const course = openCourt();
    const ai = createAiOpponent({ skill: 1 });
    const state = botAiming(course);
    let shots = 0;
    while (state.hole.result[1] === 'playing' && shots < 2) {
      expect(state.phase).toBe('aiming');
      shoot(state, ai.chooseShot(state, course));
      shots += 1;
      rollToRest(state, course);
    }
    expect(state.hole.result[1]).toBe('holed');
    expect(shots).toBeLessThanOrEqual(2);
  });

  it('never picks a shot that ends in water when a dry route exists', () => {
    const course = waterCourt();
    const ai = createAiOpponent({ skill: 1 });
    const state = botAiming(course);
    const shot = ai.chooseShot(state, course);
    const ball = applyShot({ ...state.hole.balls[1]! }, shot);
    const { ball: rested, events } = simulateShot(ball, course, freshHoleFlags());
    expect(events).not.toContain('water');
    expect(isInWater(rested, course)).toBe(false);
    // Sanity: the straight line really does cross the pond, so the AI had to steer.
    const straight = applyShot({ ...state.hole.balls[1]! }, {
      angle: Math.atan2(course.hole.y - state.hole.balls[1]!.y, course.hole.x - state.hole.balls[1]!.x),
      power: 1,
    });
    expect(simulateShot(straight, course).events).toContain('water');
  });

  it('is deterministic: two calls with the same state return identical shots', () => {
    const course = openCourt();
    const ai = createAiOpponent({ skill: 0.4 });
    const a = botAiming(course, 99);
    const b = snapshot(a);
    expect(ai.chooseShot(a, course)).toStrictEqual(ai.chooseShot(b, course));
    expect(a.rngState).toBe(b.rngState);
  });

  it('with skill 0 two different rngState values give different shots', () => {
    const course = openCourt();
    const ai = createAiOpponent({ skill: 0 });
    const a = botAiming(course, 1);
    const b = botAiming(course, 2);
    expect(a.rngState).not.toBe(b.rngState);
    expect(ai.chooseShot(a, course)).not.toStrictEqual(ai.chooseShot(b, course));
  });

  it('advances rngState on every chooseShot call, even at skill 1', () => {
    const course = openCourt();
    for (const skill of [0, 0.75, 1]) {
      const state = botAiming(course, 5);
      const before = state.rngState;
      createAiOpponent({ skill }).chooseShot(state, course);
      expect(state.rngState).not.toBe(before);
    }
  });

  it('only ever mutates rngState', () => {
    const course = hole1();
    const state = botAiming(course, 11);
    const before = snapshot(state);
    const ai = createAiOpponent({ skill: 0.5 });
    ai.chooseShot(state, course);
    expect({ ...state, rngState: before.rngState }).toStrictEqual(before);
    const placing = createMatch(3, [course, course, course]);
    const placingBefore = snapshot(placing);
    ai.choosePlacement(placing, course);
    expect(placing).toStrictEqual(placingBefore);
  });

  it('keeps power inside [MIN_POWER, 1] whatever the noise', () => {
    const course = openCourt();
    const ai = createAiOpponent({ skill: 0, powers: [MIN_POWER, 1] });
    const state = botAiming(course, 123);
    for (let i = 0; i < 40; i++) {
      const { power } = ai.chooseShot(state, course);
      expect(power).toBeGreaterThanOrEqual(MIN_POWER);
      expect(power).toBeLessThanOrEqual(1);
    }
  });

  it('places inside the start zone of hole 1 and finishes a placement + shot pair under 2 s', () => {
    const course = hole1();
    const ai = createAiOpponent();
    const state = createMatch(42, [course, course, course]);
    state.activePlayer = 1;
    const began = performance.now();
    const point = ai.choosePlacement(state, course);
    placeBall(state, course, point);
    expect(state.phase).toBe('aiming');
    const shot = ai.chooseShot(state, course);
    const took = performance.now() - began;
    expect(took).toBeLessThan(2000);
    const { start } = course;
    expect(point.x).toBeGreaterThanOrEqual(start.x + BALL_RADIUS);
    expect(point.x).toBeLessThanOrEqual(start.x + start.w - BALL_RADIUS);
    expect(point.y).toBe(rectCentre(start).y);
    expect(shot.power).toBeGreaterThanOrEqual(MIN_POWER);
    expect(shot.power).toBeLessThanOrEqual(1);
  });

  it('chooseShot falls back to the start zone centre when the ball is not placed', () => {
    const course = openCourt();
    const state = createMatch(1, [course, course, course]);
    state.activePlayer = 1;
    const shot = createAiOpponent({ skill: 1 }).chooseShot(state, course);
    const ball = applyShot({ x: rectCentre(course.start).x, y: rectCentre(course.start).y, vx: 0, vy: 0 }, shot);
    expect(simulateShot(ball, course).ball.holed).toBe(true);
  });
});

describe('searchBestShot and scoreSimulation', () => {
  it('scores holed above any miss and penalises water', () => {
    const course = openCourt();
    const holed = scoreSimulation({ x: course.hole.x, y: course.hole.y, vx: 0, vy: 0, holed: true }, [], course);
    const close = scoreSimulation({ x: course.hole.x + 5, y: course.hole.y, vx: 0, vy: 0 }, [], course);
    const far = scoreSimulation({ x: course.hole.x + 100, y: course.hole.y, vx: 0, vy: 0 }, [], course);
    const wet = scoreSimulation({ x: course.hole.x + 5, y: course.hole.y, vx: 0, vy: 0 }, ['water'], course);
    expect(holed).toBeGreaterThan(close);
    expect(close).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(wet);
    expect(wet).toBeLessThan(-9000);
  });

  it('finds the straight hole-in-one on the open court', () => {
    const course = openCourt();
    const best = searchBestShot(rectCentre(course.start), course, freshHoleFlags(), 36, [0.3, 0.55, 0.8, 1]);
    expect(best.score).toBe(1);
    expect(best.shot.angle).toBeCloseTo(-Math.PI / 2, 10);
    expect(best.shot.power).toBe(0.55);
  });
});
