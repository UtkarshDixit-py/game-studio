// Course geometry. Pure data, no Phaser.
// Course units are design pixels; the playfield origin is its top-left corner.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Course {
  width: number;
  height: number;
  /** Interior walls as axis-aligned rectangles in course units. */
  walls: Rect[];
}

export const COURSE_WIDTH = 400;
export const COURSE_HEIGHT = 560;

/** The standard 400x560 playfield with no interior walls. */
export const emptyCourse = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
});
