import { expect, test, type Page } from '@playwright/test';
import type { MatchState } from '../src/logic/match';

// Redesigned chrome: geometry, semantic actions, compact mode, modals,
// reduced motion, keyboard/touch activation and the documented size matrix.

type PlayHandle = Phaser.Scene & { getState(): MatchState };

const START = { x: 24, y: 472, w: 64, h: 64 };
const COURSE_ORIGIN = { x: 40, y: 150 };

const getState = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState());

const sceneObject = (page: Page, scene: string, name: string) =>
  page.evaluate(
    ([s, n]) => {
      const obj = window.__GAME__!.scene.getScene(s).children.getByName(n) as
        | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean; text?: string })
        | null;
      return obj
        ? { exists: true, x: obj.x, y: obj.y, visible: obj.visible, text: obj.text ?? '' }
        : { exists: false, x: 0, y: 0, visible: false, text: '' };
    },
    [scene, name] as const,
  );

const savedMuted = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('minigolf:save');
    return raw === null ? null : (JSON.parse(raw) as { muted?: unknown }).muted;
  });

const bootTitleFresh = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
};

const bootPlay = async (page: Page) => {
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

const toPage = async (page: Page, x: number, y: number) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 800) * box.height };
};

const placeBall = async (page: Page) => {
  const point = await toPage(page, COURSE_ORIGIN.x + START.x + START.w / 2, COURSE_ORIGIN.y + START.y + START.h / 2);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await getState(page)).phase).toBe('aiming');
};

const dragShot = async (page: Page, length: number) => {
  const from = await toPage(page, 240, 420);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x, from.y + (length * i) / 5);
  await page.mouse.up();
};

const action = (page: Page, id: string) => page.locator(`[data-action-id="${id}"]`);

const visibleActionRects = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-action-id]')]
      .filter((element) => !element.hidden && !element.disabled && getComputedStyle(element).display !== 'none')
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.actionId, width: rect.width, height: rect.height };
      }),
  );

const ball = (x: number, y: number, holed = false) => ({
  x,
  y,
  vx: 0,
  vy: 0,
  holed,
  shotOrigin: { x, y },
  rollTime: 0,
  portalLock: false,
});

const holeOverFixture: MatchState = {
  version: 1,
  seed: 1,
  rngState: 1,
  holeIndex: 0,
  points: [1, 0],
  activePlayer: 0,
  phase: 'holeOver',
  hole: {
    shots: [3, 5],
    extraShots: [0, 0],
    result: ['holed', 'out'],
    balls: [ball(348, 72, true), ball(100, 100)],
    brokenProps: [],
    collectedStars: [],
    lastResult: [1, 0],
  },
};

const matchOverFixture: MatchState = {
  version: 1,
  seed: 1,
  rngState: 1,
  holeIndex: 2,
  points: [2, 1],
  activePlayer: 0,
  phase: 'matchOver',
  hole: {
    shots: [2, 3],
    extraShots: [0, 0],
    result: ['holed', 'holed'],
    balls: [ball(232, 300, true), ball(200, 300, true)],
    brokenProps: [],
    collectedStars: [],
    lastResult: [1, 0],
  },
};

const startFixture = async (page: Page, state: MatchState) => {
  await page.evaluate((fixture) => window.__GAME__!.scene.start('Play', { resume: fixture }), state);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await page.waitForFunction((phase) => {
    const scene = window.__GAME__!.scene.getScene('Play') as PlayHandle;
    return scene.getState().phase === phase;
  }, state.phase);
};

