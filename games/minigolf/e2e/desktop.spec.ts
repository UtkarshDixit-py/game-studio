import { expect, test, type Page } from '@playwright/test';
import type { MatchState } from '../src/logic/match';

// Putt Duel desktop tabletop. Phone/landscape fallback stays covered by the
// existing ui.spec.ts suite at its default portrait viewport.

type PlayHandle = Phaser.Scene & {
  getState(): MatchState;
  getBoardArt(): {
    root: Phaser.GameObjects.Container;
    setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void;
  } | null;
};

const START = { x: 24, y: 472, w: 64, h: 64 };
const COURSE_ORIGIN = { x: 40, y: 150 };
const SIZES = [
  { width: 1280, height: 720, board: { x: 448, y: 85, w: 383, h: 528 }, group: { x: 184, y: 29, w: 911, h: 662 }, s: 0.9041 },
  { width: 1440, height: 900, board: { x: 460, y: 88, w: 520, h: 716 }, group: { x: 196, y: 32, w: 1048, h: 836 }, s: 1.2260 },
  { width: 1920, height: 1080, board: { x: 642, y: 98, w: 636, h: 876 }, group: { x: 346, y: 42, w: 1228, h: 996 }, s: 1.5 },
] as const;

const getState = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState());

const bootDesktop = async (page: Page, width = 1440, height = 900, path = '/') => {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title') || window.__GAME__!.scene.isActive('Play'));
};

const waitPlay = async (page: Page, path = '/?seed=1') => {
  await bootDesktop(page, 1440, 900, path);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await page.waitForFunction(() => document.querySelector('.pd-play')?.hasAttribute('hidden') === false);
};

const canvasPoint = async (page: Page, x: number, y: number) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 800) * box.height };
};

const canvasScale = async (page: Page) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return box.width / 480;
};

const restartWith = async (page: Page, state: MatchState) => {
  await page.evaluate((fixture) => window.__GAME__!.scene.getScene('Play').scene.start('Play', { resume: fixture }), state);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await page.waitForFunction((phase) => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState().phase === phase, state.phase);
};

const ball = (x: number, y: number, holed = false) => ({
  x, y, vx: 0, vy: 0, holed, shotOrigin: { x, y }, rollTime: 0, portalLock: false,
});

const aimingFixture: MatchState = {
  version: 1,
  seed: 1,
  rngState: 1,
  holeIndex: 0,
  points: [0, 0],
  activePlayer: 0,
  phase: 'aiming',
  hole: {
    shots: [0, 0],
    extraShots: [0, 0],
    result: ['playing', 'playing'],
    balls: [ball(56, 504), null],
    brokenProps: [],
    collectedStars: [],
    lastResult: null,
  },
};

const aimingCentreFixture: MatchState = {
  ...aimingFixture,
  hole: { ...aimingFixture.hole, balls: [ball(240, 400), null] },
};

