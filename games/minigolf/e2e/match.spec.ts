import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { MatchState } from '../src/logic/match';

// Match play on hole 1: the human places and shoots, the bot answers on its
// own, and the hole-over band leads to the match result.

type PlayHandle = Phaser.Scene & { getState(): MatchState };

const COURSE_ORIGIN = { x: 40, y: 150 };
/** Hole 1's start zone in course units. */
const START = { x: 24, y: 472, w: 64, h: 64 };

const waitForPlay = async (page: Page, query = '?seed=1') => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

const getState = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState());

const objectInfo = (page: Page, name: string) =>
  page.evaluate((n) => {
    const obj = window.__GAME__!.scene.getScene('Play').children.getByName(n) as
      | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean })
      | null;
    return obj ? { exists: true, x: obj.x, y: obj.y, visible: obj.visible } : { exists: false, x: 0, y: 0, visible: false };
  }, name);

/** Maps a 480x800 design point to a page point through the FIT-scaled canvas. */
const toPage = async (page: Page, x: number, y: number) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 800) * box.height };
};

const tapDesign = async (page: Page, x: number, y: number) => {
  const p = await toPage(page, x, y);
  await page.mouse.click(p.x, p.y);
};

const tapStartZone = (page: Page) =>
  tapDesign(page, COURSE_ORIGIN.x + START.x + START.w / 2, COURSE_ORIGIN.y + START.y + START.h / 2);

/** Pull-back drag of `length` px downward from mid-screen (ball flies up). */
const dragShot = async (page: Page, length: number) => {
  const from = await toPage(page, 240, 420);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (length * i) / steps);
  }
  await page.mouse.up();
};

const waitForPhase = (page: Page, predicate: (s: MatchState) => boolean, timeout = 20_000) =>
  expect.poll(async () => predicate(await getState(page)), { timeout }).toBe(true);

test('HUD cards exist at boot and the human is active', async ({ page }) => {
  await waitForPlay(page);
  expect((await objectInfo(page, 'card0')).exists).toBe(true);
  expect((await objectInfo(page, 'card1')).exists).toBe(true);
  expect((await objectInfo(page, 'ball1')).exists).toBe(true);
  expect((await objectInfo(page, 'hintLabel')).visible).toBe(true);

  const state = await getState(page);
  expect(state.phase).toBe('placing');
  expect(state.activePlayer).toBe(0);
  expect(state.seed).toBe(1);
  expect((await objectInfo(page, 'turn0')).visible).toBe(true);
  expect((await objectInfo(page, 'turn1')).visible).toBe(false);
});

test('reads the seed from the URL', async ({ page }) => {
  await waitForPlay(page, '?seed=42');
  expect((await getState(page)).seed).toBe(42);
});

test('tapping the start zone places ball0 and moves to aiming', async ({ page }) => {
  await waitForPlay(page);

  // A tap outside the zone does nothing.
  await tapDesign(page, 240, 400);
  expect((await getState(page)).phase).toBe('placing');

  await tapStartZone(page);
  await waitForPhase(page, (s) => s.phase === 'aiming', 5_000);
  const state = await getState(page);
  const ball = state.hole.balls[0]!;
  expect(ball.x).toBeGreaterThanOrEqual(START.x);
  expect(ball.x).toBeLessThanOrEqual(START.x + START.w);
  expect(ball.y).toBeGreaterThanOrEqual(START.y);
  expect(ball.y).toBeLessThanOrEqual(START.y + START.h);

  const sprite = await objectInfo(page, 'ball0');
  expect(sprite.visible).toBe(true);
  expect(sprite.x).toBeGreaterThanOrEqual(COURSE_ORIGIN.x + START.x);
  expect(sprite.x).toBeLessThanOrEqual(COURSE_ORIGIN.x + START.x + START.w);
  expect(sprite.y).toBeGreaterThanOrEqual(COURSE_ORIGIN.y + START.y);
  expect(sprite.y).toBeLessThanOrEqual(COURSE_ORIGIN.y + START.y + START.h);
});

test('a shot rolls, then the bot takes its turn without input', async ({ page }) => {
  await waitForPlay(page);
  await tapStartZone(page);
  await waitForPhase(page, (s) => s.phase === 'aiming', 5_000);

  await dragShot(page, 120);
  await waitForPhase(page, (s) => s.phase === 'rolling' || s.hole.shots[0] === 1, 5_000);
  expect((await getState(page)).hole.shots[0]).toBe(1);

  await waitForPhase(page, (s) => s.activePlayer === 1);
  expect((await objectInfo(page, 'turn1')).visible).toBe(true);
  expect((await objectInfo(page, 'turn0')).visible).toBe(false);

  await waitForPhase(page, (s) => s.hole.shots[1] >= 1);
  expect((await objectInfo(page, 'ball1')).visible).toBe(true);
});

