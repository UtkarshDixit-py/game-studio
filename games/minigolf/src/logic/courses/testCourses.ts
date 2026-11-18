// Small course fixtures for unit tests. Pure data, no Phaser.
import { COURSE_HEIGHT, COURSE_WIDTH, HOLE_RADIUS, type Course, type Rect } from '../course';

const bottomStart = (): Rect => ({ x: COURSE_WIDTH / 2 - 20, y: COURSE_HEIGHT - 100, w: 40, h: 40 });

/** Open 400x560 court, tee at the bottom, hole exactly in the centre. */
export const openCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  hole: { x: COURSE_WIDTH / 2, y: COURSE_HEIGHT / 2, r: HOLE_RADIUS },
  start: bottomStart(),
});

/** The single 20x100 wall of `wallCourt`, standing upright in the middle. */
export const WALL_COURT_WALL: Readonly<Rect> = { x: 200, y: 230, w: 20, h: 100 };

/** Court with one 20x100 interior wall; the hole is tucked in the top-right corner. */
export const wallCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [{ ...WALL_COURT_WALL }],
  sand: [],
  hole: { x: COURSE_WIDTH - 40, y: 40, r: HOLE_RADIUS },
  start: bottomStart(),
});

/** The 100-unit wide vertical sand strip of `sandCourt`. */
export const SAND_COURT_STRIP: Readonly<Rect> = { x: 150, y: 0, w: 100, h: COURSE_HEIGHT };

/** Court with a full-height sand strip 100 units wide; the hole is in the top-right corner. */
export const sandCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [{ ...SAND_COURT_STRIP }],
  hole: { x: COURSE_WIDTH - 40, y: 40, r: HOLE_RADIUS },
  start: bottomStart(),
});
