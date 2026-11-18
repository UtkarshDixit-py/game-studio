import { describe, expect, it } from 'vitest';
import { PORTAL_RADIUS, STAR_RADIUS, emptyCourse } from './course';
import {
  PORTAL_COURT_A,
  PORTAL_COURT_B,
  PROP_COURT_PROP,
  STAR_COURT_STAR,
  portalCourt,
  propCourt,
  starCourt,
} from './courses/testCourses';
import {
  BALL_RADIUS,
  FIXED_DT,
  FRICTION_GRASS,
  PORTAL_EXIT_OFFSET,
  PROP_RESTITUTION,
  freshHoleFlags,
  isAtRest,
  portalAt,
  stepBall,
  type Ball,
  type BallEvent,
  type HoleFlags,
} from './physics';

const count = (events: BallEvent[], kind: BallEvent): number => events.filter((e) => e === kind).length;

describe('physics: portals', () => {
  it('constants match the spec', () => {
    expect(PORTAL_RADIUS).toBe(14);
    expect(PORTAL_EXIT_OFFSET).toBe(23);
    expect(PORTAL_COURT_A.r).toBe(PORTAL_RADIUS);
    expect(PORTAL_COURT_B.r).toBe(PORTAL_RADIUS);
  });

  it('entering A puts the ball at B + exitDir*23 with the same speed heading along exitDir', () => {
    const course = portalCourt();
    const ball: Ball = { x: 40, y: PORTAL_COURT_A.y, vx: 300, vy: 0 };
    let teleported = false;
    let steps = 0;
    while (!teleported && steps < 300) {
      const before = { ...ball };
      const events = stepBall(ball, course, FIXED_DT);
      steps++;
      if (events.includes('portal')) {
        teleported = true;
        // Friction first, then the teleport keeps whatever speed is left.
        const speed = before.vx - FRICTION_GRASS * FIXED_DT;
        expect(ball.x).toBe(PORTAL_COURT_B.x + PORTAL_COURT_B.exitDir.x * PORTAL_EXIT_OFFSET);
        expect(ball.y).toBe(PORTAL_COURT_B.y + PORTAL_COURT_B.exitDir.y * PORTAL_EXIT_OFFSET);
        expect(ball.vx).toBe(0);
        expect(Math.abs(ball.vy - -speed)).toBeLessThan(1e-6);
        expect(Math.abs(Math.hypot(ball.vx, ball.vy) - speed)).toBeLessThan(1e-6);
        expect(ball.portalLock).toBe(true);
        expect(events).toEqual(['portal']);
      }
    }
    expect(teleported).toBe(true);
    // The ball's centre crossed into A (r=14) before the jump: it was past x=86.
    expect(steps * FIXED_DT * 300).toBeGreaterThan(PORTAL_COURT_A.x - PORTAL_COURT_A.r - 40);
  });

  it('is not re-teleported while leaving B and the lock clears once outside every portal', () => {
    const course = portalCourt();
    const ball: Ball = { x: 40, y: PORTAL_COURT_A.y, vx: 300, vy: 0 };
    let portals = 0;
    for (let i = 0; i < 300; i++) portals += count(stepBall(ball, course, FIXED_DT), 'portal');
    expect(portals).toBe(1);
    expect(ball.portalLock).toBe(false);
    expect(isAtRest(ball)).toBe(true);
    // Came out of B heading up and stayed on that side.
    expect(ball.x).toBe(PORTAL_COURT_B.x);
    expect(ball.y).toBeLessThan(PORTAL_COURT_B.y - PORTAL_COURT_B.r);
    expect(portalAt(ball, course)).toBeUndefined();
  });

  it('a locked ball inside B rolls out without jumping; the same ball unlocked jumps to A', () => {
    const inside: Ball = { x: PORTAL_COURT_B.x, y: PORTAL_COURT_B.y - 5, vx: 0, vy: -300 };

    const locked: Ball = { ...inside, portalLock: true };
    let portals = 0;
    for (let i = 0; i < 300; i++) portals += count(stepBall(locked, portalCourt(), FIXED_DT), 'portal');
    expect(portals).toBe(0);
    expect(locked.portalLock).toBe(false);
    expect(locked.y).toBeLessThan(PORTAL_COURT_B.y - PORTAL_COURT_B.r);

    const unlocked: Ball = { ...inside };
    const events = stepBall(unlocked, portalCourt(), FIXED_DT);
    expect(events).toEqual(['portal']);
    expect(unlocked.x).toBe(PORTAL_COURT_A.x + PORTAL_COURT_A.exitDir.x * PORTAL_EXIT_OFFSET);
    expect(unlocked.y).toBe(PORTAL_COURT_A.y + PORTAL_COURT_A.exitDir.y * PORTAL_EXIT_OFFSET);
    expect(unlocked.vx).toBe(0);
    expect(unlocked.vy).toBeGreaterThan(0);
  });

  it('a course without portals never sets the lock', () => {
    const ball: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    for (let i = 0; i < 300; i++) stepBall(ball, emptyCourse(), FIXED_DT);
    expect(ball.portalLock).toBeUndefined();
  });
});