test('hole over shows the band, continue leads to the next hole', async ({ page }) => {
  test.setTimeout(150_000);
  await waitForPlay(page);

  // Play the hole with deliberately weak human shots until it is over.
  for (let guard = 0; guard < 40; guard++) {
    const state = await getState(page);
    if (state.phase === 'holeOver' || state.phase === 'matchOver') break;
    if (state.activePlayer === 0 && state.phase === 'placing') {
      await tapStartZone(page);
      await waitForPhase(page, (s) => s.phase !== 'placing', 5_000);
    } else if (state.activePlayer === 0 && state.phase === 'aiming') {
      const shotsBefore = state.hole.shots[0];
      await dragShot(page, 30);
      await waitForPhase(page, (s) => s.hole.shots[0] > shotsBefore, 5_000);
      await waitForPhase(page, (s) => s.phase !== 'rolling');
    } else {
      // Bot's turn or a roll in progress: wait for one settled change (a bot
      // shot landing, the turn passing, or the hole ending).
      const mark = JSON.stringify([state.phase, state.activePlayer, state.hole.shots]);
      await waitForPhase(
        page,
        (s) => s.phase !== 'rolling' && JSON.stringify([s.phase, s.activePlayer, s.hole.shots]) !== mark,
        25_000,
      );
    }
  }

  const over = await getState(page);
  expect(over.phase).toBe('holeOver');
  expect(over.hole.result[0]).not.toBe('playing');
  expect(over.hole.result[1]).not.toBe('playing');
  expect(over.hole.lastResult).not.toBeNull();

  const band = await objectInfo(page, 'holeBand');
  expect(band.visible).toBe(true);
  const button = await objectInfo(page, 'continueButton');
  expect(button.visible).toBe(true);
  await tapDesign(page, button.x, button.y);

  await expect.poll(async () => (await objectInfo(page, 'holeBand')).visible).toBe(false);
  await expect.poll(async () => (await objectInfo(page, 'continueButton')).visible).toBe(false);

  // Continue moves on to hole 2, where the bot tees off on a fresh course.
  await waitForPhase(page, (s) => s.phase === 'placing' && s.holeIndex === 1, 5_000);
  const next = await getState(page);
  expect(next.activePlayer).toBe(1);
  expect(next.hole.balls).toEqual([null, null]);
  expect(next.hole.shots).toEqual([0, 0]);
  expect(next.points[0] + next.points[1]).toBe(over.points[0] + over.points[1]);
  expect((await objectInfo(page, 'resultPanel')).visible).toBe(false);
  expect((await objectInfo(page, 'ball0')).visible).toBe(false);
  const banner = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container;
    return (course.getByName('capBanner') as Phaser.GameObjects.Text).text;
  });
  expect(banner).toBe('MAX SHOTS 4');
});

test('continuing from the last hole shows the match result', async ({ page }) => {
  test.setTimeout(150_000);
  await waitForPlay(page, '?hole=3&seed=1');
  expect((await getState(page)).holeIndex).toBe(2);
  // Hole 3's start zone: x 12..68, y 492..548 in course units.
  const tapStart3 = () => tapDesign(page, COURSE_ORIGIN.x + 40, COURSE_ORIGIN.y + 520);

  for (let guard = 0; guard < 40; guard++) {
    const state = await getState(page);
    if (state.phase === 'holeOver' || state.phase === 'matchOver') break;
    if (state.activePlayer === 0 && state.phase === 'placing') {
      await tapStart3();
      await waitForPhase(page, (s) => s.phase !== 'placing', 5_000);
    } else if (state.activePlayer === 0 && state.phase === 'aiming') {
      const shotsBefore = state.hole.shots[0];
      await dragShot(page, 30);
      await waitForPhase(page, (s) => s.hole.shots[0] > shotsBefore, 5_000);
      await waitForPhase(page, (s) => s.phase !== 'rolling');
    } else {
      const mark = JSON.stringify([state.phase, state.activePlayer, state.hole.shots]);
      await waitForPhase(
        page,
        (s) => s.phase !== 'rolling' && JSON.stringify([s.phase, s.activePlayer, s.hole.shots]) !== mark,
        25_000,
      );
    }
  }

  expect((await getState(page)).phase).toBe('holeOver');
  const button = await objectInfo(page, 'continueButton');
  expect(button.visible).toBe(true);
  await tapDesign(page, button.x, button.y);

  await waitForPhase(page, (s) => s.phase === 'matchOver', 5_000);
  const panel = await objectInfo(page, 'resultPanel');
  expect(panel.visible).toBe(true);
  const result = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play');
    const panel = scene.children.getByName('resultPanel') as Phaser.GameObjects.Container;
    return (panel.getByName('resultText') as Phaser.GameObjects.Text).text;
  });
  expect(['YOU WIN', 'BOT WINS', 'DRAW']).toContain(result);
  expect((await objectInfo(page, 'playAgainButton')).visible).toBe(true);
  expect((await objectInfo(page, 'turn0')).visible).toBe(false);
});
