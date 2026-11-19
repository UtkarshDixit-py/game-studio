import Phaser from 'phaser';
import { phaserColor, uiTokens } from '@studio/ui';
import { makeUiText } from '@studio/ui/phaser';
import type { Conveyor, Course, Rect } from '../logic/course';
import type { HoleFlags } from '../logic/physics';

/** Thickness of the wall border drawn around the playfield. */
export const COURSE_BORDER = 12;

const C = {
  border: uiTokens.course.wall,
  court: uiTokens.course.grass,
  wall: uiTokens.course.wall,
  wallEdge: uiTokens.course.wallEdge,
  water: uiTokens.course.water,
  waterMark: uiTokens.course.waterMark,
  sand: uiTokens.course.sand,
  sandMark: uiTokens.course.sandMark,
  conveyor: uiTokens.course.belt,
  conveyorArrow: uiTokens.course.beltMark,
  portal: uiTokens.course.portal,
  prop: uiTokens.course.prop,
  propEdge: uiTokens.course.propMark,
  star: uiTokens.course.star,
  hole: uiTokens.course.cup,
  holeRim: uiTokens.course.wall,
  startLight: uiTokens.color.text,
  startDark: uiTokens.color.outline,
  banner: uiTokens.color.surface,
  bannerStroke: uiTokens.color.outline,
  bannerText: uiTokens.color.text,
};

const color = phaserColor;

/**
 * Renders a `Course` with primitive shapes and deterministic texture marks.
 * All children live in course coordinates; position the container at the
 * course origin on screen. Gameplay geometry, names and flags are unchanged.
 */
export class CourseView extends Phaser.GameObjects.Container {
  private readonly props = new Map<string, Phaser.GameObjects.Container>();
  private readonly stars = new Map<string, Phaser.GameObjects.Shape>();

  constructor(scene: Phaser.Scene, course: Course, x = 0, y = 0) {
    super(scene, x, y);
    this.setName('course');

    this.add(this.makeCourt(course));

    course.water.forEach((pond, i) => this.add(this.makeWater(pond).setName(`water-${i}`)));
    course.sand.forEach((patch, i) => this.add(this.makeSand(patch).setName(`sand-${i}`)));
    course.conveyors.forEach((belt, i) => this.add(this.makeConveyor(belt).setName(`conveyor-${i}`)));

    this.add(this.makeStart(course.start));
    this.add(this.makeHole(course));

    course.walls.forEach((wall, i) => this.add(this.makeWall(wall).setName(`wall-${i}`)));

    for (const portal of course.portals) {
      const ring = new Phaser.GameObjects.Arc(scene, portal.x, portal.y, portal.r)
        .setStrokeStyle(4, color(C.portal), 1)
        .setName(`portal-${portal.id}`);
      const core = new Phaser.GameObjects.Arc(
        scene,
        portal.x,
        portal.y,
        portal.r * 0.35,
        0,
        360,
        false,
        color(C.portal),
        0.6,
      );
      this.add(ring);
      this.add(core);
    }

    for (const prop of course.props) {
      const crate = this.makeProp(prop);
      this.props.set(prop.id, crate);
      this.add(crate);
    }

    for (const star of course.stars) {
      const shape = new Phaser.GameObjects.Star(scene, star.x, star.y, 5, star.r * 0.45, star.r, color(C.star))
        .setStrokeStyle(1, color(C.hole), 1)
        .setName(`star-${star.id}`);
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
    g.fillStyle(color(C.border), 1);
    g.fillRect(-COURSE_BORDER, -COURSE_BORDER, course.width + COURSE_BORDER * 2, course.height + COURSE_BORDER * 2);
    g.fillStyle(color(C.court), 1);
    g.fillRect(0, 0, course.width, course.height);
    return g;
  }

  private makeRect(rect: Rect, fill: string): Phaser.GameObjects.Rectangle {
    return new Phaser.GameObjects.Rectangle(this.scene, rect.x, rect.y, rect.w, rect.h, color(fill)).setOrigin(0, 0);
  }

  private makeWall(rect: Rect): Phaser.GameObjects.Rectangle {
    return this.makeRect(rect, C.wall).setStrokeStyle(2, color(C.wallEdge), 1);
  }

  /** Water: token fill, 1 D inset boundary, deterministic wave marks. */
  private makeWater(pond: Rect): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene);
    g.fillStyle(color(C.water), 1);
    g.fillRect(pond.x, pond.y, pond.w, pond.h);
    g.lineStyle(1, color(C.waterMark), 1);
    g.strokeRect(pond.x + 0.5, pond.y + 0.5, pond.w - 1, pond.h - 1);