describe('physics: breakable props', () => {
  const prop = PROP_COURT_PROP;

  it('constants match the spec', () => {
    expect(PROP_RESTITUTION).toBe(0.5);
  });

  it('the first hit reflects the normal speed × 0.5, records the id and emits break', () => {
    const course = propCourt();
    const flags = freshHoleFlags();
    const ball: Ball = { x: 100, y: prop.rect.y + prop.rect.h / 2, vx: 300, vy: 0 };
    let breaks = 0;
    let contactChecked = false;
    for (let i = 0; i < 300; i++) {
      const before = { ...ball };
      const events = stepBall(ball, course, FIXED_DT, flags);
      breaks += count(events, 'break');
      if (before.vx > 0 && ball.vx < 0) {
        const expected = -PROP_RESTITUTION * (before.vx - FRICTION_GRASS * FIXED_DT);
        expect(Math.abs(ball.vx - expected)).toBeLessThan(1e-6);
        expect(ball.vy).toBe(0);
        expect(events).toEqual(['break']);
        expect(flags.brokenProps).toEqual([prop.id]);
        contactChecked = true;
      }
    }
    expect(contactChecked).toBe(true);
    expect(breaks).toBe(1);
    expect(flags.brokenProps).toEqual([prop.id]);
    expect(ball.x).toBeLessThanOrEqual(prop.rect.x - BALL_RADIUS);
    expect(isAtRest(ball)).toBe(true);
  });

  it('a second ball rolls straight through a broken prop with the same flags', () => {
    const course = propCourt();
    const flags = freshHoleFlags();
    const first: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    for (let i = 0; i < 300; i++) stepBall(first, course, FIXED_DT, flags);
    expect(flags.brokenProps).toEqual([prop.id]);

    const second: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    const events: BallEvent[] = [];
    for (let i = 0; i < 300; i++) events.push(...stepBall(second, course, FIXED_DT, flags));
    expect(events).toEqual([]);
    expect(flags.brokenProps).toEqual([prop.id]);
    expect(second.x).toBeGreaterThan(prop.rect.x + prop.rect.w + BALL_RADIUS);
    expect(second.y).toBe(280);
    expect(isAtRest(second)).toBe(true);
  });

  it('flags that already list the prop as broken make it a ghost', () => {
    const course = propCourt();
    const flags: HoleFlags = { brokenProps: [prop.id], collectedStars: [] };
    const ball: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    const reference: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    for (let i = 0; i < 300; i++) {
      expect(stepBall(ball, course, FIXED_DT, flags)).toEqual([]);
      stepBall(reference, emptyCourse(), FIXED_DT);
    }
    expect(flags.brokenProps).toEqual([prop.id]);
    expect(Object.is(ball.x, reference.x)).toBe(true);
    expect(Object.is(ball.y, reference.y)).toBe(true);
  });

  it('without flags every call gets a throwaway set, so the prop still bounces and breaks', () => {
    const ball: Ball = { x: 100, y: 280, vx: 300, vy: 0 };
    let breaks = 0;
    for (let i = 0; i < 300; i++) breaks += count(stepBall(ball, propCourt(), FIXED_DT), 'break');
    expect(breaks).toBe(1);
    expect(ball.x).toBeLessThan(prop.rect.x);
  });
});

describe('physics: stars', () => {
  const star = STAR_COURT_STAR;

  it('constants match the spec', () => {
    expect(STAR_RADIUS).toBe(12);
    expect(star.r).toBe(STAR_RADIUS);
  });

  it('rolling over a star records its id once, emits star once and does not alter the roll', () => {
    const course = starCourt();
    const flags = freshHoleFlags();
    const ball: Ball = { x: 100, y: star.y, vx: 300, vy: 0 };
    const reference: Ball = { x: 100, y: star.y, vx: 300, vy: 0 };
    let stars = 0;
    for (let i = 0; i < 300; i++) {
      const events = stepBall(ball, course, FIXED_DT, flags);
      stars += count(events, 'star');
      stepBall(reference, emptyCourse(), FIXED_DT);
    }
    expect(stars).toBe(1);
    expect(flags.collectedStars).toEqual([star.id]);
    expect(ball.x).toBeGreaterThan(star.x + star.r);
    expect(Object.is(ball.x, reference.x)).toBe(true);
    expect(Object.is(ball.y, reference.y)).toBe(true);
    expect(Object.is(ball.vx, reference.vx)).toBe(true);
  });

  it('a second pass over a collected star adds nothing', () => {
    const course = starCourt();
    const flags = freshHoleFlags();
    const first: Ball = { x: 100, y: star.y, vx: 300, vy: 0 };
    for (let i = 0; i < 300; i++) stepBall(first, course, FIXED_DT, flags);
    expect(flags.collectedStars).toEqual([star.id]);

    const second: Ball = { x: 100, y: star.y, vx: 300, vy: 0 };
    const events: BallEvent[] = [];
    for (let i = 0; i < 300; i++) events.push(...stepBall(second, course, FIXED_DT, flags));
    expect(events).toEqual([]);
    expect(flags.collectedStars).toEqual([star.id]);
  });

  it('a ball passing just outside the star radius does not collect it', () => {
    const course = starCourt();
    const flags = freshHoleFlags();
    const ball: Ball = { x: 100, y: star.y + star.r + 0.5, vx: 300, vy: 0 };
    for (let i = 0; i < 300; i++) stepBall(ball, course, FIXED_DT, flags);
    expect(flags.collectedStars).toEqual([]);
    expect(ball.x).toBeGreaterThan(star.x + star.r);
  });

  it('freshHoleFlags returns independent empty sets', () => {
    const a = freshHoleFlags();
    const b = freshHoleFlags();
    a.brokenProps.push('x');
    a.collectedStars.push('y');
    expect(b).toEqual({ brokenProps: [], collectedStars: [] });
  });
});
