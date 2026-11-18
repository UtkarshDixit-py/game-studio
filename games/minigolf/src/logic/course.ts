// Course geometry. Pure data, no Phaser.
// Course units are design pixels; the playfield origin is its top-left corner.
import type { Vec2 } from '@studio/core';

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

export type ConveyorDir = 'up' | 'down' | 'left' | 'right';

/** A moving belt. A ball whose centre is inside `rect` is carried along `dir`. */
export interface Conveyor {
  rect: Rect;
  dir: ConveyorDir;
}

/**
 * One end of a portal pair. A ball whose centre enters this circle appears at
 * the portal with id `pair`, offset along that portal's `exitDir`, heading the
 * same way at the same speed.
 */
export interface Portal {
  id: string;
  /** Id of the portal the ball comes out of. */
  pair: string;
  x: number;
  y: number;
  r: number;
  /** Unit vector the ball leaves along when it exits from this portal. */
  exitDir: Vec2;
}

/** A breakable prop. The first hit bounces softly and removes it for the hole. */
export interface Prop {
  id: string;
  rect: Rect;
}

/** A collectible star. Rolling the ball's centre over it picks it up once per hole. */
export interface Star {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface Course {
  /** Short display name, e.g. "Open field". */
  name: string;
  /** Shot cap: a player who has not holed out after this many shots is out. */
  cap: number;
  width: number;
  height: number;
  /** Interior walls as axis-aligned rectangles in course units. */
  walls: Rect[];
  /** Sand patches: higher friction while the ball's centre is inside one. */
  sand: Rect[];
  /** Water: a ball whose centre enters one goes back to where its shot started. */
  water: Rect[];
  /** Conveyor belts: the ball is carried along `dir` at belt speed. */
  conveyors: Conveyor[];
  /** Portals, paired by id. */
  portals: Portal[];
  /** Breakable props: soft bounce on the first hit, then gone for the hole. */
  props: Prop[];
  /** Stars to collect, each once per hole. */
  stars: Star[];
  hole: Hole;
  /** Where the ball is placed at the start of the hole. */
  start: Rect;
}

export const COURSE_WIDTH = 400;
export const COURSE_HEIGHT = 560;
export const HOLE_RADIUS = 11;
export const PORTAL_RADIUS = 14;
export const STAR_RADIUS = 12;

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
  name: 'Empty court',
  cap: 5,
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [],
  portals: [],
  props: [],
  stars: [],
  hole: { x: COURSE_WIDTH / 2, y: 60, r: HOLE_RADIUS },
  start: { x: COURSE_WIDTH / 2 - 20, y: COURSE_HEIGHT - 100, w: 40, h: 40 },
});

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** True when the rectangle lies fully inside the playfield (edges inclusive). */
const rectInside = (rect: Rect, course: Course): boolean =>
  rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= course.width && rect.y + rect.h <= course.height;

/** True when the circle lies fully inside the playfield (edges inclusive). */
const circleInside = (c: Circle, course: Course): boolean =>
  c.x - c.r >= 0 && c.y - c.r >= 0 && c.x + c.r <= course.width && c.y + c.r <= course.height;

/** True when two rectangles share any interior area (touching edges do not count). */
const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** True when a circle and a rectangle share any interior area (touching does not count). */
const circleOverlapsRect = (c: Circle, rect: Rect): boolean => {
  const cx = c.x < rect.x ? rect.x : c.x > rect.x + rect.w ? rect.x + rect.w : c.x;
  const cy = c.y < rect.y ? rect.y : c.y > rect.y + rect.h ? rect.y + rect.h : c.y;
  return Math.hypot(c.x - cx, c.y - cy) < c.r;
};

const duplicateIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
};

/**
 * Checks a course for design mistakes. Returns one message per problem and an
 * empty array for a valid course. Checks: every shape sits inside the
 * playfield; the hole, start zone and portals do not overlap walls; every
 * portal's `pair` names another portal that points back; ids are unique
 * within portals, props and stars.
 */
export const validateCourse = (course: Course): string[] => {
  const errors: string[] = [];
  const outside = (what: string) => errors.push(`${what} is outside the playfield`);

  course.walls.forEach((wall, i) => {
    if (!rectInside(wall, course)) outside(`wall ${i}`);
  });
  course.sand.forEach((patch, i) => {
    if (!rectInside(patch, course)) outside(`sand ${i}`);
  });
  course.water.forEach((pond, i) => {
    if (!rectInside(pond, course)) outside(`water ${i}`);
  });
  course.conveyors.forEach((belt, i) => {
    if (!rectInside(belt.rect, course)) outside(`conveyor ${i}`);
  });
  for (const prop of course.props) {
    if (!rectInside(prop.rect, course)) outside(`prop ${prop.id}`);
  }
  for (const star of course.stars) {
    if (!circleInside(star, course)) outside(`star ${star.id}`);
  }
  for (const portal of course.portals) {
    if (!circleInside(portal, course)) outside(`portal ${portal.id}`);
  }
  if (!rectInside(course.start, course)) outside('start zone');
  if (!circleInside(course.hole, course)) outside('hole');

  course.walls.forEach((wall, i) => {
    if (circleOverlapsRect(course.hole, wall)) errors.push(`hole overlaps wall ${i}`);
    if (rectsOverlap(course.start, wall)) errors.push(`start zone overlaps wall ${i}`);
    for (const portal of course.portals) {
      if (circleOverlapsRect(portal, wall)) errors.push(`portal ${portal.id} overlaps wall ${i}`);
    }
  });

  for (const portal of course.portals) {
    const pair = course.portals.find((other) => other.id === portal.pair);
    if (!pair || pair === portal) {
      errors.push(`portal ${portal.id} has no matching portal ${portal.pair}`);
    } else if (pair.pair !== portal.id) {
      errors.push(`portal ${portal.id} pairs with ${pair.id} but ${pair.id} pairs with ${pair.pair}`);
    }
  }

  for (const id of duplicateIds(course.portals.map((p) => p.id))) errors.push(`duplicate portal id ${id}`);
  for (const id of duplicateIds(course.props.map((p) => p.id))) errors.push(`duplicate prop id ${id}`);
  for (const id of duplicateIds(course.stars.map((s) => s.id))) errors.push(`duplicate star id ${id}`);

  return errors;
};
