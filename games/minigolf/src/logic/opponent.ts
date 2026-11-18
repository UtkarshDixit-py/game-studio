// The opponent interface and the built-in AI. Pure TypeScript: no Phaser, no
// wall-clock, no Math.random. The only randomness is the match's seeded
// mulberry32 state, which the AI advances in place.
import { clamp, type Vec2 } from '@studio/core';
import { rectCentre, type Course } from './course';
import type { MatchState } from './match';
import { BALL_RADIUS, simulateShot, type Ball, type HoleFlags } from './physics';
import { stepRng } from './rng';
import { MIN_POWER, applyShot, type Shot } from './shot';

/**
 * Anything that can play the second seat: the AI today, pass-and-play or a
 * remote player later. Both methods are synchronous and must not mutate the
 * match state, except that an AI may advance `state.rngState`.
 */
export interface Opponent {
  /** Where to put the ball inside `course.start` while `placing`. */
  choosePlacement(state: MatchState, course: Course): Vec2;
  /** The shot to take from the active ball's current position while `aiming`. */
  chooseShot(state: MatchState, course: Course): Shot;
}

export interface AiOptions {
  /** 0 = very noisy, 1 = always the best shot the search found. Default 0.75. */
  skill?: number;
  /** Number of evenly spaced angles tried from each position. Default 36. */
  angles?: number;
  /** Powers tried at each angle. Default [0.3, 0.55, 0.8, 1]. */
  powers?: number[];
}

/** Score of a shot that drops the ball in: beats every miss (whose score is ≤ 0). */
export const HOLED_SCORE = 1;
/** Added to the score of a shot whose roll touched water. */
export const WATER_PENALTY = -10000;
/** Largest angle noise at skill 0, radians. */
export const ANGLE_NOISE = 0.25;
/** Largest power noise at skill 0. */
export const POWER_NOISE = 0.15;

export interface ScoredShot {
  shot: Shot;
  score: number;
}

/**
 * Score of a finished roll: holed beats everything, otherwise the closer the
 * ball rests to the cup the better, with a heavy penalty for touching water.
 */
export const scoreSimulation = (ball: Ball, events: readonly string[], course: Course): number => {
  if (ball.holed) return HOLED_SCORE;
  let score = -Math.hypot(ball.x - course.hole.x, ball.y - course.hole.y);
  if (events.includes('water')) score += WATER_PENALTY;
  return score;
};

/** A resting ball at `point` with the given portal lock, ready for `applyShot`. */
const restingBall = (point: Vec2, portalLock: boolean): Ball => ({
  x: point.x,
  y: point.y,
  vx: 0,
  vy: 0,
  holed: false,
  shotOrigin: { x: point.x, y: point.y },
  rollTime: 0,
  portalLock,
});

/**
 * Tries every angle × power from `from` with the real physics and returns the
 * best by `scoreSimulation`. Deterministic: ties keep the first candidate in
 * iteration order (angles from -π upwards, powers in the given order).
 */
export const searchBestShot = (
  from: Vec2,
  course: Course,
  flags: HoleFlags,
  angles: number,
  powers: readonly number[],
  portalLock = false,
): ScoredShot => {
  let best: ScoredShot | null = null;
  const step = (Math.PI * 2) / angles;
  for (let i = 0; i < angles; i++) {
    const angle = -Math.PI + i * step;
    for (const power of powers) {
      const ball = applyShot(restingBall(from, portalLock), { angle, power });
      const result = simulateShot(ball, course, flags);
      const score = scoreSimulation(result.ball, result.events, course);
      if (!best || score > best.score) best = { shot: { angle, power }, score };
    }
  }
  // `angles` and `powers` are non-empty by construction, so `best` is set.
  return best ?? { shot: { angle: 0, power: MIN_POWER }, score: -Infinity };
};

/** The hole's shared flags from a (cloned) match state. */
const flagsOf = (state: MatchState): HoleFlags => ({
  brokenProps: state.hole.brokenProps,
  collectedStars: state.hole.collectedStars,
});

const cloneState = (state: MatchState): MatchState => JSON.parse(JSON.stringify(state)) as MatchState;

/**
 * The built-in AI. Stateless: everything it needs is in the match state and
 * course, and the only thing it writes is `state.rngState` after `chooseShot`.
 *
 * `chooseShot` searches `angles × powers` shots from the active ball with the
 * real physics, takes the best (holed > closest to the cup, water heavily
 * penalised), then perturbs angle and power with seeded noise scaled by
 * `1 - skill`, so `skill: 1` always plays the search result exactly.
 *
 * `choosePlacement` runs the same search, without noise, from three spots in
 * the start zone (centre, left-middle, right-middle inset by the ball radius)
 * and returns the spot whose best shot scores highest.
 */
export const createAiOpponent = ({ skill = 0.75, angles = 36, powers = [0.3, 0.55, 0.8, 1] }: AiOptions = {}): Opponent => {
  const level = clamp(skill, 0, 1);
  const angleCount = Math.max(1, Math.floor(angles));
  const powerList = powers.length > 0 ? [...powers] : [0.55];

  return {
    choosePlacement(state, course) {
      const working = cloneState(state);
      const flags = flagsOf(working);
      const { start } = course;
      const centre = rectCentre(start);
      const inset = Math.min(BALL_RADIUS, start.w / 2);
      const sides: Vec2[] = [
        { x: start.x + inset, y: centre.y },
        { x: start.x + start.w - inset, y: centre.y },
      ];
      let bestPoint: Vec2 = centre;
      let bestScore = searchBestShot(centre, course, flags, angleCount, powerList).score;
      for (const point of sides) {
        const { score } = searchBestShot(point, course, flags, angleCount, powerList);
        if (score > bestScore) {
          bestScore = score;
          bestPoint = point;
        }
      }
      return { x: bestPoint.x, y: bestPoint.y };
    },

    chooseShot(state, course) {
      const working = cloneState(state);
      const flags = flagsOf(working);
      const ball = working.hole.balls[working.activePlayer];
      const from: Vec2 = ball ? { x: ball.x, y: ball.y } : rectCentre(course.start);
      const { shot } = searchBestShot(from, course, flags, angleCount, powerList, ball?.portalLock ?? false);

      const angleStep = stepRng(state.rngState);
      const powerStep = stepRng(angleStep.state);
      state.rngState = powerStep.state;

      const spread = 1 - level;
      const angle = shot.angle + (angleStep.value * 2 - 1) * spread * ANGLE_NOISE;
      const power = clamp(shot.power + (powerStep.value * 2 - 1) * spread * POWER_NOISE, MIN_POWER, 1);
      return { angle, power };
    },
  };
};
