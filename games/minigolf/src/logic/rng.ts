// Stateless mulberry32 step. Pure TypeScript, no Phaser.
//
// The match state keeps its RNG as a plain u32 (`rngState`) so that
// `JSON.parse(JSON.stringify(state))` is a complete restore. `createRng` in
// core hides its state in a closure, so this is the same generator written as
// a pure function: feed the previous state in, get the next state and value out.

export interface RngStep {
  /** Next generator state, an unsigned 32-bit integer. Store this. */
  state: number;
  /** A float in [0, 1). */
  value: number;
}

/**
 * Advances a mulberry32 generator by one step. Bitwise-identical to calling
 * the function returned by `createRng(state)` from `@studio/core` once.
 */
export const stepRng = (state: number): RngStep => {
  const s = ((state >>> 0) + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
};
