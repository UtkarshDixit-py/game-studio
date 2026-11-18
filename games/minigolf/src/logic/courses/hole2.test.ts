import { describe, expect, it } from 'vitest';
import { rectCentre, validateCourse } from '../course';
import { freshHoleFlags, simulateShot, type Ball, type BallEvent } from '../physics';
import { applyShot, type Shot } from '../shot';
import { PEG_SIZE, hole2 } from './hole2';

/**
 * Found by a brute-force search over angle x power from the tee and hard-coded
 * here. One shot: under the pond, through the sand, into the entry portal; the
 * ball comes out in the top band heading down, drops through the peg field on
 * the belt and into the cup.
 */
const SCRIPTED_SHOTS: Shot[] = [{ angle: 0.2793, power: 0.8 }];

/** Plays the scripted shots from the tee and returns the ball and every event. */
const playScript = (shots: Shot[]) => {
  const course = hole2();
  const flags = freshHoleFlags();
  const tee = rectCentre(course.start);
  let ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
  const perShot: BallEvent[][] = [];
  for (const shot of shots) {
    applyShot(ball, shot);
    const sim = simulateShot(ball, course, flags);
    ball = sim.ball;
    perShot.push(sim.events);
    if (ball.holed) break;
  }
  return { course, ball, perShot, events: perShot.flat() };
};

describe('hole 2: Portal pegs', () => {
  it('is a valid course with the layout the design asks for', () => {
    const course = hole2();
    expect(validateCourse(course)).toEqual([]);
    expect(course.name).toBe('Portal pegs');
    expect(course.cap).toBe(4);
    // Start zone at least 56x56, in the bottom band.
    expect(course.start.w).toBeGreaterThanOrEqual(56);
    expect(course.start.h).toBeGreaterThanOrEqual(56);
    expect(course.start.y).toBeGreaterThan(420);
    // Two band dividers spanning the width (the upper one with a gap), pegs in between.
    const dividers = course.walls.filter((w) => w.h === 16 && w.w >= 100);
    expect(dividers.length).toBeGreaterThanOrEqual(3);
    const pegs = course.walls.filter((w) => w.w === PEG_SIZE && w.h === PEG_SIZE);
    expect(pegs.length).toBeGreaterThanOrEqual(8);
    const rows = new Set(pegs.map((p) => p.y));
    expect(rows.size).toBeGreaterThanOrEqual(3);
    // Staggered: adjacent rows do not share x positions.
    const [r1, r2] = [...rows].sort((a, b) => a - b);
    const xs = (y: number) => pegs.filter((p) => p.y === y).map((p) => p.x);
    expect(xs(r1!).some((x) => xs(r2!).includes(x))).toBe(false);
    // Down-belt under the pegs, hole below the field at the bottom centre.
    expect(course.conveyors).toHaveLength(1);
    const belt = course.conveyors[0]!;
    expect(belt.dir).toBe('down');
    for (const peg of pegs) {
      expect(peg.y).toBeGreaterThanOrEqual(belt.rect.y);
      expect(peg.y + peg.h).toBeLessThanOrEqual(belt.rect.y + belt.rect.h);
    }
    expect(course.hole.x).toBe(course.width / 2);
    expect(course.hole.y).toBeGreaterThan(belt.rect.y + belt.rect.h);
    expect(course.hole.y).toBeLessThan(404);
    // Bottom band: portal, sand and water. Portal exit in the top band.
    expect(course.sand).toHaveLength(1);
    expect(course.water).toHaveLength(1);
    expect(course.sand[0]!.y).toBeGreaterThan(420);
    expect(course.water[0]!.y).toBeGreaterThan(420);
    const entry = course.portals.find((p) => p.y > 420)!;
    const exit = course.portals.find((p) => p.y < 120)!;
    expect(entry).toBeDefined();
    expect(exit).toBeDefined();
    expect(entry.pair).toBe(exit.id);
    expect(exit.pair).toBe(entry.id);
    expect(exit.exitDir).toEqual({ x: 0, y: 1 });
  });

  it('holes out within the cap with the scripted shots, passing through the portal', () => {
    const { course, ball, events, perShot } = playScript(SCRIPTED_SHOTS);
    expect(SCRIPTED_SHOTS.length).toBeLessThanOrEqual(course.cap);
    expect(ball.holed).toBe(true);
    expect(events.filter((e) => e === 'holed')).toHaveLength(1);
    expect(events).toContain('portal');
    expect(events).not.toContain('water');
    expect(events).not.toContain('timeout');
    expect(perShot).toHaveLength(SCRIPTED_SHOTS.length);
    expect(ball.x).toBe(course.hole.x);
    expect(ball.y).toBe(course.hole.y);
  });

  it('the scripted shots give bitwise-identical results on a second run', () => {
    const run = () => {
      const { ball, events } = playScript(SCRIPTED_SHOTS);
      return [ball.x, ball.y, events.join(',')];
    };
    expect(run()).toEqual(run());
  });

  it('a shot that misses the portal stays in the bottom band', () => {
    const course = hole2();
    const tee = rectCentre(course.start);
    const ball: Ball = { x: tee.x, y: tee.y, vx: 0, vy: 0 };
    // Straight right along the floor lane, below the portal.
    applyShot(ball, { angle: 0.1, power: 0.5 });
    const sim = simulateShot(ball, course);
    expect(sim.events).not.toContain('portal');
    expect(sim.ball.holed).toBeFalsy();
    expect(sim.ball.y).toBeGreaterThan(420);
  });

  it('a ball dropped onto the belt above the cup is carried down and in', () => {
    const course = hole2();
    const belt = course.conveyors[0]!;
    // Resting on the belt below the last peg row, lined up with the cup: the
    // belt brings it to belt speed and the grass strip slows it into the cup.
    const ball: Ball = { x: course.hole.x, y: belt.rect.y + belt.rect.h - 80, vx: 0, vy: 0 };
    const sim = simulateShot(ball, course);
    expect(sim.events).toContain('holed');
    expect(sim.ball.holed).toBe(true);
  });
});
