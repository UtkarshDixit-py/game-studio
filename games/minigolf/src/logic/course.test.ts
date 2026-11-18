import { describe, expect, it } from 'vitest';
import { COURSE_HEIGHT, COURSE_WIDTH, HOLE_RADIUS, emptyCourse, rectCentre } from './course';

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
