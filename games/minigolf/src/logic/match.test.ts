import { describe, expect, it } from 'vitest';
import { rectCentre, type Course } from './course';
import { hole1 } from './courses/hole1';
import { STAR_COURT_STAR, openCourt, starCourt } from './courses/testCourses';
import {
  MATCH_HOLES,
  advance,
  createMatch,
  firstPlayer,
  matchWinner,
  placeBall,
  scoreHole,
  settleTurn,
  shoot,
  stepMatch,
  type MatchState,
  type Player,
  type PlayerResult,
} from './match';
import { FIXED_DT, FRICTION_GRASS, type BallEvent } from './physics';
import { MAX_SHOT_SPEED, type Shot } from './shot';

const STEP_CAP = 3000;

/** Steps the match until the phase leaves `rolling`. Returns every event. */
const rollToRest = (state: MatchState, course: Course): BallEvent[] => {
  const events: BallEvent[] = [];
  for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) {
    events.push(...stepMatch(state, course, FIXED_DT));
  }
  expect(state.phase).not.toBe('rolling');
  return events;
};

/** Straight up from the tee of `openCourt`/`starCourt` at a speed that drops into a hole 200 units away. */
const HOLE_IN_ONE: Shot = { angle: -Math.PI / 2, power: 350 / MAX_SHOT_SPEED };
/** A dribble to the right: 64 u/s, about 8.5 units of travel, nowhere near anything. */
const TINY_MISS: Shot = { angle: 0, power: 0.1 };

/** A shot from the active ball's current spot that arrives at the hole at about 150 u/s. */
const holeShotFrom = (state: MatchState, course: Course): Shot => {
  const ball = state.hole.balls[state.activePlayer]!;
  const dx = course.hole.x - ball.x;
  const dy = course.hole.y - ball.y;
  const d = Math.hypot(dx, dy);
  const v0 = Math.sqrt(2 * FRICTION_GRASS * d + 150 * 150);
  return { angle: Math.atan2(dy, dx), power: v0 / MAX_SHOT_SPEED };
};

const placeAtTee = (state: MatchState, course: Course): MatchState => placeBall(state, course, rectCentre(course.start));

const newMatch = (seed = 7): MatchState => createMatch(seed, [openCourt(), openCourt(), openCourt()]);

const snapshot = (state: MatchState): MatchState => JSON.parse(JSON.stringify(state)) as MatchState;

const expectRoundTrip = (state: MatchState) => {
  expect(snapshot(state)).toStrictEqual(state);
};

/**
 * Plays the current hole of `state` on `course` to `holeOver`. The winner holes
 * in one; the loser dribbles once and then holes in two; a tie is two holes in
 * one.
 */
const playHole = (state: MatchState, course: Course, outcome: Player | 'tie'): MatchState => {
  for (let guard = 0; guard < 20 && state.phase !== 'holeOver'; guard++) {
    if (state.phase === 'placing') placeAtTee(state, course);
    expect(state.phase).toBe('aiming');
    const active = state.activePlayer;
    const loser = outcome !== 'tie' && active !== outcome;
    const shot = loser && state.hole.shots[active] === 0 ? TINY_MISS : holeShotFrom(state, course);
    shoot(state, shot);
    rollToRest(state, course);
  }
  expect(state.phase).toBe('holeOver');
  return state;
};

const stateWithResults = (result: [PlayerResult, PlayerResult], shots: [number, number]): MatchState => {
  const state = newMatch();
  state.hole.result = result;
  state.hole.shots = shots;
  return state;
};

describe('createMatch', () => {
  it('starts at hole 1 with the human placing and the shape from the spec', () => {
    const state = createMatch(123, [openCourt(), openCourt(), openCourt()]);
    expect(Object.keys(state).sort()).toEqual(
      ['version', 'seed', 'rngState', 'holeIndex', 'points', 'activePlayer', 'phase', 'hole'].sort(),
    );
    expect(Object.keys(state.hole).sort()).toEqual(
      ['shots', 'extraShots', 'result', 'balls', 'brokenProps', 'collectedStars', 'lastResult'].sort(),
    );
    expect(state.version).toBe(1);
    expect(state.seed).toBe(123);
    expect(state.rngState).toBe(123);
    expect(state.holeIndex).toBe(0);
    expect(state.points).toEqual([0, 0]);
    expect(state.activePlayer).toBe(0);
    expect(state.phase).toBe('placing');
    expect(state.hole).toEqual({
      shots: [0, 0],
      extraShots: [0, 0],
      result: ['playing', 'playing'],
      balls: [null, null],
      brokenProps: [],
      collectedStars: [],
      lastResult: null,
    });
    expect(MATCH_HOLES).toBe(3);
  });

  it('stores the rng state as a u32', () => {
    expect(createMatch(-1, [openCourt()]).rngState).toBe(0xffffffff);
    expect(createMatch(4294967296 + 5, [openCourt()]).rngState).toBe(5);
  });

  it('bot tees off first on hole 2 only', () => {
    expect([0, 1, 2].map(firstPlayer)).toEqual([0, 1, 0]);
  });
});