test('Title normal geometry, single action path and saved mute state', async ({ page }) => {
  await bootTitleFresh(page);
  const info = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Title');
    const at = (name: string) => {
      const object = scene.children.getByName(name) as
        | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean; text?: string })
        | null;
      return object ? { x: object.x, y: object.y, visible: object.visible, text: object.text ?? '' } : null;
    };
    const dom = (id: string) => {
      const element = document.querySelector(`[data-action-id="${id}"]`) as HTMLButtonElement;
      const rect = element.getBoundingClientRect();
      return {
        hidden: element.hidden,
        width: rect.width,
        height: rect.height,
        label: element.getAttribute('aria-label'),
        pressed: element.getAttribute('aria-pressed'),
        text: element.textContent,
      };
    };
    return {
      mute: at('muteButton'),
      title: at('title'),
      tagline: at('tagline'),
      record: at('record'),
      play: at('playButton'),
      continue: at('continueButton'),
      footer: at('footer'),
      playDom: dom('playButton'),
      muteDom: dom('muteButton'),
      actionCount: document.querySelectorAll('[data-action-id]').length,
    };
  });
  expect(info.mute).toMatchObject({ x: 420, y: 52, visible: true });
  expect(info.title).toMatchObject({ x: 240, y: 356, text: 'Putt Duel' });
  expect(info.tagline).toMatchObject({ x: 240, y: 412, text: 'You vs the bot · 3 holes' });
  expect(info.record).toMatchObject({ x: 240, y: 464, text: 'W 0 · L 0 · D 0' });
  expect(info.play).toMatchObject({ x: 240, y: 568, visible: true });
  expect(info.continue).toBeNull();
  expect(info.footer).toMatchObject({ x: 240, y: 756, text: 'Touch controls' });
  expect(info.playDom).toMatchObject({ hidden: false, width: 336, height: 80, label: 'Play Putt Duel' });
  expect(info.muteDom).toMatchObject({ hidden: false, width: 72, height: 72, label: 'Sound on. Mute sound', pressed: 'false' });
  expect(info.actionCount).toBe(2);

  const mute = (await action(page, 'muteButton').boundingBox())!;
  await page.mouse.move(mute.x + mute.width / 2, mute.y + mute.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await expect.poll(() => savedMuted(page)).toBe(true);
  await expect(action(page, 'muteButton')).toHaveText('♪ OFF');
  await expect(action(page, 'muteButton')).toHaveAttribute('aria-label', 'Sound off. Enable sound');
  await expect(action(page, 'muteButton')).toHaveAttribute('aria-pressed', 'true');

  await action(page, 'muteButton').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => savedMuted(page)).toBe(false);
  await expect(action(page, 'muteButton')).toHaveText('♪ ON');
  await expect(action(page, 'muteButton')).toHaveAttribute('aria-label', 'Sound on. Mute sound');
});

