export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Angle in radians from a to b. */
export const angleTo = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x);

/** Wraps an angle into (-PI, PI]. */
export const wrapAngle = (rad: number): number => {
  const twoPi = Math.PI * 2;
  let r = ((rad + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (r === -Math.PI) r = Math.PI;
  return r;
};

export const length = (v: Vec2): number => Math.hypot(v.x, v.y);

export const normalize = (v: Vec2): Vec2 => {
  const len = length(v);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

/**
 * Deterministic PRNG (mulberry32). Use in game logic so tests can replay
 * exact sequences. Returns floats in [0, 1).
 */
export const createRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
