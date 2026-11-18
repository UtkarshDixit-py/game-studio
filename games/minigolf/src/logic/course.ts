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
