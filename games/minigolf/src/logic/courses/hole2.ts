// Hole 2: "Portal pegs". Pure data, no Phaser.
//
// Three horizontal bands separated by walls. The bottom band holds the start
// zone, a pond, a sand patch and the entry portal: the only way up is through
// the portal, so missing it wastes a shot. The portal exits into the top band
// heading straight down through a gap in the upper divider into the middle
// band: a down-conveyor under a staggered field of short wall pegs, with the
// hole in a strip of grass at the bottom of the field. The belt pushes the
// ball down through the pegs; a ball that misses the cup rests in the grass
// strip and needs another shot from inside the field.
import { COURSE_HEIGHT, COURSE_WIDTH, HOLE_RADIUS, PORTAL_RADIUS, type Course, type Rect } from '../course';

/** Side of each square peg. */
export const PEG_SIZE = 16;

/** Centre x positions of the three staggered peg rows, top to bottom. */
const PEG_ROWS: readonly { y: number; xs: readonly number[] }[] = [
  { y: 164, xs: [80, 160, 240, 320] },
  { y: 214, xs: [120, 200, 280] },
  { y: 264, xs: [80, 160, 240, 320] },
];

const pegs = (): Rect[] =>
  PEG_ROWS.flatMap((row) => row.xs.map((cx) => ({ x: cx - PEG_SIZE / 2, y: row.y, w: PEG_SIZE, h: PEG_SIZE })));

export const hole2 = (): Course => ({
  name: 'Portal pegs',
  cap: 4,
  width: COURSE_WIDTH,
  height: COURSE_HEIGHT,
  walls: [
    // Divider between the top band and the peg field, with a gap in the middle.
    { x: 0, y: 120, w: 120, h: 16 },
    { x: 280, y: 120, w: 120, h: 16 },
    // Solid divider between the peg field and the bottom band.
    { x: 0, y: 404, w: 400, h: 16 },
    ...pegs(),
  ],
  // A sand patch in the lower lane, just before the entry portal.
  sand: [{ x: 250, y: 506, w: 50, h: 54 }],
  // A pond in the middle of the bottom band; the lane under it stays dry.
  water: [{ x: 140, y: 436, w: 90, h: 70 }],
  // The whole peg field is a down-belt; the grass strip below it holds the cup.
  conveyors: [{ rect: { x: 0, y: 136, w: 400, h: 190 }, dir: 'down' }],
  portals: [
    { id: 'in', pair: 'out', x: 320, y: 530, r: PORTAL_RADIUS, exitDir: { x: 0, y: -1 } },
    { id: 'out', pair: 'in', x: 172, y: 60, r: PORTAL_RADIUS, exitDir: { x: 0, y: 1 } },
  ],
  props: [],
  stars: [],
  hole: { x: 200, y: 372, r: HOLE_RADIUS },
  start: { x: 24, y: 476, w: 64, h: 64 },
});
