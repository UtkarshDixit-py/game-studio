// Course geometry. Pure data, no Phaser.
// Course units are design pixels; the playfield origin is its top-left corner.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The cup. The ball is captured when its centre is within `r` and slow enough. */
export interface Hole {
  x: number;
  y: number;
  r: number;
}

export interface Course {
  width: number;
  height: number;
  /** Interior walls as axis-aligned rectangles in course units. */
  walls: Rect[];
  /** Sand patches: higher friction while the ball's centre is inside one. */
  sand: Rect[];
  hole: Hole;
  /** Where the ball is placed at the start of the hole. */
  start: Rect;
}

export const COURSE_WIDTH = 400;
export const COURSE_HEIGHT = 560;
export const HOLE_RADIUS = 11;

/** Centre point of a rectangle, e.g. the tee position of a course's `start`. */
export const rectCentre = (rect: Rect): { x: number; y: number } => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2,
});

/**
 * The standard 400x560 playfield with no interior walls or sand: tee at the
 * bottom centre, hole at the top centre.
 */
export const emptyCourse = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  hole: { x: COURSE_WIDTH / 2, y: 60, r: HOLE_RADIUS },
  start: { x: COURSE_WIDTH / 2 - 20, y: COURSE_HEIGHT - 100, w: 40, h: 40 },
});