describe('placing and shooting', () => {
  it('placeBall outside the start zone leaves the state unchanged', () => {
    const course = openCourt();
    const state = newMatch();
    const before = snapshot(state);
    const returned = placeBall(state, course, { x: 10, y: 10 });
    expect(returned).toBe(state);
    expect(state).toStrictEqual(before);
    // Just outside each edge of the zone.
    const z = course.start;
    for (const p of [
      { x: z.x - 1, y: z.y + 5 },
      { x: z.x + z.w + 1, y: z.y + 5 },
      { x: z.x + 5, y: z.y - 1 },
      { x: z.x + 5, y: z.y + z.h + 1 },
    ]) {
      placeBall(state, course, p);
    }
    expect(state).toStrictEqual(before);
  });

  it('placing then shooting increments shots[active] and sets rolling', () => {
    const course = openCourt();
    const state = newMatch();
    const tee = rectCentre(course.start);
    placeBall(state, course, tee);
    expect(state.phase).toBe('aiming');
    expect(state.hole.balls[0]).toEqual({
      x: tee.x,
      y: tee.y,
      vx: 0,
      vy: 0,
      holed: false,
      shotOrigin: { x: tee.x, y: tee.y },
      rollTime: 0,
      portalLock: false,
    });
    expect(state.hole.balls[1]).toBeNull();

    shoot(state, HOLE_IN_ONE);
    expect(state.hole.shots).toEqual([1, 0]);
    expect(state.phase).toBe('rolling');
    expect(state.hole.balls[0]!.vy).toBeLessThan(0);
  });

  it('shooting before placing, or placing twice, does nothing', () => {
    const course = openCourt();
    const state = newMatch();
    const before = snapshot(state);
    shoot(state, HOLE_IN_ONE);
    expect(state).toStrictEqual(before);

    placeAtTee(state, course);
    const placed = snapshot(state);
    placeBall(state, course, { x: course.start.x + 1, y: course.start.y + 1 });
    expect(state).toStrictEqual(placed);
  });

  it('stepMatch outside rolling returns no events and changes nothing', () => {
    const course = openCourt();
    const state = newMatch();
    const before = snapshot(state);
    expect(stepMatch(state, course, FIXED_DT)).toEqual([]);
    expect(state).toStrictEqual(before);
  });
});

