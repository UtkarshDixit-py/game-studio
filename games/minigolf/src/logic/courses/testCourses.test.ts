import { describe, expect, it } from 'vitest';
import { HOLE_RADIUS } from '../course';
import { SAND_COURT_STRIP, WALL_COURT_WALL, openCourt, sandCourt, wallCourt } from './testCourses';

describe('test course fixtures', () => {
  it('openCourt has no walls or sand and a centre hole of radius 11', () => {
    const c = openCourt();
    expect(c.walls).toEqual([]);
    expect(c.sand).toEqual([]);
    expect(c.hole).toEqual({ x: 200, y: 280, r: HOLE_RADIUS });
    expect(HOLE_RADIUS).toBe(11);
  });

  it('wallCourt has exactly one 20x100 wall', () => {
    const c = wallCourt();
    expect(c.walls).toHaveLength(1);
    expect(c.walls[0]).toEqual(WALL_COURT_WALL);
    expect(c.walls[0]!.w).toBe(20);
    expect(c.walls[0]!.h).toBe(100);
    expect(c.sand).toEqual([]);
  });

  it('sandCourt has exactly one 100-unit wide sand strip', () => {
    const c = sandCourt();
    expect(c.sand).toHaveLength(1);
    expect(c.sand[0]).toEqual(SAND_COURT_STRIP);
    expect(c.sand[0]!.w).toBe(100);
    expect(c.walls).toEqual([]);
  });

  it('every fixture keeps the start and hole inside the playfield and apart', () => {
    for (const c of [openCourt(), wallCourt(), sandCourt()]) {
      expect(c.start.x).toBeGreaterThanOrEqual(0);
      expect(c.start.y).toBeGreaterThanOrEqual(0);
      expect(c.start.x + c.start.w).toBeLessThanOrEqual(c.width);
      expect(c.start.y + c.start.h).toBeLessThanOrEqual(c.height);
      expect(c.hole.x).toBeGreaterThan(c.hole.r);
      expect(c.hole.y).toBeGreaterThan(c.hole.r);
      expect(c.hole.x).toBeLessThan(c.width - c.hole.r);
      expect(c.hole.y).toBeLessThan(c.height - c.hole.r);
      const inStart =
        c.hole.x >= c.start.x &&
        c.hole.x <= c.start.x + c.start.w &&
        c.hole.y >= c.start.y &&
        c.hole.y <= c.start.y + c.start.h;
      expect(inStart).toBe(false);
    }
  });

  it('returns fresh objects each call', () => {
    const a = wallCourt();
    const b = wallCourt();
    a.walls[0]!.x = 999;
    expect(b.walls[0]!.x).toBe(WALL_COURT_WALL.x);
  });
});