const angleDelta = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const RGB = /rgba?\((\d+),\s*(\d+),\s*(\d+)/;
const luminance = (rgb: [number, number, number]): number => {
  const channels = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
};
const contrast = (foreground: string, background: string): number => {
  const parse = (value: string): [number, number, number] => {
    const match = value.match(RGB);
    if (!match) throw new Error(`Unsupported colour ${value}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const [light, dark] = [luminance(parse(foreground)), luminance(parse(background))].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
};

const probeAim = (page: Page) =>
  page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & {
      pendingShot: { power: number; angle: number } | null;
      aimLine: Phaser.GameObjects.Graphics;
      powerLabel: Phaser.GameObjects.Text;
    };
    const readout = document.querySelector<HTMLElement>('.pd-power');
    return {
      power: scene.pendingShot?.power ?? null,
      angle: scene.pendingShot?.angle ?? null,
      lineVisible: scene.aimLine.visible,
      badgeVisible: scene.powerLabel.visible,
      placard: readout && !readout.hidden ? readout.textContent : null,
    };
  });

const holeOverFixture: MatchState = {
  version: 1,
  seed: 1,
  rngState: 1,
  holeIndex: 1,
  points: [1, 0],
  activePlayer: 0,
  phase: 'holeOver',
  hole: {
    shots: [2, 4],
    extraShots: [0, 0],
    result: ['holed', 'out'],
    balls: [ball(200, 372, true), ball(100, 100)],
    brokenProps: [],
    collectedStars: [],
    lastResult: [1, 0],
  },
};

const matchOverFixture: MatchState = {
  ...holeOverFixture,
  holeIndex: 2,
  points: [3, 2],
  phase: 'matchOver',
  hole: {
    ...holeOverFixture.hole,
    balls: [ball(232, 300, true), ball(200, 300, true)],
    shots: [2, 3],
    result: ['holed', 'holed'],
  },
};

test('desktop title uses the approved tabletop title and sound/actions', async ({ page }) => {
  await bootDesktop(page);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  const title = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
    return {
      body: document.body.classList.contains('pd-desktop'),
      titleHidden: document.querySelector('.pd-title')?.hasAttribute('hidden'),
      playHidden: document.querySelector('.pd-play')?.hasAttribute('hidden'),
      sidebarDisplay: getComputedStyle(document.getElementById('ui-sidebar')!).display,
      heroLoaded: (document.querySelector('.pd-hero img') as HTMLImageElement | null)?.naturalWidth ?? 0,
      play: rect('[data-action-id="playButton"]'),
      sound: rect('[data-action-id="muteButton"]'),
      continueCount: document.querySelectorAll('[data-action-id="continueButton"]').length,
      rotateText: (document.querySelector('.ui-sidebar')?.textContent ?? '').includes('Rotate for a larger course'),
    };
  });
  expect(title.body).toBe(true);
  expect(title.titleHidden).toBe(false);
  expect(title.playHidden).toBe(true);
  expect(title.sidebarDisplay).toBe('none');
  expect(title.heroLoaded).toBeGreaterThan(0);
  expect(title.play!.width).toBeGreaterThanOrEqual(44);
  expect(title.play!.height).toBeGreaterThanOrEqual(44);
  expect(title.sound!.width).toBeGreaterThanOrEqual(44);
  expect(title.sound!.height).toBeGreaterThanOrEqual(44);
  expect(title.continueCount).toBe(0);
  expect(title.rotateText).toBe(false);
});

test('desktop saved title shows Continue and restores the saved hole', async ({ page }) => {
  await bootDesktop(page);
  await page.evaluate(() => localStorage.clear());
  const saved = {
    version: 1,
    wins: 3,
    losses: 1,
    draws: 0,
    inProgress: aimingFixture,
    muted: false,
  };
  await page.evaluate((value) => localStorage.setItem('minigolf:save', JSON.stringify(value)), saved);
  await page.reload();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));
  await expect(page.locator('[data-action-id="continueButton"]')).toBeVisible();
  await expect(page.locator('[data-action-id="continueButton"]')).toHaveText('CONTINUE · HOLE 1');
  expect(await page.locator('.pd-record').textContent()).toContain('W 3 · L 1 · D 0');
  await page.locator('[data-action-id="continueButton"]').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  expect((await getState(page)).holeIndex).toBe(0);
  expect((await getState(page)).hole.shots).toEqual([0, 0]);
});

test('desktop board, cards and group match the measured size matrix', async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/?hole=2&seed=1');
    await page.waitForFunction(() => window.__GAME__?.isBooted === true);
    await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
    await page.waitForFunction(() => document.querySelector('.pd-play')?.hasAttribute('hidden') === false);
    await page.waitForFunction(() => window.__GAME__!.textures.exists('pd-h2-base'));
    const info = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
      const cards = [...document.querySelectorAll('.pd-card')].map((card) => card.getBoundingClientRect().toJSON());
      return {
        board: rect('.pd-board'),
        group: rect('.pd-play'),
        header: rect('.pd-header'),
        placard: rect('.pd-placard'),
        cards,
        canvas: rect('canvas'),
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        pips: document.querySelectorAll('.pd-pip').length,
        headerText: document.querySelector('.pd-holename')?.textContent,
        cap: document.querySelector('.pd-chip')?.textContent,
      };
    });
    expect(info.board!.x, `${size.width} board x`).toBeCloseTo(size.board.x, 0);
    expect(info.board!.y, `${size.width} board y`).toBeCloseTo(size.board.y, 0);
    expect(info.board!.width, `${size.width} board w`).toBeCloseTo(size.board.w, 0);
    expect(info.board!.height, `${size.width} board h`).toBeCloseTo(size.board.h, 0);
    expect(info.group!.width, `${size.width} group w`).toBeCloseTo(size.group.w, 0);
    expect(info.group!.height, `${size.width} group h`).toBeCloseTo(size.group.h, 0);
    expect(info.group!.x + info.group!.width / 2, `${size.width} group centre`).toBeCloseTo(size.width / 2, 0);
    expect(info.group!.y + info.group!.height / 2, `${size.width} group centre y`).toBeCloseTo(size.height / 2, 0);
    expect(info.overflow, `${size.width} overflow`).toBe(false);
    expect(info.pips).toBe(3);
    expect(info.headerText).toBe('Portal pegs');
    expect(info.cap).toBe('MAX SHOTS 4');
    expect(info.header!.width).toBeCloseTo(size.board.w, 0);
    expect(info.placard!.width).toBeCloseTo(size.board.w, 0);
    expect(info.canvas!.width).toBeCloseTo(480 * size.s, 0);
    expect(info.cards[0]!.width).toBe(size.width < 1200 ? 208 : size.width >= 1800 ? 264 : 232);
    const expectedGap = size.width < 1200 ? 24 : 32;
    expect(info.board!.left - info.cards[0]!.right, `${size.width} left gap`).toBeCloseTo(expectedGap, 0);
    expect(info.cards[1]!.left - info.board!.right, `${size.width} right gap`).toBeCloseTo(expectedGap, 0);
  }
});

test('desktop placement, aim, outside release, cancel and resize keep one shot path', async ({ page }) => {
  test.setTimeout(60_000);
  await waitPlay(page);
  const start = await canvasPoint(page, COURSE_ORIGIN.x + START.x + START.w / 2, COURSE_ORIGIN.y + START.y + START.h / 2);
  await page.mouse.click(start.x, start.y);
  await page.waitForFunction(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState().phase === 'aiming');
  const placed = (await getState(page)).hole.balls[0]!;
  expect(placed.x).toBeGreaterThanOrEqual(START.x);
  expect(placed.x).toBeLessThanOrEqual(START.x + START.w);
  expect(placed.y).toBeGreaterThanOrEqual(START.y);
  expect(placed.y).toBeLessThanOrEqual(START.y + START.h);

  const from = await canvasPoint(page, 240, 420);
  const scale = await canvasScale(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x, from.y + (180 * scale * i) / 8);
  await expect(page.locator('.pd-power')).toBeVisible();
  expect(await page.locator('.pd-power').textContent()).toBe('100%');
  await page.mouse.move(1400, 100);
  await page.mouse.up();
  await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
  await expect.poll(async () => (await getState(page)).phase, { timeout: 20_000 }).not.toBe('rolling');

  await restartWith(page, aimingFixture);
  const cancelPoint = await canvasPoint(page, 240, 420);
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  await page.mouse.move(cancelPoint.x, cancelPoint.y + 80);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
  await page.mouse.up();
  expect((await getState(page)).hole.shots[0]).toBe(0);
  expect((await getState(page)).phase).toBe('aiming');

  await restartWith(page, aimingFixture);
  const resizePoint = await canvasPoint(page, 240, 420);
  await page.mouse.move(resizePoint.x, resizePoint.y);
  await page.mouse.down();
  await page.mouse.move(resizePoint.x, resizePoint.y + 80);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  expect((await getState(page)).hole.shots[0]).toBe(0);
  expect((await getState(page)).phase).toBe('aiming');
});

test('desktop aim hides the badge and keeps direction at 10/25/50% in eight directions', async ({ page }) => {
  test.setTimeout(90_000);
  await waitPlay(page);
  await restartWith(page, aimingCentreFixture);
  const from = await canvasPoint(page, COURSE_ORIGIN.x + 240, COURSE_ORIGIN.y + 400);
  const scale = await canvasScale(page);

  for (const power of [0.1, 0.25, 0.5]) {
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const drag = power * 180;
      const radians = (degrees * Math.PI) / 180;
      const to = {
        x: from.x + Math.cos(radians) * drag * scale,
        y: from.y + Math.sin(radians) * drag * scale,
      };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 2 });
      const aim = await probeAim(page);
      expect(aim.lineVisible, `${power}/${degrees} line`).toBe(true);
      expect(aim.badgeVisible, `${power}/${degrees} badge`).toBe(false);
      expect(aim.placard, `${power}/${degrees} placard`).toBe(`${Math.round(power * 100)}%`);
      expect(aim.power, `${power}/${degrees} power`).toBeCloseTo(power, 2);
      expect(angleDelta(aim.angle!, Math.atan2(-Math.sin(radians), -Math.cos(radians))), `${power}/${degrees} angle`).toBeLessThan(0.02);
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
      await page.mouse.up();
    }
  }
  expect((await getState(page)).hole.shots[0]).toBe(0);
});

test('desktop drag tracks outside the board to full power and releases once', async ({ page }) => {
  await waitPlay(page);
  await restartWith(page, aimingFixture);
  const from = await canvasPoint(page, COURSE_ORIGIN.x + 56, COURSE_ORIGIN.y + 504);
  const board = (await page.locator('.pd-board').boundingBox())!;
  const scale = await canvasScale(page);
  const diagonal = (190 * scale) / Math.SQRT2;
  const to = { x: from.x - diagonal, y: from.y + diagonal };
  expect(to.x, 'release left of the board').toBeLessThan(board.x);
  expect(to.y, 'release below the board').toBeGreaterThan(board.y + board.height);

  await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & { __fires: number; fire: (shot: unknown) => void };
    scene.__fires = 0;
    const fire = scene.fire.bind(scene);
    scene.fire = (shot: unknown) => {
      scene.__fires += 1;
      fire(shot);
    };
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  const aim = await probeAim(page);
  expect(aim.power).toBe(1);
  expect(aim.placard).toBe('100%');
  expect(aim.badgeVisible).toBe(false);
  expect(angleDelta(aim.angle!, -Math.PI / 4)).toBeLessThan(0.02);
  await page.mouse.up();

  await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
  const fires = await page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as Phaser.Scene & { __fires: number }).__fires);
  expect(fires).toBe(1);
  await page.waitForTimeout(400);
  expect((await getState(page)).hole.shots[0]).toBe(1);
});

test('desktop focus loss cancels the drag without a stuck shot', async ({ page }) => {
  await waitPlay(page);
  await restartWith(page, aimingFixture);
  const from = await canvasPoint(page, COURSE_ORIGIN.x + 56, COURSE_ORIGIN.y + 504);
  const scale = await canvasScale(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60 * scale, from.y + 60 * scale);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  expect((await getState(page)).hole.shots[0]).toBe(0);
  expect((await getState(page)).phase).toBe('aiming');
  const aim = await probeAim(page);
  expect(aim.lineVisible).toBe(false);
  expect(aim.badgeVisible).toBe(false);

  const fresh = await canvasPoint(page, COURSE_ORIGIN.x + 56, COURSE_ORIGIN.y + 504);
  await page.mouse.move(fresh.x, fresh.y);
  await page.mouse.down();
  await page.mouse.move(fresh.x, fresh.y + 90 * scale, { steps: 3 });
  expect((await probeAim(page)).power).toBeCloseTo(0.5, 2);
  await page.mouse.up();
  await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
});

test('desktop dialogs carry art, rows, focus and replay semantics', async ({ page }) => {
  await waitPlay(page);
  await restartWith(page, holeOverFixture);
  await expect(page.locator('.ui-dialog__panel')).toBeVisible();
  const dialog = await page.evaluate(() => {
    const panel = document.querySelector('.ui-dialog__panel')!;
    return {
      role: panel.getAttribute('role'),
      modal: panel.getAttribute('aria-modal'),
      heading: panel.querySelector('h2')?.textContent,
      body: panel.querySelector('p')?.textContent,
      art: panel.querySelector('.pd-dialog-art img')?.getAttribute('src'),
      rows: panel.querySelectorAll('.pd-dialog-row').length,
      focus: document.activeElement?.getAttribute('data-action-id'),
      action: (panel.querySelector('[data-action-id]') as HTMLElement | null)?.getBoundingClientRect().toJSON(),
    };
  });
  expect(dialog).toMatchObject({ role: 'dialog', modal: 'true', heading: 'HOLE 2', body: 'Portal pegs', rows: 2, focus: 'continueButton' });
  expect(dialog.art).toContain('hole-complete');
  expect(dialog.action!.height).toBeGreaterThanOrEqual(44);

  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));
    const polish = await page.evaluate(() => {
      const scrim = getComputedStyle(document.querySelector('.ui-dialog__scrim')!);
      const panel = getComputedStyle(document.querySelector('.ui-dialog__panel')!);
      const pill = getComputedStyle(document.querySelector('.pd-pill.holed')!);
      return {
        scrimBackground: scrim.backgroundColor,
        scrimBlur: scrim.backdropFilter || scrim.getPropertyValue('-webkit-backdrop-filter'),
        panelBlur: panel.backdropFilter || panel.getPropertyValue('-webkit-backdrop-filter'),
        pillColor: pill.color,
        pillBackground: pill.backgroundColor,
        pillSize: `${pill.fontSize}/${pill.fontWeight}`,
      };
    });
    expect(polish.scrimBlur, `${size.width} blur`).toContain('blur(2px)');
    expect(polish.panelBlur, `${size.width} sharp panel`).toBe('none');
    expect(polish.scrimBackground, `${size.width} dimming`).toBe('rgba(37, 33, 28, 0.42)');
    expect(polish.pillSize, `${size.width} pill type`).toBe('12px/900');
    expect(contrast(polish.pillColor, polish.pillBackground), `${size.width} HOLED contrast`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(polish.pillColor, polish.pillBackground), `${size.width} margin`).toBeGreaterThanOrEqual(4.7);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));

  await page.locator('[data-action-id="continueButton"]').click();
  await expect.poll(async () => (await getState(page)).holeIndex).toBe(2);
  await restartWith(page, matchOverFixture);
  await expect(page.locator('.ui-dialog__panel')).toBeVisible();
  const result = await page.evaluate(() => {
    const panel = document.querySelector('.ui-dialog__panel')!;
    return {
      heading: panel.querySelector('h2')?.textContent,
      body: panel.querySelector('p')?.textContent,
      art: panel.querySelector('.pd-dialog-art img')?.getAttribute('src'),
      focus: document.activeElement?.getAttribute('data-action-id'),
      rows: panel.querySelectorAll('.pd-dialog-row').length,
    };
  });
  expect(result.heading).toBe('YOU WIN');
  expect(result.body).toBe('YOU 3 · BOT 2');
  expect(result.art).toContain('result-win');
  expect(result.rows).toBe(0);
  expect(result.focus).toBe('playAgainButton');
  await page.locator('[data-action-id="playAgainButton"]').click();
  await expect.poll(async () => (await getState(page)).phase).toBe('placing');
  expect((await getState(page)).points).toEqual([0, 0]);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
});

test('desktop board art is at data centres and hides flags', async ({ page }) => {
  await waitPlay(page, '/?hole=2&seed=1');
  const portal = await page.evaluate(() => {
    const art = (window.__GAME__!.scene.getScene('Play') as PlayHandle).getBoardArt()!;
    const inPortal = art.root.getByName('decor-portal-in') as Phaser.GameObjects.Image;
    const outPortal = art.root.getByName('decor-portal-out') as Phaser.GameObjects.Image;
    return { in: { x: inPortal.x, y: inPortal.y }, out: { x: outPortal.x, y: outPortal.y } };
  });
  expect(portal.in).toEqual({ x: 360, y: 680 });
  expect(portal.out).toEqual({ x: 212, y: 210 });

  await waitPlay(page, '/?hole=3&seed=1');
  const star = await page.evaluate(() => {
    const art = (window.__GAME__!.scene.getScene('Play') as PlayHandle).getBoardArt()!;
    const image = art.root.getByName('decor-star-star') as Phaser.GameObjects.Image;
    art.setFlags({ brokenProps: [], collectedStars: ['star'] });
    const hidden = image.visible;
    art.setFlags({ brokenProps: [], collectedStars: [] });
    return { x: image.x, y: image.y, hidden, restored: image.visible };
  });
  expect(star).toEqual({ x: 380, y: 180, hidden: false, restored: true });

  await waitPlay(page, '/?hole=1&seed=1');
  const prop = await page.evaluate(() => {
    const art = (window.__GAME__!.scene.getScene('Play') as PlayHandle).getBoardArt()!;
    const image = art.root.getByName('decor-prop-ring-top') as Phaser.GameObjects.Image;
    art.setFlags({ brokenProps: ['ring-top'], collectedStars: [] });
    const hidden = image.visible;
    art.setFlags({ brokenProps: [], collectedStars: [] });
    return { x: image.x, y: image.y, hidden, restored: image.visible };
  });
  expect(prop).toEqual({ x: 240, y: 338, hidden: false, restored: true });
});

test('desktop falls back below 1024x640 and keeps the desktop mode at the floor', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 639 });
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  expect(await page.evaluate(() => document.body.classList.contains('pd-desktop'))).toBe(false);
  expect(await page.locator('.pd-root').isHidden()).toBe(true);
  expect(await page.locator('.ui-sidebar').isVisible()).toBe(true);

  await page.setViewportSize({ width: 1024, height: 640 });
  await page.reload();
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));
  expect(await page.locator('.pd-title').isVisible()).toBe(true);
});

test('desktop asset pack loads and the page has no horizontal overflow', async ({ page }) => {
  await waitPlay(page, '/?hole=2&seed=1');
  const assets = await page.evaluate(() => {
    const names = performance.getEntriesByType('resource').map((entry) => entry.name);
    return {
      turf: names.some((name) => name.includes('turf-v2-sage')),
      water: names.some((name) => name.includes('water-r2')),
      sand: names.some((name) => name.includes('sand-r2')),
      layer: names.some((name) => name.includes('-base-')),
      textures: ['pd-turf', 'pd-water-r2', 'pd-sand-r2', 'pd-h2-base', 'pd-h2-surfaces', 'pd-h2-markings', 'pd-h2-boundaries'].every((key) =>
        window.__GAME__!.textures.exists(key),
      ),
      overflowX: document.documentElement.scrollWidth > innerWidth,
      overflowY: document.documentElement.scrollHeight > innerHeight,
    };
  });
  expect(assets).toEqual({ turf: true, water: true, sand: true, layer: true, textures: true, overflowX: false, overflowY: false });
});

test.describe('desktop DPR 1', () => {
  test.use({ deviceScaleFactor: 1 });

  test('keeps the measured board geometry and control floors', async ({ page }) => {
    await waitPlay(page, '/?hole=2&seed=1');
    const info = await page.evaluate(() => {
      const board = document.querySelector('.pd-board')!.getBoundingClientRect();
      return {
        board: { x: board.x, y: board.y, width: board.width, height: board.height },
        actions: [...document.querySelectorAll<HTMLButtonElement>('[data-action-id]')]
          .filter((element) => !element.hidden && !element.disabled)
          .map((element) => ({ id: element.dataset.actionId, rect: element.getBoundingClientRect().toJSON() })),
      };
    });
    expect(info.board.x).toBeCloseTo(460, 0);
    expect(info.board.y).toBeCloseTo(88, 0);
    expect(info.board.width).toBeCloseTo(520, 0);
    expect(info.board.height).toBeCloseTo(716, 0);
    for (const action of info.actions) {
      expect(action.rect.width, action.id!).toBeGreaterThanOrEqual(44);
      expect(action.rect.height, action.id!).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('desktop reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps the placement halo static and removes modal motion', async ({ page }) => {
    await waitPlay(page);
    const halo = await page.evaluate(() => {
      const art = (window.__GAME__!.scene.getScene('Play') as PlayHandle).getBoardArt()!;
      const image = art.root.getByName('decor-place-halo') as Phaser.GameObjects.Image;
      return { visible: image.visible, alpha: image.alpha };
    });
    expect(halo.visible).toBe(true);
    expect(halo.alpha).toBeCloseTo(0.9, 1);
    await page.waitForTimeout(500);
    const haloLater = await page.evaluate(() => {
      const art = (window.__GAME__!.scene.getScene('Play') as PlayHandle).getBoardArt()!;
      const image = art.root.getByName('decor-place-halo') as Phaser.GameObjects.Image;
      return image.alpha;
    });
    expect(haloLater).toBeCloseTo(0.9, 1);

    await restartWith(page, holeOverFixture);
    const modal = await page.evaluate(() => ({
      animation: getComputedStyle(document.querySelector('.ui-dialog__panel')!).animationName,
      blur: getComputedStyle(document.querySelector('.ui-dialog__scrim')!).backdropFilter,
    }));
    expect(modal.animation).toBe('none');
    expect(modal.blur).toContain('blur(2px)');
  });
});

test('desktop completes a full match, records the result and replays fresh', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await waitPlay(page, '/?seed=1');
  const starts = [
    { x: 56, y: 504 },
    { x: 56, y: 508 },
    { x: 40, y: 520 },
  ] as const;

  for (let guard = 0; guard < 120; guard++) {
    const state = await getState(page);
    if (state.phase === 'matchOver') break;
    if (state.phase === 'holeOver') {
      await expect(page.locator('[data-action-id="continueButton"]')).toBeVisible();
      await page.locator('[data-action-id="continueButton"]').click();
      await expect.poll(async () => (await getState(page)).phase, { timeout: 5_000 }).not.toBe('holeOver');
    } else if (state.activePlayer === 0 && state.phase === 'placing') {
      const start = starts[state.holeIndex]!;
      const point = await canvasPoint(page, COURSE_ORIGIN.x + start.x, COURSE_ORIGIN.y + start.y);
      await page.mouse.click(point.x, point.y);
      await expect.poll(async () => (await getState(page)).phase, { timeout: 5_000 }).not.toBe('placing');
    } else if (state.activePlayer === 0 && state.phase === 'aiming') {
      const before = state.hole.shots[0];
      const from = await canvasPoint(page, 240, 420);
      const scale = await canvasScale(page);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 4; i++) await page.mouse.move(from.x, from.y + (30 * scale * i) / 4);
      await page.mouse.up();
      await expect.poll(async () => (await getState(page)).hole.shots[0], { timeout: 5_000 }).toBeGreaterThan(before);
      await expect.poll(async () => (await getState(page)).phase, { timeout: 20_000 }).not.toBe('rolling');
    } else {
      const mark = JSON.stringify([state.phase, state.activePlayer, state.hole.shots]);
      await expect
        .poll(
          async () => {
            const current = await getState(page);
            return current.phase !== 'rolling' && JSON.stringify([current.phase, current.activePlayer, current.hole.shots]) !== mark;
          },
          { timeout: 30_000 },
        )
        .toBe(true);
    }
  }

  const final = await getState(page);
  expect(final.phase).toBe('matchOver');
  expect(final.holeIndex).toBe(2);
  await expect(page.locator('.ui-dialog__panel')).toBeVisible();
  await expect(page.locator('.ui-dialog__heading')).toHaveText(/YOU WIN|BOT WINS|DRAW/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('minigolf:save') ?? 'null'));
  expect(saved.inProgress).toBeNull();
  expect(saved.wins + saved.losses + saved.draws).toBe(1);

  await page.locator('[data-action-id="playAgainButton"]').click();
  await expect.poll(async () => (await getState(page)).phase, { timeout: 5_000 }).toBe('placing');
  expect((await getState(page)).holeIndex).toBe(0);
  expect((await getState(page)).points).toEqual([0, 0]);
  expect((await getState(page)).hole.shots).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('desktop and fallback switch without losing the host or duplicating actions', async ({ page }) => {
  await waitPlay(page, '/?seed=1');
  const desktopBoard = await page.locator('.pd-board').boundingBox();
  expect(desktopBoard!.width).toBeGreaterThan(400);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => !document.body.classList.contains('pd-desktop'));
  await page.waitForFunction(() => document.getElementById('ui-host')!.dataset.uiMode === 'compact');
  expect(await page.locator('.pd-root').isHidden()).toBe(true);
  expect(await page.locator('.ui-sidebar').isVisible()).toBe(true);
  expect(await page.locator('[data-action-id]').count()).toBe(3);
  const fallbackCanvas = await page.locator('canvas').boundingBox();
  expect(fallbackCanvas!.width).toBeGreaterThan(0);
  expect(fallbackCanvas!.width).toBeLessThan(480);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.body.classList.contains('pd-desktop'));
  expect(await page.locator('.pd-play').isVisible()).toBe(true);
  expect(await page.locator('[data-action-id]').count()).toBe(3);
  const restored = await page.evaluate(() => {
    const board = document.querySelector('.pd-board')!.getBoundingClientRect();
    return { x: board.x, y: board.y, width: board.width, height: board.height };
  });
  expect(restored.x).toBeCloseTo(460, 0);
  expect(restored.y).toBeCloseTo(88, 0);
  expect(restored.width).toBeCloseTo(520, 0);
  expect(restored.height).toBeCloseTo(716, 0);
});

test.describe('desktop reduced motion aim', () => {
  test.use({ reducedMotion: 'reduce' });

  test('desktop aim ring is static under reduced motion', async ({ page }) => {
    await waitPlay(page, '/?seed=1');
    await restartWith(page, aimingFixture);
    const first = await page.evaluate(() => {
      const scene = window.__GAME__!.scene.getScene('Play');
      const ring = scene.children.getByName('aimRing') as Phaser.GameObjects.Arc;
      const ink = scene.children.getByName('decor-aim-ring-ink') as Phaser.GameObjects.Arc;
      return { scale: ring.scaleX, inkScale: ink?.scaleX, visible: ring.visible };
    });
    expect(first.visible).toBe(true);
    await page.waitForTimeout(500);
    const second = await page.evaluate(() => {
      const scene = window.__GAME__!.scene.getScene('Play');
      const ring = scene.children.getByName('aimRing') as Phaser.GameObjects.Arc;
      return { scale: ring.scaleX };
    });
    expect(second.scale).toBe(1);
  });
});

test('desktop pointer projection follows a live desktop resize', async ({ page }) => {
  await waitPlay(page, '/?seed=1');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await page.locator('.pd-board').boundingBox())!.width, { timeout: 5_000 }).toBeLessThan(400);
  await page.waitForTimeout(200);
  const start = await canvasPoint(page, COURSE_ORIGIN.x + START.x + START.w / 2, COURSE_ORIGIN.y + START.y + START.h / 2);
  await page.mouse.click(start.x, start.y);
  await expect.poll(async () => (await getState(page)).phase, { timeout: 5_000 }).toBe('aiming');
  const placed = (await getState(page)).hole.balls[0]!;
  expect(placed.x).toBeGreaterThanOrEqual(START.x);
  expect(placed.x).toBeLessThanOrEqual(START.x + START.w);
  expect(placed.y).toBeGreaterThanOrEqual(START.y);
  expect(placed.y).toBeLessThanOrEqual(START.y + START.h);

  const from = await canvasPoint(page, 240, 420);
  const scale = await canvasScale(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(from.x, from.y + (90 * scale * i) / 4);
  await page.mouse.up();
  await expect.poll(async () => (await getState(page)).hole.shots[0], { timeout: 5_000 }).toBe(1);
  await expect.poll(async () => (await getState(page)).phase, { timeout: 20_000 }).not.toBe('rolling');
});

test('desktop sound control toggles ON and OFF with pressed state', async ({ page }) => {
  await bootDesktop(page);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  const sound = page.locator('[data-action-id="muteButton"]');
  await expect(sound).toHaveText('ON');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveText('OFF');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await sound.click();
  await expect(sound).toHaveText('ON');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
});
