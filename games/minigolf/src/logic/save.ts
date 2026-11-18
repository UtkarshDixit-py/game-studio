// Save slot: lifetime record, the match in progress and the mute flag.
// Pure TypeScript: no Phaser, no wall-clock, no Math.random.
import { createSaveStore, type SaveStore, type StorageLike } from '@studio/core';
import { SAVE_KEY } from './config';
import { MATCH_VERSION, type MatchPhase, type MatchState, type Player } from './match';

/** Schema version of `MinigolfSave`, bumped when the shape changes. */
export const SAVE_VERSION = 1;

export interface MinigolfSave {
  version: number;
  wins: number;
  losses: number;
  draws: number;
  /** The match to resume from the title screen, or null. Never saved mid-roll. */
  inProgress: MatchState | null;
  muted: boolean;
}

export type MinigolfSaveStore = SaveStore<MinigolfSave>;

/** A fresh save: no record, nothing in progress, sound on. */
export const saveDefaults = (): MinigolfSave => ({
  version: SAVE_VERSION,
  wins: 0,
  losses: 0,
  draws: 0,
  inProgress: null,
  muted: false,
});

/**
 * The game's save store under `SAVE_KEY`. Pass a `StorageLike` to inject a
 * fake in tests; otherwise `createSaveStore` picks `localStorage` (or memory
 * when storage is blocked). Corrupt data falls back to `saveDefaults()`.
 */
export const createMinigolfSave = (storage?: StorageLike): MinigolfSaveStore =>
  storage ? createSaveStore(SAVE_KEY, saveDefaults(), storage) : createSaveStore(SAVE_KEY, saveDefaults());

/**
 * Records a finished match: bumps `wins` (human, player 0), `losses` (bot) or
 * `draws`, and clears `inProgress` since that match is over. Returns the saved
 * value.
 */
export const recordResult = (save: MinigolfSaveStore, winner: Player | 'draw'): MinigolfSave => {
  const current = save.get();
  const patch: Partial<MinigolfSave> = { inProgress: null };
  if (winner === 0) patch.wins = current.wins + 1;
  else if (winner === 1) patch.losses = current.losses + 1;
  else patch.draws = current.draws + 1;
  return save.set(patch);
};

/** The title-screen record line, e.g. `W 0 · L 0 · D 0`. */
export const formatRecord = (save: MinigolfSave): string => `W ${save.wins} · L ${save.losses} · D ${save.draws}`;

const PHASES: readonly MatchPhase[] = ['placing', 'aiming', 'rolling', 'holeOver', 'matchOver'];

/**
 * True when `value` looks like a `MatchState` from this version that can be
 * resumed: an object with the right version, a numeric hole index, a known
 * phase other than `matchOver`, and a hole with two ball slots. Protects the
 * scene from hand-edited or stale storage.
 */
export const isResumableMatch = (value: unknown): value is MatchState => {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<MatchState>;
  if (state.version !== MATCH_VERSION) return false;
  if (typeof state.holeIndex !== 'number' || !Number.isInteger(state.holeIndex) || state.holeIndex < 0) return false;
  if (typeof state.phase !== 'string' || !PHASES.includes(state.phase) || state.phase === 'matchOver') return false;
  if (state.activePlayer !== 0 && state.activePlayer !== 1) return false;
  if (!Array.isArray(state.points) || state.points.length !== 2) return false;
  if (typeof state.hole !== 'object' || state.hole === null) return false;
  const { hole } = state;
  if (!Array.isArray(hole.balls) || hole.balls.length !== 2) return false;
  if (!Array.isArray(hole.shots) || hole.shots.length !== 2) return false;
  return true;
};
