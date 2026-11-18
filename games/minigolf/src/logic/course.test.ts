import { describe, expect, it } from 'vitest';
import { COURSE_HEIGHT, COURSE_WIDTH, emptyCourse } from './course';

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
  });
});
