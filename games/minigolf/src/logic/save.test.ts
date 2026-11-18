import { createMemoryStorage } from '@studio/core';
import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from './config';
import { rectCentre, type Course } from './course';
import { openCourt } from './courses/testCourses';
import { advance, createMatch, placeBall, shoot, stepMatch, type MatchState } from './match';
import { FIXED_DT } from './physics';
import { createMinigolfSave, formatRecord, isResumableMatch, recordResult, saveDefaults } from './save';

const STEP_CAP = 3000;

const rollToRest = (state: MatchState, course: Course): void => {
  for (let i = 0; i < STEP_CAP && state.phase === 'rolling'; i++) stepMatch(state, course, FIXED_DT);
  expect(state.phase).not.toBe('rolling');
};

/** A match one settled human turn in: ball placed and dribbled, bot to place. */
const settledMatch = (): MatchState => {
  const course = openCourt();
  const state = createMatch(9, [course, course, course]);
  placeBall(state, course, rectCentre(course.start));
  shoot(state, { angle: 0, power: 0.1 });
  rollToRest(state, course);
  expect(state.hole.shots[0]).toBe(1);
  expect(state.activePlayer).toBe(1);
  return state;
};

describe('createMinigolfSave', () => {
  it('returns the spec defaults from empty storage', () => {
    const save = createMinigolfSave(createMemoryStorage());
    expect(save.get()).toEqual({ version: 1, wins: 0, losses: 0, draws: 0, inProgress: null, muted: false });
    expect(saveDefaults()).toEqual(save.get());
  });

  it('writes under the minigolf:save key', () => {
    const storage = createMemoryStorage();
    createMinigolfSave(storage).set({ wins: 2 });
    expect(SAVE_KEY).toBe('minigolf:save');
    expect(JSON.parse(storage.getItem(SAVE_KEY)!)).toMatchObject({ wins: 2 });
  });

  it('returns defaults when the stored string is corrupt', () => {
    const storage = createMemoryStorage();
    storage.setItem(SAVE_KEY, '{wins: oops');
    expect(createMinigolfSave(storage).get()).toEqual(saveDefaults());
    storage.setItem(SAVE_KEY, 'null');
    expect(createMinigolfSave(storage).get()).toEqual(saveDefaults());
  });

  it('round-trips a full MatchState through inProgress', () => {
    const storage = createMemoryStorage();
    const state = settledMatch();
    createMinigolfSave(storage).set({ inProgress: state });
    const restored = createMinigolfSave(storage).get().inProgress;
    expect(restored).toStrictEqual(state);
    expect(restored).not.toBe(state);

    // The restored copy plays on exactly like the original.
    const course = openCourt();
    const again = JSON.parse(JSON.stringify(state)) as MatchState;
    for (const s of [restored!, again]) {
      placeBall(s, course, rectCentre(course.start));
      shoot(s, { angle: -Math.PI / 2, power: 0.5 });
      rollToRest(s, course);
    }
    expect(restored).toStrictEqual(again);
  });
});

describe('recordResult', () => {
  it('increments the right counter and clears the match in progress', () => {
    const save = createMinigolfSave(createMemoryStorage());
    save.set({ inProgress: settledMatch() });

    expect(recordResult(save, 0)).toMatchObject({ wins: 1, losses: 0, draws: 0, inProgress: null });
    expect(recordResult(save, 1)).toMatchObject({ wins: 1, losses: 1, draws: 0 });
    expect(recordResult(save, 1)).toMatchObject({ wins: 1, losses: 2, draws: 0 });
    expect(recordResult(save, 'draw')).toMatchObject({ wins: 1, losses: 2, draws: 1 });
    expect(save.get()).toMatchObject({ version: 1, wins: 1, losses: 2, draws: 1, inProgress: null, muted: false });
  });

  it('leaves the mute flag alone', () => {
    const save = createMinigolfSave(createMemoryStorage());
    save.set({ muted: true });
    expect(recordResult(save, 0).muted).toBe(true);
  });
});

describe('formatRecord', () => {
  it('prints W · L · D', () => {
    expect(formatRecord(saveDefaults())).toBe('W 0 · L 0 · D 0');
    expect(formatRecord({ ...saveDefaults(), wins: 3, losses: 12, draws: 1 })).toBe('W 3 · L 12 · D 1');
  });
});

describe('isResumableMatch', () => {
  it('accepts a live match at every resumable phase', () => {
    const course = openCourt();
    const state = createMatch(1, [course, course, course]);
    expect(isResumableMatch(state)).toBe(true);
    placeBall(state, course, rectCentre(course.start));
    expect(isResumableMatch(state)).toBe(true);
    shoot(state, { angle: 0, power: 0.1 });
    expect(isResumableMatch(state)).toBe(true);
    expect(isResumableMatch(settledMatch())).toBe(true);
  });

  it('rejects null, junk, a finished match and the wrong version', () => {
    expect(isResumableMatch(null)).toBe(false);
    expect(isResumableMatch('match')).toBe(false);
    expect(isResumableMatch({})).toBe(false);
    expect(isResumableMatch({ version: 1, holeIndex: 0 })).toBe(false);

    const course = openCourt();
    const done = createMatch(1, [course]);
    done.phase = 'holeOver';
    advance(done, 1);
    expect(done.phase).toBe('matchOver');
    expect(isResumableMatch(done)).toBe(false);

    const old = { ...createMatch(1, [course]), version: 0 };
    expect(isResumableMatch(old)).toBe(false);
  });
});