    const inset = 4;
    const left = pond.x + inset;
    const right = pond.x + pond.w - inset;
    const top = pond.y + inset;
    const bottom = pond.y + pond.h - inset;
    g.lineStyle(1, color(C.waterMark), 1);
    for (let row = 0, y = top + 2; y <= bottom - 2; row++, y += 24) {
      const offset = row % 2 === 0 ? 0 : 8;
      for (let x = left + offset; x <= right - 8; x += 16) {
        g.lineBetween(x, y, x + 4, y - 2);
        g.lineBetween(x + 4, y - 2, x + 8, y);
      }
    }
    return g;
  }

  /** Sand: token fill plus fixed stipple, 3 D inset, alternate rows. */
  private makeSand(patch: Rect): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene);
    g.fillStyle(color(C.sand), 1);
    g.fillRect(patch.x, patch.y, patch.w, patch.h);
    g.fillStyle(color(C.sandMark), 1);
    const inset = 3;
    let row = 0;
    for (let y = patch.y + inset; y <= patch.y + patch.h - inset; y += 12, row++) {
      const start = patch.x + inset + (row % 2 === 0 ? 0 : 6);
      for (let x = start; x <= patch.x + patch.w - inset; x += 12) {
        g.fillCircle(x, y, 1);
      }
    }
    return g;
  }

  private makeHole(course: Course): Phaser.GameObjects.Container {
    const { hole } = course;
    const rim = new Phaser.GameObjects.Arc(this.scene, 0, 0, hole.r + 3, 0, 360, false, color(C.holeRim), 1);
    const cup = new Phaser.GameObjects.Arc(this.scene, 0, 0, hole.r, 0, 360, false, color(C.hole), 1);
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
        g.fillStyle(color((row + col) % 2 === 0 ? C.startLight : C.startDark), 0.85);
        g.fillRect(zone.x + col * cw, zone.y + row * ch, cw, ch);
      }
    }
    g.lineStyle(2, color(C.startLight), 1);
    g.strokeRect(zone.x, zone.y, zone.w, zone.h);
    return g;
  }

  /** Belt with chevrons pointing along its direction and a 1 D inset boundary. */
  private makeConveyor(belt: Conveyor): Phaser.GameObjects.Graphics {
    const g = new Phaser.GameObjects.Graphics(this.scene);
    const { rect, dir } = belt;
    g.fillStyle(color(C.conveyor), 1);
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.lineStyle(1, color(C.conveyorArrow), 1);
    g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    g.lineStyle(3, color(C.conveyorArrow), 0.9);
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

  /** Breakable prop: rectangle plus two interior diagonal marks. */
  private makeProp(prop: { id: string; rect: Rect }): Phaser.GameObjects.Container {
    const { rect } = prop;
    const crate = new Phaser.GameObjects.Rectangle(this.scene, rect.x, rect.y, rect.w, rect.h, color(C.prop))
      .setOrigin(0, 0)
      .setStrokeStyle(2, color(C.propEdge), 1);
    const marks = new Phaser.GameObjects.Graphics(this.scene);
    marks.lineStyle(1, color(C.propEdge), 1);
    const inset = 3;
    marks.lineBetween(rect.x + inset, rect.y + inset, rect.x + rect.w - inset, rect.y + rect.h - inset);
    marks.lineBetween(rect.x + rect.w - inset, rect.y + inset, rect.x + inset, rect.y + rect.h - inset);
    return new Phaser.GameObjects.Container(this.scene, 0, 0, [crate, marks]).setName(`prop-${prop.id}`);
  }

  /**
   * `MAX SHOTS n` pill centred on the top edge of the border. Returned flat
   * (pill, then text) so `capBanner` is a direct child of the course container.
   */
  private makeBanner(course: Course): Phaser.GameObjects.GameObject[] {
    const cx = course.width / 2;
    const cy = -COURSE_BORDER;
    const pill = new Phaser.GameObjects.Graphics(this.scene).setName('capPill');
    pill.fillStyle(color(C.banner), 1);
    pill.fillRoundedRect(cx - 96, cy - 16, 192, 32, uiTokens.radius.small);
    pill.lineStyle(1, color(C.bannerStroke), 1);
    pill.strokeRoundedRect(cx - 96, cy - 16, 192, 32, uiTokens.radius.small);
    const text = makeUiText(this.scene, cx, cy, `MAX SHOTS ${course.cap}`, 'caption', C.bannerText, {
      originX: 0.5,
      originY: 0.5,
      align: 'center',
    })
      .setFontStyle(String(uiTokens.font.weight.bold))
      .setName('capBanner');
    return [pill, text];
  }
}
