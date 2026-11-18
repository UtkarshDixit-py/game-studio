// Hole 1: "Open field". Pure data, no Phaser.
//
// Teaches placement, power and water. The start zone sits bottom-left, a big
// pond ringed by four breakable props fills the middle, and the hole hides in
// the top-right corner inside an L-shaped wall that only opens upward, so the
// ball has to come in from above.
import { COURSE_HEIGHT, COURSE_WIDTH, HOLE_RADIUS, type Course } from '../course';

export const hole1 = (): Course => ({
  name: 'Open field',
  cap: 5,
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [
    // Upright of the L: left side of the pocket, leaving a gap above it.
    { x: 280, y: 48, w: 16, h: 112 },
    // Foot of the L: floor of the pocket, out to the right edge.
    { x: 280, y: 144, w: 120, h: 16 },
  ],
  sand: [],
  water: [{ x: 120, y: 210, w: 160, h: 130 }],
  conveyors: [],
  portals: [],
  props: [
    { id: 'ring-top', rect: { x: 170, y: 180, w: 60, h: 16 } },
    { id: 'ring-bottom', rect: { x: 170, y: 354, w: 60, h: 16 } },
    { id: 'ring-left', rect: { x: 90, y: 245, w: 16, h: 60 } },
    { id: 'ring-right', rect: { x: 294, y: 245, w: 16, h: 60 } },
  ],
  stars: [],
  hole: { x: 348, y: 72, r: HOLE_RADIUS },
  start: { x: 24, y: 472, w: 64, h: 64 },
});