describe('turns', () => {
  it('after the ball rests the active player flips and the other player places', () => {
    const course = openCourt();
    const state = newMatch();
    placeAtTee(state, course);
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('placing');
    expect(state.hole.result).toEqual(['playing', 'playing']);

    placeAtTee(state, course);
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    // Back to the human, whose ball is already on the course.
    expect(state.activePlayer).toBe(0);
    expect(state.phase).toBe('aiming');
    expect(state.hole.shots).toEqual([1, 1]);
  });

  it('a holed player is skipped', () => {
    const course = openCourt();
    const state = newMatch();
    placeAtTee(state, course);
    shoot(state, HOLE_IN_ONE);
    const events = rollToRest(state, course);
    expect(events.filter((e) => e === 'holed')).toHaveLength(1);
    expect(state.hole.result[0]).toBe('holed');
    expect(state.hole.balls[0]!.holed).toBe(true);
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('placing');

    placeAtTee(state, course);
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('aiming');
    expect(state.hole.result).toEqual(['holed', 'playing']);
  });

  it('shots == cap with no hole-out marks the player out and ends the hole', () => {
    const course = openCourt();
    const state = newMatch();
    placeAtTee(state, course);
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    placeAtTee(state, course);
    shoot(state, HOLE_IN_ONE);
    rollToRest(state, course);
    expect(state.hole.result).toEqual(['playing', 'holed']);
    expect(state.activePlayer).toBe(0);

    for (let n = 2; n < course.cap; n++) {
      shoot(state, TINY_MISS);
      rollToRest(state, course);
      expect(state.hole.shots[0]).toBe(n);
      expect(state.hole.result[0]).toBe('playing');
      expect(state.phase).toBe('aiming');
      expect(state.activePlayer).toBe(0);
    }
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    expect(state.hole.shots[0]).toBe(course.cap);
    expect(state.hole.result).toEqual(['out', 'holed']);
    expect(state.phase).toBe('holeOver');
    expect(state.hole.lastResult).toEqual([0, 1]);
    expect(state.points).toEqual([0, 1]);
  });

  it('a star adds one to the collector’s shot allowance', () => {
    const course = starCourt();
    const state = newMatch();
    placeAtTee(state, course);
    shoot(state, HOLE_IN_ONE); // rolls straight over the star in the middle
    const events = rollToRest(state, course);
    expect(events.filter((e) => e === 'star')).toHaveLength(1);
    expect(state.hole.extraShots).toEqual([1, 0]);
    expect(state.hole.collectedStars).toEqual([STAR_COURT_STAR.id]);
    expect(state.hole.result[0]).toBe('playing');

    // Bot dribbles itself out; the human dribbles in between, reaching the plain cap.
    while (state.hole.result[1] === 'playing') {
      if (state.phase === 'placing') placeAtTee(state, course);
      expect(state.activePlayer).toBe(1);
      shoot(state, TINY_MISS);
      rollToRest(state, course);
      if (state.hole.result[1] === 'playing') {
        expect(state.activePlayer).toBe(0);
        shoot(state, TINY_MISS);
        rollToRest(state, course);
      }
    }
    expect(state.hole.result[1]).toBe('out');
    expect(state.hole.shots[0]).toBe(course.cap);
    // Five shots, but a cap of 5 + 1: still playing.
    expect(state.hole.result[0]).toBe('playing');
    expect(state.phase).toBe('aiming');
    expect(state.activePlayer).toBe(0);
    shoot(state, TINY_MISS);
    rollToRest(state, course);
    expect(state.hole.shots[0]).toBe(course.cap + 1);
    expect(state.hole.result[0]).toBe('out');
    expect(state.phase).toBe('holeOver');
  });

  it('settleTurn can be called directly for a stopped ball', () => {
    const course = openCourt();
    const state = newMatch();
    placeAtTee(state, course);
    state.phase = 'rolling';
    state.hole.shots[0] = course.cap;
    settleTurn(state, course);
    expect(state.hole.result[0]).toBe('out');
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('placing');
  });
});

describe('scoreHole', () => {
  it('both holed: fewer shots wins, tie is nothing', () => {
    expect(scoreHole(stateWithResults(['holed', 'holed'], [2, 3]))).toEqual([1, 0]);
    expect(scoreHole(stateWithResults(['holed', 'holed'], [3, 2]))).toEqual([0, 1]);
    expect(scoreHole(stateWithResults(['holed', 'holed'], [3, 3]))).toEqual([0, 0]);
  });

  it('holed beats out, both out is nothing', () => {
    expect(scoreHole(stateWithResults(['holed', 'out'], [5, 5]))).toEqual([1, 0]);
    expect(scoreHole(stateWithResults(['out', 'holed'], [5, 5]))).toEqual([0, 1]);
    expect(scoreHole(stateWithResults(['out', 'out'], [5, 5]))).toEqual([0, 0]);
  });

  it('an unfinished hole scores nothing', () => {
    expect(scoreHole(stateWithResults(['holed', 'playing'], [1, 0]))).toEqual([0, 0]);
  });
});

describe('advance', () => {
  it('hole 2 starts with activePlayer 1 and a fresh hole, keeping the points', () => {
    const course = openCourt();
    const state = newMatch();
    playHole(state, course, 0);
    expect(state.points).toEqual([1, 0]);
    expect(state.hole.lastResult).toEqual([1, 0]);

    advance(state);
    expect(state.holeIndex).toBe(1);
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('placing');
    expect(state.points).toEqual([1, 0]);
    expect(state.hole).toEqual({
      shots: [0, 0],
      extraShots: [0, 0],
      result: ['playing', 'playing'],
      balls: [null, null],
      brokenProps: [],
      collectedStars: [],
      lastResult: null,
    });
  });

  it('does nothing outside holeOver', () => {
    const state = newMatch();
    const before = snapshot(state);
    advance(state);
    expect(state).toStrictEqual(before);
  });

  it('after 3 holes the match is over and a 2-1 goes to the human', () => {
    const course = openCourt();
    const state = newMatch();
    for (const outcome of [0, 1, 0] as const) {
      playHole(state, course, outcome);
      advance(state);
    }
    expect(state.phase).toBe('matchOver');
    expect(state.holeIndex).toBe(2);
    expect(state.points).toEqual([2, 1]);
    expect(matchWinner(state)).toBe(0);
    // Hole data stays for the result screen; advancing again is a no-op.
    expect(state.hole.lastResult).toEqual([1, 0]);
    const before = snapshot(state);
    advance(state);
    expect(state).toStrictEqual(before);
  });

  it('a 1-1 with a tied third hole is a draw, and 1-2 goes to the bot', () => {
    const course = openCourt();
    const draw = newMatch();
    for (const outcome of [0, 1, 'tie'] as const) {
      playHole(draw, course, outcome);
      advance(draw);
    }
    expect(draw.phase).toBe('matchOver');
    expect(draw.points).toEqual([1, 1]);
    expect(matchWinner(draw)).toBe('draw');

    const bot = newMatch();
    for (const outcome of [1, 1, 0] as const) {
      playHole(bot, course, outcome);
      advance(bot);
    }
    expect(bot.points).toEqual([1, 2]);
    expect(matchWinner(bot)).toBe(1);
  });

  it('honours a shorter match length when asked', () => {
    const course = openCourt();
    const state = createMatch(1, [openCourt()]);
    playHole(state, course, 0);
    advance(state, 1);
    expect(state.phase).toBe('matchOver');
    expect(matchWinner(state)).toBe(0);
  });
});

