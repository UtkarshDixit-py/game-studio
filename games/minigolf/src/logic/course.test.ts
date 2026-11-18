import { describe, expect, it } from 'vitest';
import {
  COURSE_HEIGHT,
  COURSE_WIDTH,
  HOLE_RADIUS,
  PORTAL_RADIUS,
  emptyCourse,
  rectCentre,
  validateCourse,
  type Course,
} from './course';
import { hole1 } from './courses/hole1';
import {
  conveyorCourt,
  openCourt,
  portalCourt,
  propCourt,
  sandCourt,
  starCourt,
  wallCourt,
  waterCourt,
} from './courses/testCourses';

/** Wall sticking out past the right edge plus a portal whose pair does not exist. */
const brokenCourse = (): Course => ({
  ...emptyCourse(),
  name: 'Broken',
  cap: 3,
  walls: [{ x: 380, y: 100, w: 40, h: 20 }],
  portals: [{ id: 'A', pair: 'B', x: 100, y: 280, r: PORTAL_RADIUS, exitDir: { x: 0, y: -1 } }],
});

describe('validateCourse', () => {
  it('accepts hole 1', () => {
    expect(validateCourse(hole1())).toEqual([]);
  });

  it('accepts every test fixture and the empty course', () => {
    for (const make of [emptyCourse, openCourt, wallCourt, sandCourt, waterCourt, conveyorCourt, portalCourt, propCourt, starCourt]) {
      expect(validateCourse(make())).toEqual([]);
    }
  });

  it('reports a wall outside the playfield and an unmatched portal as exactly 2 errors', () => {
    const errors = validateCourse(brokenCourse());
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/wall 0 .*outside/);
    expect(errors[1]).toMatch(/portal A .*no matching portal B/);
  });

  it('reports the hole, start zone or a portal sitting on a wall', () => {
    const course = portalCourt();
    course.walls.push({ x: course.hole.x - 5, y: course.hole.y - 5, w: 10, h: 10 });
    course.walls.push({ ...course.start });
    const portalA = course.portals[0]!;
    course.walls.push({ x: portalA.x - 2, y: portalA.y - 2, w: 4, h: 4 });
    const errors = validateCourse(course);
    expect(errors).toContain('hole overlaps wall 0');
    expect(errors).toContain('start zone overlaps wall 1');
    expect(errors).toContain('portal A overlaps wall 2');
    expect(errors).toHaveLength(3);
  });

  it('does not count a wall that merely touches the hole edge', () => {
    const course = emptyCourse();
    course.walls.push({ x: course.hole.x + HOLE_RADIUS, y: course.hole.y - 10, w: 20, h: 20 });
    expect(validateCourse(course)).toEqual([]);
  });

  it('reports a portal pair that does not point back', () => {
    const course = portalCourt();
    course.portals[1]!.pair = 'B';
    const errors = validateCourse(course);
    expect(errors).toHaveLength(2);
    expect(errors.some((e) => e.startsWith('portal A pairs with B but B pairs with B'))).toBe(true);
    expect(errors.some((e) => e.startsWith('portal B has no matching portal'))).toBe(true);
  });

  it('reports duplicate ids per kind and shapes of every kind outside the playfield', () => {
    const course = emptyCourse();
    course.props.push({ id: 'p', rect: { x: 0, y: 0, w: 10, h: 10 } }, { id: 'p', rect: { x: 50, y: 0, w: 10, h: 10 } });
    course.stars.push({ id: 's', x: 100, y: 100, r: 12 }, { id: 's', x: 150, y: 100, r: 12 });
    course.sand.push({ x: -1, y: 0, w: 10, h: 10 });
    course.water.push({ x: 0, y: COURSE_HEIGHT - 5, w: 10, h: 10 });
    course.conveyors.push({ rect: { x: COURSE_WIDTH - 5, y: 0, w: 10, h: 10 }, dir: 'up' });
    course.stars.push({ id: 'edge', x: 5, y: 100, r: 12 });
    course.start = { x: 0, y: -1, w: 40, h: 40 };
    course.hole = { x: 5, y: 300, r: HOLE_RADIUS };
    const errors = validateCourse(course);
    expect(errors).toContain('duplicate prop id p');
    expect(errors).toContain('duplicate star id s');
    expect(errors).toContain('sand 0 is outside the playfield');
    expect(errors).toContain('water 0 is outside the playfield');
    expect(errors).toContain('conveyor 0 is outside the playfield');
    expect(errors).toContain('star edge is outside the playfield');
    expect(errors).toContain('start zone is outside the playfield');
    expect(errors).toContain('hole is outside the playfield');
    expect(errors).toHaveLength(8);
  });
});

describe('course', () => {
  it('emptyCourse is the 400x560 playfield with no walls', () => {
    const course = emptyCourse();
    expect(course.width).toBe(400);
    expect(course.height).toBe(560);
    expect(COURSE_WIDTH).toBe(400);
    expect(COURSE_HEIGHT).toBe(560);
    expect(course.walls).toEqual([]);
  });

  it('returns a fresh object each call', () => {
    const a = emptyCourse();
    const b = emptyCourse();
    a.walls.push({ x: 0, y: 0, w: 10, h: 10 });
    expect(b.walls).toHaveLength(0);
    a.sand.push({ x: 0, y: 0, w: 10, h: 10 });
    expect(b.sand).toHaveLength(0);
    a.hole.x = 1;
    expect(b.hole.x).toBe(COURSE_WIDTH / 2);
  });

  it('emptyCourse has no sand, a radius-11 hole at the top and a tee at the bottom, all inside the court', () => {
    const c = emptyCourse();
    expect(c.sand).toEqual([]);
    expect(HOLE_RADIUS).toBe(11);
    expect(c.hole.r).toBe(HOLE_RADIUS);
    expect(c.hole.x).toBe(COURSE_WIDTH / 2);
    expect(c.hole.y).toBeGreaterThan(HOLE_RADIUS);
    expect(c.hole.y).toBeLessThan(COURSE_HEIGHT / 2);
    expect(c.start.x).toBeGreaterThanOrEqual(0);
    expect(c.start.x + c.start.w).toBeLessThanOrEqual(COURSE_WIDTH);
    expect(c.start.y).toBeGreaterThan(COURSE_HEIGHT / 2);
    expect(c.start.y + c.start.h).toBeLessThanOrEqual(COURSE_HEIGHT);
  });

  it('rectCentre returns the middle of a rectangle', () => {
    expect(rectCentre({ x: 10, y: 20, w: 40, h: 60 })).toEqual({ x: 30, y: 50 });
  });
});
