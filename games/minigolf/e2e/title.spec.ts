import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { MatchState } from '../src/logic/match';

// Title screen and save: boot lands on Title, Play starts a fresh match, a
// settled turn is saved, and Continue after a reload restores it.

type PlayHandle = Phaser.Scene & { getState(): MatchState };

const COURSE_ORIGIN = { x: 40, y: 150 };
/** Hole 1's start zone in course units. */
const START = { x: 24, y: 472, w: 64, h: 64 };

const bootTitle = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
};

/** Fresh page with an empty save, so runs are independent. */
const bootFresh = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await bootTitle(page);
};

const titleObject = (page: Page, name: string) =>
  page.evaluate((n) => {
    const obj = window.__GAME__!.scene.getScene('Title').children.getByName(n) as
      | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean })
      | null;
    return obj ? { exists: true, x: obj.x, y: obj.y, visible: obj.visible } : { exists: false, x: 0, y: 0, visible: false };
  }, name);

const recordText = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Title').children.getByName('record') as Phaser.GameObjects.Text).text);

const getState = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState());

/** Maps a 480x800 design point to a page point through the FIT-scaled canvas. */
const toPage = async (page: Page, x: number, y: number) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 800) * box.height };
};

const tapDesign = async (page: Page, x: number, y: number) => {
  const p = await toPage(page, x, y);
  await page.mouse.click(p.x, p.y);
};

const tapTitleButton = async (page: Page, name: string) => {
  const button = await titleObject(page, name);
  expect(button.exists).toBe(true);
  expect(button.visible).toBe(true);
  await tapDesign(page, button.x, button.y);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
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

test('boots on Title with the record, a Play button and no Continue', async ({ page }) => {
  await bootFresh(page);
  expect((await titleObject(page, 'title')).exists).toBe(true);
  expect(await recordText(page)).toBe('W 0 · L 0 · D 0');
  expect((await titleObject(page, 'playButton')).exists).toBe(true);
  expect((await titleObject(page, 'continueButton')).exists).toBe(false);
  const playActive = await page.evaluate(() => window.__GAME__!.scene.isActive('Play'));
  expect(playActive).toBe(false);
});

test('tapping Play starts a fresh match in placing', async ({ page }) => {
  await bootFresh(page);
  await tapTitleButton(page, 'playButton');
  await waitForPhase(page, (s) => s.phase === 'placing', 5_000);
  const state = await getState(page);
  expect(state.holeIndex).toBe(0);
  expect(state.activePlayer).toBe(0);
  expect(state.hole.shots).toEqual([0, 0]);
  const titleActive = await page.evaluate(() => window.__GAME__!.scene.isActive('Title'));
  expect(titleActive).toBe(false);
});

test('a settled turn is saved; Continue after a reload restores it', async ({ page }) => {
  test.setTimeout(60_000);
  await bootFresh(page);
  await tapTitleButton(page, 'playButton');
  await waitForPhase(page, (s) => s.phase === 'placing', 5_000);

  await tapStartZone(page);
  await waitForPhase(page, (s) => s.phase === 'aiming', 5_000);
  await dragShot(page, 60);
  await waitForPhase(page, (s) => s.hole.shots[0] === 1, 5_000);
  await waitForPhase(page, (s) => s.phase !== 'rolling');
  const before = await getState(page);

  // Reload: the title now offers Continue because a turn was saved.
  await page.goto('/');
  await bootTitle(page);
  const cont = await titleObject(page, 'continueButton');
  expect(cont.exists).toBe(true);
  expect(cont.visible).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('minigolf:save') ?? 'null'));
  expect(saved).toMatchObject({ version: 1, wins: 0, losses: 0, draws: 0 });
  expect(saved.inProgress).not.toBeNull();
  expect(saved.inProgress.phase).not.toBe('rolling');

  await tapTitleButton(page, 'continueButton');
  const restored = await getState(page);
  expect(restored.hole.shots[0]).toBeGreaterThanOrEqual(1);
  expect(restored.holeIndex).toBe(before.holeIndex);
  expect(restored.seed).toBe(before.seed);
  expect(restored.phase).not.toBe('rolling');

  // The human's ball is back on the course where it came to rest.
  const ball0 = await page.evaluate(() => {
    const ball = window.__GAME__!.scene.getScene('Play').children.getByName('ball0') as Phaser.GameObjects.Arc;
    return { visible: ball.visible, x: ball.x, y: ball.y };
  });
  const ball = restored.hole.balls[0]!;
  expect(ball0.visible).toBe(!ball.holed);
  expect(ball0.x).toBeCloseTo(COURSE_ORIGIN.x + ball.x, 5);
  expect(ball0.y).toBeCloseTo(COURSE_ORIGIN.y + ball.y, 5);
});

test('Play from the title discards the saved match', async ({ page }) => {
  await bootFresh(page);
  await tapTitleButton(page, 'playButton');
  await waitForPhase(page, (s) => s.phase === 'placing', 5_000);
  await tapStartZone(page);
  await waitForPhase(page, (s) => s.phase === 'aiming', 5_000);
  await dragShot(page, 60);
  await waitForPhase(page, (s) => s.hole.shots[0] === 1, 5_000);
  await waitForPhase(page, (s) => s.phase !== 'rolling');

  await page.goto('/');
  await bootTitle(page);
  expect((await titleObject(page, 'continueButton')).exists).toBe(true);
  await tapTitleButton(page, 'playButton');
  await waitForPhase(page, (s) => s.phase === 'placing' && s.hole.shots[0] === 0, 5_000);

  await page.goto('/');
  await bootTitle(page);
  expect((await titleObject(page, 'continueButton')).exists).toBe(false);
});