describe('JSON round trip', () => {
  /** Hole 1's scripted hole-out from the hole1 tests. */
  const HOLE1_SHOTS: Shot[] = [
    { angle: 0.7592, power: 1 },
    { angle: -3.0543, power: 0.925 },
    { angle: 0.5323, power: 0.275 },
  ];

  /**
   * Plays hole 1 from `state`: the human uses the scripted shots, the bot
   * dribbles until it is out. Checks the JSON round trip at every phase and at
   * regular points mid-roll. Returns the final JSON.
   */
  const scriptedHole = (state: MatchState, course: Course, check: boolean): string => {
    let humanShot = 0;
    const roll = () => {
      for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) {
        stepMatch(state, course, FIXED_DT);
        if (check && i % 60 === 0) expectRoundTrip(state);
      }
      expect(state.phase).not.toBe('rolling');
    };
    for (let guard = 0; guard < 20 && state.phase !== 'holeOver'; guard++) {
      if (state.phase === 'placing') {
        placeAtTee(state, course);
        if (check) expectRoundTrip(state);
      }
      expect(state.phase).toBe('aiming');
      const shot = state.activePlayer === 0 ? HOLE1_SHOTS[humanShot++]! : TINY_MISS;
      shoot(state, shot);
      if (check) expectRoundTrip(state);
      roll();
      if (check) expectRoundTrip(state);
    }
    expect(state.phase).toBe('holeOver');
    return JSON.stringify(state);
  };

  it('deep-equals the state at every phase of a scripted hole', () => {
    const course = hole1();
    const state = createMatch(99, [course, course, course]);
    expectRoundTrip(state);
    scriptedHole(state, course, true);
    expect(state.hole.result).toEqual(['holed', 'out']);
    expect(state.hole.shots).toEqual([3, 5]);
    expect(state.points).toEqual([1, 0]);
    expectRoundTrip(state);
    advance(state);
    expectRoundTrip(state);
  });

  it('continuing from a parsed copy taken mid-roll reaches the same final positions, bitwise', () => {
    const course = hole1();
    const original = createMatch(5, [course, course, course]);
    placeAtTee(original, course);
    shoot(original, HOLE1_SHOTS[0]!);
    // Part-way through the first roll, in the middle of the physics.
    for (let i = 0; i < 100; i++) stepMatch(original, course, FIXED_DT);
    expect(original.phase).toBe('rolling');
    const copy = snapshot(original);
    expect(copy).toStrictEqual(original);

    // Finish the first roll on both, then play the rest of the hole identically.
    const finish = (state: MatchState): string => {
      for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) stepMatch(state, course, FIXED_DT);
      let humanShot = 1;
      for (let guard = 0; guard < 20 && state.phase !== 'holeOver'; guard++) {
        if (state.phase === 'placing') placeAtTee(state, course);
        const shot = state.activePlayer === 0 ? HOLE1_SHOTS[humanShot++]! : TINY_MISS;
        shoot(state, shot);
        for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) stepMatch(state, course, FIXED_DT);
      }
      expect(state.phase).toBe('holeOver');
      return JSON.stringify(state);
    };

    const a = finish(original);
    const b = finish(copy);
    expect(b).toBe(a);
    for (const player of [0, 1] as const) {
      const ba = original.hole.balls[player]!;
      const bb = copy.hole.balls[player]!;
      expect(bb.x).toBe(ba.x);
      expect(bb.y).toBe(ba.y);
      expect(bb.rollTime).toBe(ba.rollTime);
    }
    expect(original.hole.balls[0]!.holed).toBe(true);
    expect(original.hole.balls[0]!.x).toBe(course.hole.x);
  });
});
