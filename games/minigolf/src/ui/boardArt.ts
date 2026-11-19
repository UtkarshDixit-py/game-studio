import Phaser from 'phaser';
import type { Course, Rect } from '../logic/course';
import { BALL_RADIUS } from '../logic/physics';
import hole1Base from '../assets/pd/courses/hole1-base.svg?url';
import hole1Surfaces from '../assets/pd/courses/hole1-surfaces.svg?url';
import hole1Markings from '../assets/pd/courses/hole1-markings.svg?url';
import hole1Boundaries from '../assets/pd/courses/hole1-boundaries.svg?url';
import hole2Base from '../assets/pd/courses/hole2-base.svg?url';
import hole2Surfaces from '../assets/pd/courses/hole2-surfaces.svg?url';
import hole2Markings from '../assets/pd/courses/hole2-markings.svg?url';
import hole2Boundaries from '../assets/pd/courses/hole2-boundaries.svg?url';
import hole3Base from '../assets/pd/courses/hole3-base.svg?url';
import hole3Surfaces from '../assets/pd/courses/hole3-surfaces.svg?url';
import hole3Markings from '../assets/pd/courses/hole3-markings.svg?url';
import hole3Boundaries from '../assets/pd/courses/hole3-boundaries.svg?url';
import ballYouUrl from '../assets/pd/sprites/ball-you.svg?url';
import ballBotUrl from '../assets/pd/sprites/ball-bot.svg?url';
import starUrl from '../assets/pd/sprites/star.svg?url';
import portalUrl from '../assets/pd/sprites/portal.svg?url';
import propHUrl from '../assets/pd/sprites/prop-h-60x16.svg?url';
import propVUrl from '../assets/pd/sprites/prop-v-16x60.svg?url';
import halo56Url from '../assets/pd/sprites/place-halo-56.svg?url';
import halo64Url from '../assets/pd/sprites/place-halo-64.svg?url';
import turfUrl from '../assets/pd/materials/turf-v2-sage.png?url';
import waterUrl from '../assets/pd/materials/water-r2.jpg?url';
import sandUrl from '../assets/pd/materials/sand-r2.jpg?url';

const LAYERS: ReadonlyArray<readonly [string, string, string, string]> = [
  [hole1Base, hole1Surfaces, hole1Markings, hole1Boundaries],
  [hole2Base, hole2Surfaces, hole2Markings, hole2Boundaries],
  [hole3Base, hole3Surfaces, hole3Markings, hole3Boundaries],
];

const LAYER_SUFFIXES = ['base', 'surfaces', 'markings', 'boundaries'] as const;
const BOARD_SCALE = 3;

export const preloadDesktopBoardAssets = (scene: Phaser.Scene): void => {
  LAYERS.forEach((layers, holeIndex) => {
    layers.forEach((url, layerIndex) => {
      const key = `pd-h${holeIndex + 1}-${LAYER_SUFFIXES[layerIndex]}`;
      if (!scene.textures.exists(key)) {
        scene.load.svg(key, url, { width: 424 * BOARD_SCALE, height: 584 * BOARD_SCALE });
      }
    });
  });
  for (const [key, url, width, height] of [
    ['pd-ball-you', ballYouUrl, 20, 20],
    ['pd-ball-bot', ballBotUrl, 20, 20],
    ['pd-star', starUrl, 28, 28],
    ['pd-portal', portalUrl, 32, 32],
    ['pd-prop-h', propHUrl, 62, 18],
    ['pd-prop-v', propVUrl, 18, 62],
    ['pd-halo-56', halo56Url, 72, 72],
    ['pd-halo-64', halo64Url, 80, 80],
  ] as const) {
    if (!scene.textures.exists(key)) scene.load.svg(key, url, { width: width * BOARD_SCALE, height: height * BOARD_SCALE });
  }
  if (!scene.textures.exists('pd-turf')) scene.load.image('pd-turf', turfUrl);
  if (!scene.textures.exists('pd-water-r2')) scene.load.image('pd-water-r2', waterUrl);
  if (!scene.textures.exists('pd-sand-r2')) scene.load.image('pd-sand-r2', sandUrl);
};

