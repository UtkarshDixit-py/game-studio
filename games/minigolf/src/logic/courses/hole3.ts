// Hole 3: "Belt maze". Pure data, no Phaser.
//
// The start zone sits at the bottom of a narrow corridor on the left. A
// down-belt just above the start pushes weak shots straight back, so the first
// shot needs real power; past it an up-belt carries the ball to the top, where
// a right-belt sweeps it across to the top-right corner and over a star. From
// there the ball is shot down into a walled box in the middle of the court that
// holds the cup, with a sand patch beside it to catch hot shots. A short
// right-belt channel in the lower-right pushes stray balls sideways.
import { COURSE_HEIGHT, COURSE_WIDTH, HOLE_RADIUS, STAR_RADIUS, type Course } from '../course';

export const hole3 = (): Course => ({
  name: 'Belt maze',
  cap: 6,
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [
    // Right side of the left corridor; the corridor opens into the top band.
    { x: 80, y: 110, w: 16, h: 450 },
    // The box around the cup: left, right and floor, open at the top.
    { x: 158, y: 250, w: 12, h: 100 },
    { x: 270, y: 250, w: 12, h: 100 },
    { x: 158, y: 338, w: 124, h: 12 },
  ],
  // Sand inside the box, beside the cup.
  sand: [{ x: 170, y: 250, w: 30, h: 88 }],
  water: [],
  conveyors: [
    // Across the top, ending short of the right edge so the ball can rest there.
    { rect: { x: 0, y: 0, w: 300, h: 100 }, dir: 'right' },
    // Up the left corridor.
    { rect: { x: 0, y: 100, w: 80, h: 300 }, dir: 'up' },
    // Just above the start: weak shots are pushed back down.
    { rect: { x: 0, y: 400, w: 80, h: 70 }, dir: 'down' },
    // Sideways channel in the lower right.
    { rect: { x: 96, y: 440, w: 120, h: 60 }, dir: 'right' },
  ],
  portals: [],
  props: [],
  stars: [{ id: 'star', x: 340, y: 30, r: STAR_RADIUS }],
  hole: { x: 232, y: 300, r: HOLE_RADIUS },
  start: { x: 12, y: 492, w: 56, h: 56 },
});