test('saved Title restores the same match and a corrupt save falls back', async ({ page }) => {
  test.setTimeout(60_000);
  await bootTitleFresh(page);
  await action(page, 'playButton').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await placeBall(page);
  await dragShot(page, 60);
  await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
  await expect.poll(async () => (await getState(page)).phase).not.toBe('rolling');
  const before = await getState(page);

  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  await expect(action(page, 'continueButton')).toBeVisible();
  await expect(action(page, 'continueButton')).toHaveText(`CONTINUE · HOLE ${before.holeIndex + 1}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('minigolf:save') ?? 'null'));
  expect(saved.inProgress.phase).not.toBe('rolling');
  await action(page, 'continueButton').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  const restored = await getState(page);
  expect(restored.holeIndex).toBe(before.holeIndex);
  expect(restored.seed).toBe(before.seed);
  expect(restored.hole.shots).toEqual(before.hole.shots);

  await page.evaluate(() => localStorage.setItem('minigolf:save', '{not json'));
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  await expect(action(page, 'continueButton')).toHaveCount(0);
  expect((await sceneObject(page, 'Title', 'record')).text).toBe('W 0 · L 0 · D 0');
});

test('HUD geometry keeps points, shots and turn separate', async ({ page }) => {
  await bootPlay(page);
  const info = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play');
    const at = (name: string) => {
      const object = scene.children.getByName(name) as
        | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean; text?: string })
        | null;
      return object ? { x: object.x, y: object.y, visible: object.visible, text: object.text ?? '' } : null;
    };
    const mute = document.querySelector('[data-action-id="muteButton"]')!.getBoundingClientRect();
    return {
      card0: at('card0'),
      card1: at('card1'),
      points0: at('points0'),
      points1: at('points1'),
      shots0: at('shots0'),
      shots1: at('shots1'),
      turn0: at('turn0'),
      turn1: at('turn1'),
      mute: at('muteButton'),
      muteDom: { width: mute.width, height: mute.height },
    };
  });
  expect(info.card0).toMatchObject({ x: 12, y: 8, visible: true });
  expect(info.card1).toMatchObject({ x: 284, y: 8, visible: true });
  expect(info.points0).toMatchObject({ x: 166, y: 36, text: '0' });
  expect(info.points1).toMatchObject({ x: 438, y: 36, text: '0' });
  expect(info.shots0).toMatchObject({ x: 26, y: 56, text: 'SHOT 0' });
  expect(info.shots1).toMatchObject({ x: 298, y: 56, text: 'SHOT 0' });
  expect(info.turn0).toMatchObject({ x: 26, y: 88, visible: true });
  expect(info.turn1).toMatchObject({ x: 298, y: 88, visible: false });
  expect(info.mute).toMatchObject({ x: 240, y: 64 });
  expect(info.muteDom).toEqual({ width: 72, height: 72 });

  await action(page, 'muteButton').click();
  expect((await getState(page)).phase).toBe('placing');
});

test('hole-over modal is semantic, blocks input, traps focus and continues', async ({ page }) => {
  await bootPlay(page);
  await startFixture(page, holeOverFixture);
  await expect(page.locator('.ui-dialog')).toBeVisible();
  const dialog = await page.evaluate(() => {
    const panel = document.querySelector('.ui-dialog__panel')!;
    const scene = window.__GAME__!.scene.getScene('Play');
    const band = scene.children.getByName('holeBand') as Phaser.GameObjects.Container;
    return {
      role: panel.getAttribute('role'),
      modal: panel.getAttribute('aria-modal'),
      title: panel.querySelector('h2')?.textContent,
      body: panel.querySelector('p')?.textContent,
      focus: document.activeElement?.getAttribute('data-action-id'),
      bandVisible: band.visible,
      line0: (band.getByName('holeBandLine0') as Phaser.GameObjects.Text).text,
      award0: (band.getByName('holeBandAward0') as Phaser.GameObjects.Text).text,
    };
  });
  expect(dialog).toMatchObject({
    role: 'dialog',
    modal: 'true',
    title: 'HOLE 1',
    focus: 'continueButton',
    bandVisible: true,
    line0: '3 shots · HOLED',
    award0: '+1',
  });
  expect(dialog.body).toContain('Open field');
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.ui-live')?.textContent ?? ''))
    .toContain('Hole 1 complete');
  const inert = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-action-id]')].map((element) => ({
      id: element.dataset.actionId,
      inert: element.inert,
    })),
  );
  expect(inert.find((entry) => entry.id === 'muteButton')?.inert).toBe(true);

  const before = await getState(page);
  await page.mouse.click(240, 400);
  expect((await getState(page)).phase).toBe('holeOver');
  expect((await getState(page)).hole.shots).toEqual(before.hole.shots);

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action-id'))).toBe('continueButton');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action-id'))).toBe('continueButton');
  await page.keyboard.press('Escape');
  expect((await getState(page)).phase).toBe('holeOver');

  await action(page, 'continueButton').click();
  await expect.poll(async () => (await getState(page)).holeIndex).toBe(1);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
  expect((await sceneObject(page, 'Play', 'holeBand')).visible).toBe(false);
  expect(await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-action-id="muteButton"]')?.inert)).toBe(false);
});

test('match result modal keeps its heading and replay starts fresh', async ({ page }) => {
  await bootPlay(page);
  await startFixture(page, matchOverFixture);
  await expect(page.locator('.ui-dialog')).toBeVisible();
  const result = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play');
    const panel = scene.children.getByName('resultPanel') as Phaser.GameObjects.Container;
    return {
      visible: panel.visible,
      heading: (panel.getByName('resultText') as Phaser.GameObjects.Text).text,
      points: (panel.getByName('resultPoints') as Phaser.GameObjects.Text).text,
      focus: document.activeElement?.getAttribute('data-action-id'),
      dialogTitle: document.querySelector('.ui-dialog h2')?.textContent,
    };
  });
  expect(result).toMatchObject({
    visible: true,
    heading: 'YOU WIN',
    points: 'YOU 2  ·  BOT 1',
    focus: 'playAgainButton',
    dialogTitle: 'YOU WIN',
  });

  await action(page, 'playAgainButton').click();
  await expect.poll(async () => (await getState(page)).phase).toBe('placing');
  const fresh = await getState(page);
  expect(fresh.holeIndex).toBe(0);
  expect(fresh.points).toEqual([0, 0]);
  expect(fresh.hole.shots).toEqual([0, 0]);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
  expect((await sceneObject(page, 'Play', 'resultPanel')).visible).toBe(false);
});

test('compact landscape moves chrome into the sidebar and keeps the course', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await bootPlay(page);
  const info = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play');
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const course = scene.children.getByName('course') as Phaser.GameObjects.Container;
    const card0 = scene.children.getByName('card0') as Phaser.GameObjects.Container;
    const mute = scene.children.getByName('muteButton') as Phaser.GameObjects.Container;
    const cap = (course.getByName('capBanner') as Phaser.GameObjects.Text);
    const hint = scene.children.getByName('hintLabel') as Phaser.GameObjects.Text;
    const sound = document.querySelector('[data-action-id="muteButton"]')!.getBoundingClientRect();
    return {
      mode: document.getElementById('ui-host')!.dataset.uiMode,
      sidebar: getComputedStyle(document.getElementById('ui-sidebar')!).display,
      card0: card0.visible,
      mute: mute.visible,
      cap: cap.visible,
      hint: hint.visible,
      canvasInside: canvas.left >= 0 && canvas.top >= 0 && canvas.right <= innerWidth && canvas.bottom <= innerHeight,
      scale: { width: window.__GAME__!.scale.width, height: window.__GAME__!.scale.height },
      course: { x: course.x, y: course.y },
      sound: { width: sound.width, height: sound.height },
      holeLine: document.querySelector('.ui-play-panel .ui-caption')?.textContent,
      status: document.querySelector('.ui-play-status')?.textContent,
      cardText: document.querySelector('.ui-score-card')?.textContent,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(info.mode).toBe('compact');
  expect(info.sidebar).toBe('flex');
  expect(info.card0).toBe(false);
  expect(info.mute).toBe(false);
  expect(info.cap).toBe(false);
  expect(info.hint).toBe(false);
  expect(info.canvasInside).toBe(true);
  expect(info.scale).toEqual({ width: 480, height: 800 });
  expect(info.course).toEqual({ x: 40, y: 150 });
  expect(info.sound.height).toBeGreaterThanOrEqual(44);
  expect(info.sound.width).toBeGreaterThanOrEqual(44);
  expect(info.holeLine).toBe('Hole 1 · MAX SHOTS 5');
  expect(info.status).toContain('Tap the checkered start zone');
  expect(info.cardText).toContain('YOU');
  expect(info.overflow).toBe(false);

  await action(page, 'muteButton').click();
  expect((await getState(page)).phase).toBe('placing');

  await startFixture(page, holeOverFixture);
  await expect(page.locator('.ui-dialog')).toBeVisible();
  expect((await sceneObject(page, 'Play', 'holeBand')).visible).toBe(false);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action-id'))).toBe('continueButton');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-action-id'))).toBe('continueButton');
  await action(page, 'continueButton').click();
  await expect.poll(async () => (await getState(page)).holeIndex).toBe(1);
  await expect(page.locator('.ui-dialog')).toHaveCount(0);
});

test('size matrix keeps the course visible and selects the right chrome', async ({ page }) => {
  const sizes: Array<[number, number, 'normal' | 'compact']> = [
    [320, 568, 'normal'],
    [375, 812, 'normal'],
    [390, 844, 'normal'],
    [480, 800, 'normal'],
    [768, 1024, 'normal'],
    [844, 390, 'compact'],
    [640, 360, 'compact'],
  ];
  for (const [width, height, mode] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/?seed=1');
    await page.waitForFunction(() => window.__GAME__?.isBooted === true);
    await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container & { setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void };
      return {
        mode: document.getElementById('ui-host')!.dataset.uiMode,
        scale: { width: window.__GAME__!.scale.width, height: window.__GAME__!.scale.height },
        course: { x: course.x, y: course.y },
        canvasInside: canvas.left >= 0 && canvas.top >= 0 && canvas.right <= innerWidth && canvas.bottom <= innerHeight,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(info.mode, `${width}x${height}`).toBe(mode);
    expect(info.scale, `${width}x${height}`).toEqual({ width: 480, height: 800 });
    expect(info.course, `${width}x${height}`).toEqual({ x: 40, y: 150 });
    expect(info.canvasInside, `${width}x${height}`).toBe(true);
    expect(info.overflow, `${width}x${height}`).toBe(false);
    for (const rect of await visibleActionRects(page)) {
      expect(rect.width, `${rect.id} width at ${width}x${height}`).toBeGreaterThanOrEqual(44);
      expect(rect.height, `${rect.id} height at ${width}x${height}`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('keyboard activation and concurrent touches never double-fire', async ({ page }) => {
  await bootTitleFresh(page);
  await action(page, 'playButton').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  expect((await getState(page)).phase).toBe('placing');

  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  const play = (await action(page, 'playButton').boundingBox())!;
  const mute = (await action(page, 'muteButton').boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: play.x + play.width / 2, y: play.y + play.height / 2, id: 1 },
      { x: mute.x + mute.width / 2, y: mute.y + mute.height / 2, id: 2 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  expect(await savedMuted(page)).toBe(false);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('removes looping decoration and hides the dismissed hint immediately', async ({ page }) => {
    await bootPlay(page);
    await placeBall(page);
    const first = await page.evaluate(() => {
      const scene = window.__GAME__!.scene.getScene('Play');
      const ring = scene.children.getByName('aimRing') as Phaser.GameObjects.Arc;
      const pointer = scene.children.getByName('turnPointer') as Phaser.GameObjects.Container;
      const bob = pointer.list[0] as Phaser.GameObjects.Container;
      return { scale: ring.scaleX, bobY: bob.y };
    });
    await page.waitForTimeout(500);
    const second = await page.evaluate(() => {
      const scene = window.__GAME__!.scene.getScene('Play');
      const ring = scene.children.getByName('aimRing') as Phaser.GameObjects.Arc;
      const pointer = scene.children.getByName('turnPointer') as Phaser.GameObjects.Container;
      const bob = pointer.list[0] as Phaser.GameObjects.Container;
      return { scale: ring.scaleX, bobY: bob.y };
    });
    expect(first.scale).toBe(1);
    expect(second.scale).toBe(1);
    expect(first.bobY).toBe(0);
    expect(second.bobY).toBe(0);

    await dragShot(page, 40);
    await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
    await expect.poll(async () => (await getState(page)).phase).not.toBe('rolling');
    expect((await sceneObject(page, 'Play', 'hintLabel')).visible).toBe(false);
  });

  test('terminal startup failure hides the loading track', async ({ page }) => {
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#ui-startup-status')).toHaveText('The game couldn’t load.');
    await expect(page.locator('#ui-startup-track')).toBeHidden();
    await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'false');
    const animation = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ui-startup__bar')!).animationName,
    );
    expect(animation).toBe('none');
  });
});

test.describe('device pixel ratio 1', () => {
  test.use({ deviceScaleFactor: 1 });

  test('normal and compact chrome still fit at DPR 1', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await bootTitleFresh(page);
    expect(await page.evaluate(() => document.getElementById('ui-host')!.dataset.uiMode)).toBe('normal');
    for (const rect of await visibleActionRects(page)) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
    expect(await page.evaluate(() => document.getElementById('ui-host')!.dataset.uiMode)).toBe('compact');
    for (const rect of await visibleActionRects(page)) {
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test('startup clears, the live region is polite and the host is not busy', async ({ page }) => {
  await bootTitleFresh(page);
  const state = await page.evaluate(() => ({
    startupHidden: (document.getElementById('ui-startup') as HTMLElement).hidden,
    busy: document.getElementById('ui-host')!.getAttribute('aria-busy'),
    live: document.querySelector('.ui-live')?.getAttribute('aria-live'),
    status: document.querySelector('.ui-live')?.getAttribute('role'),
    startupStatusRole: document.getElementById('ui-startup-status')!.getAttribute('role'),
    startupStatusLive: document.getElementById('ui-startup-status')!.getAttribute('aria-live'),
    startupStatuses: document.querySelectorAll('#ui-startup-status').length,
    liveRegions: document.querySelectorAll('.ui-live').length,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    bodyTouch: getComputedStyle(document.body).touchAction,
    canvasTouch: getComputedStyle(document.querySelector('canvas')!).touchAction,
  }));
  expect(state).toMatchObject({
    startupHidden: true,
    busy: 'false',
    live: 'polite',
    status: 'status',
    startupStatusRole: null,
    startupStatusLive: null,
    startupStatuses: 1,
    liveRegions: 1,
  });
  expect(state.viewport).not.toContain('maximum-scale');
  expect(state.viewport).not.toContain('user-scalable=no');
  expect(state.bodyTouch).toBe('auto');
  expect(state.canvasTouch).toBe('none');
});

test('touch placement, drag, cancellation and 100% power keep one shot path', async ({ page }) => {
  test.setTimeout(60_000);
  await bootPlay(page);
  const start = await toPage(page, COURSE_ORIGIN.x + START.x + START.w / 2, COURSE_ORIGIN.y + START.y + START.h / 2);
  await page.touchscreen.tap(start.x, start.y);
  await expect.poll(async () => (await getState(page)).phase).toBe('aiming');

  const client = await page.context().newCDPSession(page);
  const from = await toPage(page, 240, 420);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 1 }],
  });
  for (let i = 1; i <= 5; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x, y: from.y + i * 24, id: 1 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(100);
  expect((await getState(page)).hole.shots[0]).toBe(0);
  expect((await getState(page)).phase).toBe('aiming');

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 2 }],
  });
  for (let i = 1; i <= 8; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x, y: from.y + i * 22.5, id: 2 }],
    });
  }
  const label = await page.evaluate(() => {
    const text = window.__GAME__!.scene.getScene('Play').children.getByName('powerLabel') as Phaser.GameObjects.Text;
    return { text: text.text, x: text.x, y: text.y, visible: text.visible };
  });
  expect(label.visible).toBe(true);
  expect(label.text).toBe('100%');
  expect(label.x).toBeGreaterThanOrEqual(52);
  expect(label.x).toBeLessThanOrEqual(428);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await getState(page)).hole.shots[0]).toBe(1);
  await expect.poll(async () => (await getState(page)).phase).not.toBe('rolling');
});

test('power label clamps at the scene edge without moving the ball', async ({ page }) => {
  await bootPlay(page);
  const edge: MatchState = {
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
      balls: [ball(5, 300), null],
      brokenProps: [],
      collectedStars: [],
      lastResult: null,
    },
  };
  await startFixture(page, edge);
  const from = await toPage(page, 240, 420);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x, from.y + i * 20);
  const label = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play');
    const text = scene.children.getByName('powerLabel') as Phaser.GameObjects.Text;
    const sprite = scene.children.getByName('ball0') as Phaser.GameObjects.Arc;
    return { x: text.x, text: text.text, ballX: sprite.x, ballY: sprite.y };
  });
  expect(label.x).toBeGreaterThanOrEqual(52);
  expect(label.x).toBeLessThanOrEqual(428);
  expect(label.ballX).toBe(45);
  expect(label.ballY).toBe(450);
  await page.mouse.up();
});

test('hole rows show both-out and tied results without inventing a winner', async ({ page }) => {
  await bootPlay(page);
  const readRows = () =>
    page.evaluate(() => {
      const band = window.__GAME__!.scene.getScene('Play').children.getByName('holeBand') as Phaser.GameObjects.Container;
      return {
        line0: (band.getByName('holeBandLine0') as Phaser.GameObjects.Text).text,
        line1: (band.getByName('holeBandLine1') as Phaser.GameObjects.Text).text,
        award0: (band.getByName('holeBandAward0') as Phaser.GameObjects.Text).text,
        award1: (band.getByName('holeBandAward1') as Phaser.GameObjects.Text).text,
      };
    });

  const bothOut: MatchState = {
    ...holeOverFixture,
    points: [0, 0],
    hole: {
      ...holeOverFixture.hole,
      shots: [5, 5],
      result: ['out', 'out'],
      lastResult: [0, 0],
      balls: [ball(100, 100), ball(120, 120)],
    },
  };
  await startFixture(page, bothOut);
  expect(await readRows()).toEqual({
    line0: '5 shots · OUT',
    line1: '5 shots · OUT',
    award0: '+0',
    award1: '+0',
  });

  const tied: MatchState = {
    ...holeOverFixture,
    points: [0, 0],
    hole: {
      ...holeOverFixture.hole,
      shots: [3, 3],
      result: ['holed', 'holed'],
      lastResult: [0, 0],
      balls: [ball(348, 72, true), ball(348, 72, true)],
    },
  };
  await startFixture(page, tied);
  expect(await readRows()).toEqual({
    line0: '3 shots · HOLED',
    line1: '3 shots · HOLED',
    award0: '+0',
    award1: '+0',
  });
});

test('all result headings render and twenty replays leave no DOM leak', async ({ page }) => {
  test.setTimeout(120_000);
  await bootPlay(page);
  const cases: Array<[MatchState, string]> = [
    [matchOverFixture, 'YOU WIN'],
    [{ ...matchOverFixture, points: [1, 2] }, 'BOT WINS'],
    [{ ...matchOverFixture, points: [1, 1] }, 'DRAW'],
  ];
  for (const [fixture, heading] of cases) {
    await startFixture(page, fixture);
    const rendered = await page.evaluate(() => {
      const panel = window.__GAME__!.scene.getScene('Play').children.getByName('resultPanel') as Phaser.GameObjects.Container;
      return (panel.getByName('resultText') as Phaser.GameObjects.Text).text;
    });
    expect(rendered).toBe(heading);
    await action(page, 'playAgainButton').click();
    await expect.poll(async () => (await getState(page)).phase).toBe('placing');
  }

  const baseline = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    actions: document.querySelectorAll('[data-action-id]').length,
    dialogs: document.querySelectorAll('.ui-dialog').length,
  }));
  for (let i = 0; i < 20; i++) {
    await startFixture(page, matchOverFixture);
    await action(page, 'playAgainButton').click();
    await expect.poll(async () => (await getState(page)).phase).toBe('placing');
  }
  const after = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    actions: document.querySelectorAll('[data-action-id]').length,
    dialogs: document.querySelectorAll('.ui-dialog').length,
  }));
  expect(after.actions).toBe(baseline.actions);
  expect(after.dialogs).toBe(0);
  expect(after.nodes).toBeLessThanOrEqual(baseline.nodes + 10);
});

test('compact Title shows saved Continue and resumes a hole-over match', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript((state) => {
    localStorage.setItem(
      'minigolf:save',
      JSON.stringify({ version: 1, wins: 2, losses: 1, draws: 0, inProgress: state, muted: false }),
    );
  }, holeOverFixture);
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  expect(await page.evaluate(() => document.getElementById('ui-host')!.dataset.uiMode)).toBe('compact');
  await expect(action(page, 'continueButton')).toBeVisible();
  await expect(action(page, 'continueButton')).toHaveText('CONTINUE · HOLE 1');
  await action(page, 'continueButton').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await expect.poll(async () => (await getState(page)).phase).toBe('holeOver');
  await expect(page.locator('.ui-dialog')).toBeVisible();
  expect((await sceneObject(page, 'Play', 'holeBand')).visible).toBe(false);
});

test('storage denied falls back to an in-memory save without crashing', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function getItem(): string | null {
      throw new Error('storage denied');
    };
    Storage.prototype.setItem = function setItem(): void {
      throw new Error('storage denied');
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  await action(page, 'playButton').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  expect((await getState(page)).phase).toBe('placing');
});

test('collected star hides with its silhouette and broken prop decoration', async ({ page }) => {
  await page.goto('/?hole=3&seed=1');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  const star = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container & { setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void };
    const shape = course.getByName('star-star') as Phaser.GameObjects.Shape;
    const before = shape.visible;
    course.setFlags({ brokenProps: [], collectedStars: ['star'] });
    const hidden = shape.visible;
    course.setFlags({ brokenProps: [], collectedStars: [] });
    return { before, hidden, restored: shape.visible };
  });
  expect(star).toEqual({ before: true, hidden: false, restored: true });

  await page.goto('/?hole=1&seed=1');
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  const prop = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container & { setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void };
    const crate = course.getByName('prop-ring-top') as Phaser.GameObjects.Container;
    const before = crate.visible;
    course.setFlags({ brokenProps: ['ring-top'], collectedStars: [] });
    const hidden = crate.visible;
    course.setFlags({ brokenProps: [], collectedStars: [] });
    return { before, hidden, restored: crate.visible, decoration: crate.list.length };
  });
  expect(prop).toMatchObject({ before: true, hidden: false, restored: true, decoration: 2 });
});

test('a failed font request falls back without blocking the game', async ({ page }) => {
  await page.route('**/*.ttf', (route) => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  const font = await page.evaluate(
    () =>
      (window.__GAME__!.scene.getScene('Title').children.getByName('title') as Phaser.GameObjects.Text).style.fontFamily,
  );
  expect(font).not.toContain('Nunito Sans');
  expect(font).toContain('system-ui');
});

test('canvas is centred by one owner at letterbox and compact sizes', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await bootTitleFresh(page);
  const letterbox = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: canvas.x,
      y: canvas.y,
      width: canvas.width,
      height: canvas.height,
      mode: document.getElementById('ui-host')!.dataset.uiMode,
      scale: { width: window.__GAME__!.scale.width, height: window.__GAME__!.scale.height },
    };
  });
  expect(letterbox.mode).toBe('normal');
  expect(letterbox.x).toBeCloseTo(0, 1);
  expect(letterbox.y).toBeCloseTo(50, 1);
  expect(letterbox.width).toBe(480);
  expect(letterbox.height).toBe(800);
  expect(letterbox.scale).toEqual({ width: 480, height: 800 });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.getElementById('ui-host')!.dataset.uiMode === 'compact');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const compact = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const stage = document.getElementById('ui-stage')!.getBoundingClientRect();
    return {
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
      mode: document.getElementById('ui-host')!.dataset.uiMode,
    };
  });
  const expectedX = compact.stage.x + (compact.stage.width - compact.canvas.width) / 2;
  const expectedY = compact.stage.y + (compact.stage.height - compact.canvas.height) / 2;
  expect(compact.mode).toBe('compact');
  expect(Math.abs(compact.canvas.x - expectedX)).toBeLessThanOrEqual(1);
  expect(Math.abs(compact.canvas.y - expectedY)).toBeLessThanOrEqual(1);
  expect(Math.abs(compact.canvas.x - 194.6)).toBeLessThanOrEqual(1);
  expect(compact.canvas.width).toBeCloseTo(214.8, 0);
  expect(compact.canvas.height).toBeCloseTo(358, 0);
});

test('action overlay follows the canvas after resize and rapid resize', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await bootTitleFresh(page);
  const measure = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      const button = document.querySelector('[data-action-id="playButton"]')!.getBoundingClientRect();
      const scale = canvas.width / 480;
      return {
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        button: { x: button.x, y: button.y, width: button.width, height: button.height },
        expected: {
          x: canvas.x + 72 * scale,
          y: canvas.y + 528 * scale,
          width: 336 * scale,
          height: 80 * scale,
        },
      };
    });
  const check = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const info = await measure();
    expect(Math.abs(info.button.x - info.expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.button.y - info.expected.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.button.width - info.expected.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(info.button.height - info.expected.height)).toBeLessThanOrEqual(1);
  };
  await check();
  expect((await measure()).button.y).toBeCloseTo(578, 1);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.setViewportSize({ width: 480, height: 900 });
  await page.setViewportSize({ width: 480, height: 760 });
  await page.setViewportSize({ width: 480, height: 900 });
  await check();
});

const finalHole: MatchState = {
  ...holeOverFixture,
  holeIndex: 2,
  points: [1, 0],
  hole: { ...holeOverFixture.hole },
};

test('final-hole Continue focuses Play Again for mouse, touch and keyboard', async ({ page }) => {
  await bootPlay(page);
  const focus = () => page.evaluate(() => document.activeElement?.getAttribute('data-action-id') ?? document.activeElement?.tagName);
  for (const mode of ['mouse', 'touch', 'keyboard'] as const) {
    await startFixture(page, finalHole);
    const button = action(page, 'continueButton');
    if (mode === 'mouse') await button.click();
    else if (mode === 'touch') {
      const box = (await button.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await button.focus();
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState().phase === 'matchOver');
    await expect.poll(focus).toBe('playAgainButton');
    await page.waitForTimeout(300);
    expect(await focus()).toBe('playAgainButton');
  }

  await page.setViewportSize({ width: 844, height: 390 });
  await startFixture(page, finalHole);
  await action(page, 'continueButton').click();
  await page.waitForFunction(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState().phase === 'matchOver');
  await expect.poll(focus).toBe('playAgainButton');
  await page.waitForTimeout(300);
  expect(await focus()).toBe('playAgainButton');
});

test('a delayed bundle shows the slow notice and then recovers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.route('**/assets/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 9000));
    await route.continue();
  });
  const navigation = page.goto('/');
  await expect(page.locator('#ui-startup-status')).toHaveText('Still loading…', { timeout: 12_000 });
  await expect(page.locator('#ui-startup-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#ui-startup-status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#ui-startup-track')).toBeVisible();
  await expect(page.locator('#ui-startup-reload')).toBeVisible();
  await navigation;
  await page.waitForFunction(() => window.__GAME__?.isBooted === true, null, { timeout: 15_000 });
  await expect(page.locator('#ui-startup')).toBeHidden();
  await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'false');
});

test('normal boot clears the navigation slow timer', async ({ page }) => {
  await bootTitleFresh(page);
  await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('#ui-startup-status').getAttribute('role')).toBeNull();
  expect(await page.locator('#ui-startup-status').getAttribute('aria-live')).toBeNull();
  await expect(page.locator('.ui-live')).toHaveCount(1);
  await page.waitForTimeout(8300);
  await expect(page.locator('#ui-startup')).toBeHidden();
  await expect(page.locator('#ui-startup-status')).not.toHaveText('Still loading…');
});
