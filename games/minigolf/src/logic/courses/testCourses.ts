// Small course fixtures for unit tests. Pure data, no Phaser.
import {
  COURSE_HEIGHT,
  COURSE_WIDTH,
  HOLE_RADIUS,
  PORTAL_RADIUS,
  STAR_RADIUS,
  type Conveyor,
  type Course,
  type Portal,
  type Prop,
  type Rect,
  type Star,
} from '../course';

const bottomStart = (): Rect => ({ x: COURSE_WIDTH / 2 - 20, y: COURSE_HEIGHT - 100, w: 40, h: 40 });

/** Hole tucked in the top-right corner, out of the way of the fixtures' hazards. */
const cornerHole = () => ({ x: COURSE_WIDTH - 40, y: 40, r: HOLE_RADIUS });

const copyConveyor = (belt: Readonly<Conveyor>): Conveyor => ({ rect: { ...belt.rect }, dir: belt.dir });
const copyPortal = (portal: Readonly<Portal>): Portal => ({ ...portal, exitDir: { ...portal.exitDir } });
const copyProp = (prop: Readonly<Prop>): Prop => ({ id: prop.id, rect: { ...prop.rect } });
const copyStar = (star: Readonly<Star>): Star => ({ ...star });

/** Open 400x560 court, tee at the bottom, hole exactly in the centre. */
export const openCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [],
  portals: [],
  props: [],
  stars: [],
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
  water: [],
  conveyors: [],
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
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
  water: [],
  conveyors: [],
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/** The 200x100 pond of `waterCourt`, straight up the middle from the tee. */
export const WATER_COURT_POND: Readonly<Rect> = { x: 100, y: 200, w: 200, h: 100 };

/** Court with one pond between the tee and the top edge; the hole is in the top-right corner. */
export const waterCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [{ ...WATER_COURT_POND }],
  conveyors: [],
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/** The 100x100 up-conveyor of `conveyorCourt`, in the middle of the court. */
export const CONVEYOR_COURT_BELT: Readonly<Conveyor> = { rect: { x: 150, y: 300, w: 100, h: 100 }, dir: 'up' };

/** Court with one up-conveyor and plenty of open grass above it. */
export const conveyorCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [copyConveyor(CONVEYOR_COURT_BELT)],
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/** The 100-wide, 60-tall down-conveyor of `downConveyorCourt`. */
export const DOWN_CONVEYOR_COURT_BELT: Readonly<Conveyor> = { rect: { x: 150, y: 200, w: 100, h: 60 }, dir: 'down' };

/** Court with one short down-conveyor; balls approach it from below. */
export const downConveyorCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [copyConveyor(DOWN_CONVEYOR_COURT_BELT)],
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/**
 * Two facing 100x100 conveyors stacked with no gap: down on top, up below.
 * A ball starting on either one is thrown back and forth forever.
 */
export const PING_PONG_COURT_DOWN: Readonly<Conveyor> = { rect: { x: 150, y: 200, w: 100, h: 100 }, dir: 'down' };
export const PING_PONG_COURT_UP: Readonly<Conveyor> = { rect: { x: 150, y: 300, w: 100, h: 100 }, dir: 'up' };
export const PING_PONG_COURT_BELTS: readonly Readonly<Conveyor>[] = [PING_PONG_COURT_DOWN, PING_PONG_COURT_UP];

/** Court whose two facing conveyors never let a ball rest; only the roll timeout stops it. */
export const pingPongCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: PING_PONG_COURT_BELTS.map(copyConveyor),
  portals: [],
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/**
 * The portal pair of `portalCourt`: A on the left half of the court, B on the
 * right. A ball entering A comes out of B heading straight up; one entering B
 * comes out of A heading straight down.
 */
export const PORTAL_COURT_A: Readonly<Portal> = { id: 'A', pair: 'B', x: 100, y: 280, r: PORTAL_RADIUS, exitDir: { x: 0, y: 1 } };
export const PORTAL_COURT_B: Readonly<Portal> = { id: 'B', pair: 'A', x: 300, y: 280, r: PORTAL_RADIUS, exitDir: { x: 0, y: -1 } };
export const PORTAL_COURT_PORTALS: readonly Readonly<Portal>[] = [PORTAL_COURT_A, PORTAL_COURT_B];

/** Court with one portal pair at mid-height and nothing else in the way. */
export const portalCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [],
  portals: PORTAL_COURT_PORTALS.map(copyPortal),
  props: [],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/** The single 20x100 breakable crate of `propCourt`, in the same spot as `WALL_COURT_WALL`. */
export const PROP_COURT_PROP: Readonly<Prop> = { id: 'crate', rect: { x: 200, y: 230, w: 20, h: 100 } };

/** Court with one breakable prop standing upright in the middle. */
export const propCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [],
  portals: [],
  props: [copyProp(PROP_COURT_PROP)],
  stars: [],
  hole: cornerHole(),
  start: bottomStart(),
});

/** The single star of `starCourt`, dead centre of the court. */
export const STAR_COURT_STAR: Readonly<Star> = { id: 'star1', x: 200, y: 280, r: STAR_RADIUS };

/** Court with one star in the middle and nothing else. */
export const starCourt = (): Course => ({
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [],
  sand: [],
  water: [],
  conveyors: [],
  portals: [],
  props: [],
  stars: [copyStar(STAR_COURT_STAR)],
  hole: cornerHole(),
  start: bottomStart(),
});
