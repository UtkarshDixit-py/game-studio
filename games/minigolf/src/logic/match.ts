// Match state machine: two players, three holes, shot caps per hole.
// Pure TypeScript: no Phaser, no wall-clock, no Math.random.
//
// The whole match is one plain JSON object. Every function here mutates that
// object in place and returns it (or returns plain values), never a class
// instance, closure or function, so `JSON.parse(JSON.stringify(state))` is a
// complete restore at any phase, including mid-roll.
import type { Vec2 } from '@studio/core';
import type { Course } from './course';
import { isAtRest, stepBall, type Ball, type BallEvent, type HoleFlags } from './physics';
import { applyShot, type Shot } from './shot';

/** Schema version of `MatchState`, bumped when the shape changes. */
export const MATCH_VERSION = 1;
/** Holes in a match. */
export const MATCH_HOLES = 3;

export type Player = 0 | 1;

export type MatchPhase = 'placing' | 'aiming' | 'rolling' | 'holeOver' | 'matchOver';

/** How a player stands on the current hole. */
export type PlayerResult = 'playing' | 'holed' | 'out';

/** Per-player pair, indexed by `Player`. */
export type Pair<T> = [T, T];

/**
 * A ball in the match state. Same shape as the physics `Ball`, but every
 * optional field is always present so `JSON.stringify` drops nothing.
 */
export interface MatchBall extends Ball {
  holed: boolean;
  shotOrigin: Vec2;
  rollTime: number;
  portalLock: boolean;
}

export interface HoleState {
  /** Shots taken by each player on this hole. */
  shots: Pair<number>;
  /** Extra shot allowance earned by each player on this hole (stars). */
  extraShots: Pair<number>;
  /** Where each player stands on this hole. */
  result: Pair<PlayerResult>;
  /** Each player's ball, or null until it has been placed. */
  balls: Pair<MatchBall | null>;
  /** Props broken so far on this hole, by id. Shared by both players. */
  brokenProps: string[];
  /** Stars collected so far on this hole, by id. Shared by both players. */
  collectedStars: string[];
  /** Points awarded for this hole once it is over, else null. */
  lastResult: Pair<number> | null;
}

export interface MatchState {
  version: number;
  /** Seed the match was created with. */
  seed: number;
  /** mulberry32 state as a u32. Only the AI advances it (see `stepRng`). */
  rngState: number;
  /** 0-based index of the current hole. */
  holeIndex: number;
  /** Hole points won so far by each player. */
  points: Pair<number>;
  /** Whose turn it is. */
  activePlayer: Player;
  phase: MatchPhase;
  hole: HoleState;
}

/** The other player. */
export const otherPlayer = (player: Player): Player => (player === 0 ? 1 : 0);

/** Who tees off first on a hole: the human on holes 1 and 3, the bot on hole 2. */
export const firstPlayer = (holeIndex: number): Player => (holeIndex % 2 === 0 ? 0 : 1);

/** A hole nobody has played yet. */
export const freshHole = (): HoleState => ({
  shots: [0, 0],
  extraShots: [0, 0],
  result: ['playing', 'playing'],
  balls: [null, null],
  brokenProps: [],
  collectedStars: [],
  lastResult: null,
});

/** A resting, unshot ball with every field set. */
const makeBall = (point: Vec2): MatchBall => ({
  x: point.x,
  y: point.y,
  vx: 0,
  vy: 0,
  holed: false,
  shotOrigin: { x: point.x, y: point.y },
  rollTime: 0,
  portalLock: false,
});

/** True when the point lies inside the rectangle (edges inclusive). */
const inRect = (rect: Course['start'], point: Vec2): boolean =>
  point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;

/**
 * A new match at the first hole, nobody placed. `holes` is the course list the
 * match will be played over; only its length matters here and it must be
 * `MATCH_HOLES` long for `advance` to end the match at the right time (pass
 * `holes.length` to `advance` for a shorter test match).
 */
export const createMatch = (seed: number, holes: Course[]): MatchState => ({
  version: MATCH_VERSION,
  seed,
  rngState: seed >>> 0,
  holeIndex: 0,
  points: [0, 0],
  activePlayer: firstPlayer(0),
  phase: holes.length > 0 ? 'placing' : 'matchOver',
  hole: freshHole(),
});

/**
 * Places the active player's ball at `point` while `placing`. Points outside
 * the course's start zone (and calls in any other phase) leave the state
 * untouched. On success the phase becomes `aiming`.
 */
