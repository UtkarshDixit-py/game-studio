import Phaser from 'phaser';
import type { Conveyor, Course, Rect } from '../logic/course';
import type { HoleFlags } from '../logic/physics';

/** Thickness of the wall border drawn around the playfield. */
export const COURSE_BORDER = 12;

const COLOURS = {
  border: 0x3a3f47,
  court: 0x2e8b45,
  wall: 0x3a3f47,
  wallEdge: 0x565c66,
  water: 0x2f6fd6,
  sand: 0xd9c38a,
  conveyor: 0x4a5160,
  conveyorArrow: 0xaab2c2,
  portal: 0x9b4dff,
  prop: 0xf08a2e,
  propEdge: 0xffb366,
  star: 0xffd93d,
  hole: 0x0b0d10,
  holeRim: 0x1e2a22,
  startLight: 0xdfe6ea,
  startDark: 0x8fa3ad,
  banner: 0x1c1f24,
  bannerText: '#ffffff',
};

/**
 * Renders a `Course` with primitive shapes. All children live in course
 * coordinates; position the container at the course origin on screen.
 * Children are named so tests can find them: `hole`, `start`, `wall-N`,
 * `water-N`, `sand-N`, `conveyor-N`, `portal-<id>`, `prop-<id>`, `star-<id>`,
 * plus the `capBanner` text on the top edge.
 */
export class CourseView extends Phaser.GameObjects.Container {
  private readonly props = new Map<string, Phaser.GameObjects.Shape>();
  private readonly stars = new Map<string, Phaser.GameObjects.Shape>();

  constructor(scene: Phaser.Scene, course: Course, x = 0, y = 0) {
    super(scene, x, y);
    this.setName('course');

    this.add(this.makeCourt(course));

    course.water.forEach((pond, i) => this.add(this.makeRect(pond, COLOURS.water).setName(`water-${i}`)));
    course.sand.forEach((patch, i) => this.add(this.makeRect(patch, COLOURS.sand).setName(`sand-${i}`)));
    course.conveyors.forEach((belt, i) => this.add(this.makeConveyor(belt).setName(`conveyor-${i}`)));

    this.add(this.makeStart(course.start));
    this.add(this.makeHole(course));

    course.walls.forEach((wall, i) => this.add(this.makeWall(wall).setName(`wall-${i}`)));

    for (const portal of course.portals) {
      const ring = new Phaser.GameObjects.Arc(scene, portal.x, portal.y, portal.r)
        .setStrokeStyle(4, COLOURS.portal, 1)
        .setName(`portal-${portal.id}`);
      const core = new Phaser.GameObjects.Arc(scene, portal.x, portal.y, portal.r * 0.35, 0, 360, false, COLOURS.portal, 0.6);
      this.add(ring);
      this.add(core);
    }

    for (const prop of course.props) {
      const crate = this.makeRect(prop.rect, COLOURS.prop).setStrokeStyle(2, COLOURS.propEdge, 1).setName(`prop-${prop.id}`);
      this.props.set(prop.id, crate);
      this.add(crate);
    }

    for (const star of course.stars) {
      const shape = new Phaser.GameObjects.Star(scene, star.x, star.y, 5, star.r * 0.45, star.r, COLOURS.star).setName(
        `star-${star.id}`,
      );
      this.stars.set(star.id, shape);
      this.add(shape);
    }

    for (const part of this.makeBanner(course)) this.add(part);
  }

  /** Hides props already broken and stars already collected on this hole. */
  setFlags(flags: HoleFlags): void {
    for (const [id, crate] of this.props) crate.setVisible(!flags.brokenProps.includes(id));
    for (const [id, star] of this.stars) star.setVisible(!flags.collectedStars.includes(id));
  }