export class BoardArtView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly props = new Map<string, Phaser.GameObjects.Image>();
  private readonly stars = new Map<string, Phaser.GameObjects.Image>();
  private readonly portals = new Map<string, Phaser.GameObjects.Image>();
  private readonly balls: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private readonly halo: Phaser.GameObjects.Image;
  private haloVisible = false;
  private reducedMotion: boolean;
  private haloStop: (() => void) | null = null;

  constructor(scene: Phaser.Scene, course: Course, holeIndex: number, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
    this.root = scene.add.container(0, 0).setName('decor-pd-board').setDepth(0);
    const layers = LAYERS[Math.max(0, Math.min(2, holeIndex))]!;
    const addLayer = (index: number): void => {
      const image = scene.add
        .image(28, 138, `pd-h${holeIndex + 1}-${LAYER_SUFFIXES[index]}`)
        .setOrigin(0, 0)
        .setDisplaySize(424, 584)
        .setName(`decor-pd-layer-${LAYER_SUFFIXES[index]}`);
      this.root.add(image);
    };
    addLayer(0);
    // Round 2 sage turf fills the exact playfield; frame stays from the base layer.
    const turf = scene.add.image(40, 150, 'pd-turf').setOrigin(0, 0).setDisplaySize(400, 560).setName('decor-pd-turf');
    this.root.add(turf);
    addLayer(1);
    for (const pond of course.water) this.addWater(pond);
    for (const patch of course.sand) this.addSand(patch);
    addLayer(2);
    addLayer(3);

    for (const prop of course.props) {
      const horizontal = prop.rect.w >= prop.rect.h;
      const image = scene.add
        .image(40 + prop.rect.x + prop.rect.w / 2, 150 + prop.rect.y + prop.rect.h / 2, horizontal ? 'pd-prop-h' : 'pd-prop-v')
        .setDisplaySize(prop.rect.w + 2, prop.rect.h + 2)
        .setDepth(4)
        .setName(`decor-prop-${prop.id}`);
      this.props.set(prop.id, image);
      this.root.add(image);
    }
    for (const portal of course.portals) {
      const image = scene.add
        .image(40 + portal.x, 150 + portal.y, 'pd-portal')
        .setDisplaySize(32, 32)
        .setDepth(4)
        .setName(`decor-portal-${portal.id}`);
      this.portals.set(portal.id, image);
      this.root.add(image);
    }
    for (const star of course.stars) {
      const image = scene.add
        .image(40 + star.x, 150 + star.y, 'pd-star')
        .setDisplaySize(28, 28)
        .setDepth(4)
        .setName(`decor-star-${star.id}`);
      this.stars.set(star.id, image);
      this.root.add(image);
    }

    const start = course.start;
    const haloKey = start.w <= 56 ? 'pd-halo-56' : 'pd-halo-64';
    const haloSize = start.w <= 56 ? 72 : 80;
    this.halo = scene.add
      .image(40 + start.x + start.w / 2, 150 + start.y + start.h / 2, haloKey)
      .setDisplaySize(haloSize, haloSize)
      .setDepth(5)
      .setName('decor-place-halo')
      .setVisible(false);
    this.root.add(this.halo);

    this.balls = [
      scene.add.image(0, 0, 'pd-ball-you').setDisplaySize(20, 20).setDepth(11).setVisible(false).setName('decor-ball0'),
      scene.add.image(0, 0, 'pd-ball-bot').setDisplaySize(20, 20).setDepth(11).setVisible(false).setName('decor-ball1'),
    ];
    this.root.add(this.balls);
    void BALL_RADIUS;
  }

  setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void {
    for (const [id, prop] of this.props) prop.setVisible(!flags.brokenProps.includes(id));
    for (const [id, star] of this.stars) star.setVisible(!flags.collectedStars.includes(id));
  }

  setPlacementVisible(visible: boolean): void {
    this.haloVisible = visible;
    this.halo.setVisible(visible);
    this.stopHalo();
    if (!visible) return;
    this.halo.setAlpha(0.9);
    if (this.reducedMotion) return;
    const tween = this.scene.tweens.add({
      targets: this.halo,
      alpha: { from: 0.55, to: 1 },
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    this.haloStop = () => tween.stop();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      this.stopHalo();
      this.halo.setAlpha(0.9);
    } else if (this.haloVisible) {
      this.setPlacementVisible(true);
    }
  }

  setBall(player: 0 | 1, x: number, y: number, visible: boolean): void {
    this.balls[player].setPosition(40 + x, 150 + y).setVisible(visible);
  }

  hideBall(player: 0 | 1): void {
    this.balls[player].setVisible(false);
  }

  squashBall(player: 0 | 1, targetX: number, targetY: number, duration: number, onComplete: () => void): void {
    const image = this.balls[player];
    this.scene.tweens.add({
      targets: image,
      x: 40 + targetX,
      y: 150 + targetY,
      scaleX: image.scaleX * 1.3,
      scaleY: image.scaleY * 0.4,
      alpha: 0,
      duration,
      ease: 'Quad.easeIn',
      onComplete: () => {
        image.setVisible(false).setAlpha(1);
        onComplete();
      },
    });
  }

  resetBall(player: 0 | 1): void {
    const image = this.balls[player];
    this.scene.tweens.killTweensOf(image);
    image.setScale(1).setAlpha(1);
  }

  destroy(): void {
    this.stopHalo();
    this.root.destroy(true);
  }

  private addWater(pond: Rect): void {
    const tex = this.scene.textures.get('pd-water-r2').getSourceImage() as HTMLImageElement;
    const tile = this.scene.add
      .tileSprite(40 + pond.x, 150 + pond.y, pond.w, pond.h, 'pd-water-r2')
      .setOrigin(0, 0)
      .setTileScale(220 / tex.width, 220 / tex.height)
      .setTilePosition((tex.width - pond.w * (220 / tex.width)) / 2, (tex.height - pond.h * (220 / tex.height)) / 2)
      .setDepth(1.3)
      .setName('decor-pd-water');
    this.root.add(tile);
    const tint = this.scene.add
      .rectangle(40 + pond.x + pond.w / 2, 150 + pond.y + pond.h / 2, pond.w, pond.h, 0x3a84b6, 0.2)
      .setDepth(1.35)
      .setName('decor-pd-water-tint');
    this.root.add(tint);
    const rim = this.scene.add.graphics().setDepth(1.4).setName('decor-pd-water-rim');
    rim.lineStyle(1.6, 0xd3ecf7, 1);
    rim.strokeRect(40 + pond.x + 2, 150 + pond.y + 2, pond.w - 4, pond.h - 4);
    rim.lineStyle(1, 0x1a4763, 1);
    rim.strokeRect(40 + pond.x + 0.5, 150 + pond.y + 0.5, pond.w - 1, pond.h - 1);
    this.root.add(rim);
  }

  private addSand(patch: Rect): void {
    const tex = this.scene.textures.get('pd-sand-r2').getSourceImage() as HTMLImageElement;
    const tile = this.scene.add
      .tileSprite(40 + patch.x, 150 + patch.y, patch.w, patch.h, 'pd-sand-r2')
      .setOrigin(0, 0)
      .setTileScale(128 / tex.width, 128 / tex.height)
      .setTilePosition((tex.width - patch.w * (128 / tex.width)) / 2, (tex.height - patch.h * (128 / tex.height)) / 2)
      .setDepth(1.3)
      .setName('decor-pd-sand');
    this.root.add(tile);
    const edge = this.scene.add.graphics().setDepth(1.4).setName('decor-pd-sand-edge');
    edge.lineStyle(1, 0x4a341a, 1);
    edge.strokeRect(40 + patch.x + 0.5, 150 + patch.y + 0.5, patch.w - 1, patch.h - 1);
    this.root.add(edge);
  }

  private stopHalo(): void {
    this.haloStop?.();
    this.haloStop = null;
    this.scene.tweens.killTweensOf(this.halo);
  }
}