export const placeBall = (state: MatchState, course: Course, point: Vec2): MatchState => {
  if (state.phase !== 'placing') return state;
  if (!inRect(course.start, point)) return state;
  state.hole.balls[state.activePlayer] = makeBall(point);
  state.phase = 'aiming';
  return state;
};

/**
 * Fires the active player's ball while `aiming`: counts the shot and starts
 * `rolling`. Does nothing in any other phase or if the ball is not placed.
 */
export const shoot = (state: MatchState, shot: Shot): MatchState => {
  if (state.phase !== 'aiming') return state;
  const ball = state.hole.balls[state.activePlayer];
  if (!ball) return state;
  applyShot(ball, shot);
  state.hole.shots[state.activePlayer] += 1;
  state.phase = 'rolling';
  return state;
};

/**
 * Advances the active ball by `dt` seconds while `rolling`, using the hole's
 * shared broken-prop and star lists as the physics flags. A `'star'` event adds
 * one to the active player's shot allowance. Once the ball is holed or at rest
 * (including the 12 s timeout) the turn is settled. Returns this step's events.
 */
export const stepMatch = (state: MatchState, course: Course, dt: number): BallEvent[] => {
  if (state.phase !== 'rolling') return [];
  const active = state.activePlayer;
  const ball = state.hole.balls[active];
  if (!ball) {
    settleTurn(state, course);
    return [];
  }
  const flags: HoleFlags = { brokenProps: state.hole.brokenProps, collectedStars: state.hole.collectedStars };
  const events = stepBall(ball, course, dt, flags);
  for (const event of events) {
    if (event === 'star') state.hole.extraShots[active] += 1;
  }
  if (ball.holed || isAtRest(ball, course)) settleTurn(state, course);
  return events;
};

/**
 * Ends the active player's turn after their ball has come to rest: marks them
 * `holed` or, at the cap, `out`; if both players are finished the hole is over
 * and scored, otherwise the turn passes to the other player if they are still
 * playing (else stays), moving to `placing` or `aiming` depending on whether
 * that player's ball is on the course. Called by `stepMatch`; exposed for tests
 * and for callers that stop a roll themselves.
 */
export const settleTurn = (state: MatchState, course: Course): MatchState => {
  const active = state.activePlayer;
  const { hole } = state;
  const ball = hole.balls[active];

  if (ball?.holed) {
    hole.result[active] = 'holed';
  } else if (hole.shots[active] >= course.cap + hole.extraShots[active]) {
    hole.result[active] = 'out';
  }

  const other = otherPlayer(active);
  const finished = (player: Player) => hole.result[player] !== 'playing';

  if (finished(0) && finished(1)) {
    const awarded = scoreHole(state);
    hole.lastResult = awarded;
    state.points[0] += awarded[0];
    state.points[1] += awarded[1];
    state.phase = 'holeOver';
    return state;
  }

  const next: Player = finished(other) ? active : other;
  state.activePlayer = next;
  state.phase = hole.balls[next] ? 'aiming' : 'placing';
  return state;
};

/**
 * Points for the current hole from `hole.result` and `hole.shots`: both holed,
 * fewer shots takes 1 (tie: none); one holed and the other out, the holed
 * player takes 1; both out, none. While anyone is still playing, none.
 */
export const scoreHole = (state: MatchState): Pair<number> => {
  const { result, shots } = state.hole;
  const [r0, r1] = result;
  if (r0 === 'playing' || r1 === 'playing') return [0, 0];
  if (r0 === 'holed' && r1 === 'holed') {
    if (shots[0] < shots[1]) return [1, 0];
    if (shots[1] < shots[0]) return [0, 1];
    return [0, 0];
  }
  if (r0 === 'holed') return [1, 0];
  if (r1 === 'holed') return [0, 1];
  return [0, 0];
};

/**
 * Leaves `holeOver`: moves on to the next hole with both balls unplaced and
 * `firstPlayer(holeIndex)` to tee off, or ends the match after the last hole.
 * `holeCount` is the match length (default `MATCH_HOLES`).
 */
export const advance = (state: MatchState, holeCount: number = MATCH_HOLES): MatchState => {
  if (state.phase !== 'holeOver') return state;
  if (state.holeIndex + 1 >= holeCount) {
    state.phase = 'matchOver';
    return state;
  }
  state.holeIndex += 1;
  state.hole = freshHole();
  state.activePlayer = firstPlayer(state.holeIndex);
  state.phase = 'placing';
  return state;
};

/** The player with more points, or `'draw'` on equal points. */
export const matchWinner = (state: MatchState): Player | 'draw' => {
  const [p0, p1] = state.points;
  if (p0 > p1) return 0;
  if (p1 > p0) return 1;
  return 'draw';
};