  private makeCourt(course: Course): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene).setName('court');
    g.fillStyle(COLOURS.border, 1);
    g.fillRect(-COURSE_BORDER, -COURSE_BORDER, course.width + COURSE_BORDER * 2, course.height + COURSE_BORDER * 2);
    g.fillStyle(COLOURS.court, 1);
    g.fillRect(0, 0, course.width, course.height);
    return g;
  }

  private makeRect(rect: Rect, colour: number): Phaser.GameObjects.Rectangle {
    return new Phaser.GameObjects.Rectangle(this.scene, rect.x, rect.y, rect.w, rect.h, colour).setOrigin(0, 0);
  }

  private makeWall(rect: Rect): Phaser.GameObjects.Rectangle {
    return this.makeRect(rect, COLOURS.wall).setStrokeStyle(2, COLOURS.wallEdge, 1);
  }

  private makeHole(course: Course): Phaser.GameObjects.Container {
    const { hole } = course;
    const rim = new Phaser.GameObjects.Arc(this.scene, 0, 0, hole.r + 3, 0, 360, false, COLOURS.holeRim, 1);
    const cup = new Phaser.GameObjects.Arc(this.scene, 0, 0, hole.r, 0, 360, false, COLOURS.hole, 1);
    return new Phaser.GameObjects.Container(this.scene, hole.x, hole.y, [rim, cup]).setName('hole');
  }

  /** Checkered start zone: a 4x4 grid of light and dark cells. */
  private makeStart(zone: Rect): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene).setName('start');
    const cells = 4;
    const cw = zone.w / cells;
    const ch = zone.h / cells;
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        g.fillStyle((row + col) % 2 === 0 ? COLOURS.startLight : COLOURS.startDark, 0.85);
        g.fillRect(zone.x + col * cw, zone.y + row * ch, cw, ch);
      }
    }
    g.lineStyle(2, COLOURS.startLight, 1);
    g.strokeRect(zone.x, zone.y, zone.w, zone.h);
    return g;
  }

  /** Belt with chevrons pointing along its direction. */
  private makeConveyor(belt: Conveyor): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene);
    const { rect, dir } = belt;
    g.fillStyle(COLOURS.conveyor, 1);
    g.fillRect(rect.x, rect.y, rect.w, rect.h);

    g.lineStyle(3, COLOURS.conveyorArrow, 0.9);
    const vertical = dir === 'up' || dir === 'down';
    const along = vertical ? rect.h : rect.w;
    const across = vertical ? rect.w : rect.h;
    const spacing = 24;
    const half = Math.min(across / 2 - 4, 10);
    const sign = dir === 'down' || dir === 'right' ? 1 : -1;
    for (let d = spacing / 2; d < along - 4; d += spacing) {
      // Chevron tip at `d`, arms trailing back by `half` against the direction.
      const tip = (vertical ? rect.y : rect.x) + (sign > 0 ? d : along - d);
      const mid = (vertical ? rect.x : rect.y) + across / 2;
      const back = tip - sign * half;
      if (vertical) {
        g.lineBetween(mid - half, back, mid, tip);
        g.lineBetween(mid, tip, mid + half, back);
      } else {
        g.lineBetween(back, mid - half, tip, mid);
        g.lineBetween(tip, mid, back, mid + half);
      }
    }
    return g;
  }

  /**
   * `MAX SHOTS n` pill centred on the top edge of the border. Returned flat
   * (pill, then text) so `capBanner` is a direct child of the course container.
   */
  private makeBanner(course: Course): Phaser.GameObjects.GameObject[] {
    const cx = course.width / 2;
    const cy = -COURSE_BORDER;
    const pill = new Phaser.GameObjects.Rectangle(this.scene, cx, cy, 160, 28, COLOURS.banner)
      .setStrokeStyle(2, COLOURS.wallEdge, 1)
      .setName('capPill');
    const text = new Phaser.GameObjects.Text(this.scene, cx, cy, `MAX SHOTS ${course.cap}`, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: COLOURS.bannerText,
    })
      .setOrigin(0.5, 0.5)
      .setName('capBanner');
    return [pill, text];
  }
}
