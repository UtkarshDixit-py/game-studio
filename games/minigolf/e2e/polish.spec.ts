import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { MatchState } from '../src/logic/match';

// Polish pass: the mute toggle persists to the save, and a whole scripted
// match plays through to the result panel without a single browser error.

type PlayHandle = Phaser.Scene & { getState(): MatchState };

const COURSE_ORIGIN = { x: 40, y: 150 };
/** Start-zone centres of the three holes, in course units. */
const START_CENTRES = [
  { x: 56, y: 504 },
  { x: 56, y: 508 },
  { x: 40, y: 520 },
] as const;

type Info = { exists: boolean; x: number; y: number; visible: boolean };

const sceneObject = (page: Page, scene: string, name: string) =>
  page.evaluate(
    ([s, n]) => {
      const obj = window.__GAME__!.scene.getScene(s).children.getByName(n) as
        | (Phaser.GameObjects.GameObject & { x: number; y: number; visible: boolean })
        | null;
      return obj ? { exists: true, x: obj.x, y: obj.y, visible: obj.visible } : { exists: false, x: 0, y: 0, visible: false };
    },
    [scene, name] as const,
  ) as Promise<Info>;

const savedMuted = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('minigolf:save');
    return raw === null ? null : (JSON.parse(raw) as { muted?: unknown }).muted;
  });

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

const bootTitleFresh = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
};

const waitForPlay = async (page: Page, query: string) => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

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

const waitForPhase = (page: Page, predicate: (s: MatchState) => boolean, timeout = 25_000) =>
  expect.poll(async () => predicate(await getState(page)), { timeout }).toBe(true);

test('the Title mute button flips the saved muted flag', async ({ page }) => {
  await bootTitleFresh(page);
  const button = await sceneObject(page, 'Title', 'muteButton');
  expect(button.exists).toBe(true);
  expect(button.visible).toBe(true);

  await tapDesign(page, button.x, button.y);
  await expect.poll(() => savedMuted(page)).toBe(true);

  await tapDesign(page, button.x, button.y);
  await expect.poll(() => savedMuted(page)).toBe(false);

  // The flag survives a reload and the Play HUD has its own toggle.
  await tapDesign(page, button.x, button.y);
  await expect.poll(() => savedMuted(page)).toBe(true);
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  expect(await savedMuted(page)).toBe(true);
  const play = await sceneObject(page, 'Title', 'playButton');
  await tapDesign(page, play.x, play.y);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  const hudMute = await sceneObject(page, 'Play', 'muteButton');
  expect(hudMute.exists).toBe(true);
  expect(hudMute.visible).toBe(true);
  await tapDesign(page, hudMute.x, hudMute.y);
  await expect.poll(() => savedMuted(page)).toBe(false);
  // The tap on the HUD button did not place a ball.
  expect((await getState(page)).phase).toBe('placing');
});

test('a full scripted match reaches the result panel with no browser errors', async ({ page }) => {
  // Three holes with caps 5/4/6; every bot roll can run the full 12 s timeout.
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await waitForPlay(page, '?seed=1');
  expect((await sceneObject(page, 'Play', 'muteButton')).exists).toBe(true);
  expect((await sceneObject(page, 'Play', 'aimRing')).exists).toBe(true);
  expect((await sceneObject(page, 'Play', 'turnPointer')).exists).toBe(true);

  let sawAimRing = false;
  let sawTurnPointer = false;

  for (let guard = 0; guard < 120; guard++) {
    const state = await getState(page);
    if (state.phase === 'matchOver') break;

    if (state.phase === 'holeOver') {
      const button = await sceneObject(page, 'Play', 'continueButton');
      expect(button.visible).toBe(true);
      await tapDesign(page, button.x, button.y);
      await waitForPhase(page, (s) => s.phase !== 'holeOver', 5_000);
    } else if (state.activePlayer === 0 && state.phase === 'placing') {
      const start = START_CENTRES[state.holeIndex]!;
      await tapDesign(page, COURSE_ORIGIN.x + start.x, COURSE_ORIGIN.y + start.y);
      await waitForPhase(page, (s) => s.phase !== 'placing', 5_000);
    } else if (state.activePlayer === 0 && state.phase === 'aiming') {
      if ((await sceneObject(page, 'Play', 'aimRing')).visible) sawAimRing = true;
      if ((await sceneObject(page, 'Play', 'turnPointer')).visible) sawTurnPointer = true;
      const shotsBefore = state.hole.shots[0];
      await dragShot(page, 30);
      await waitForPhase(page, (s) => s.hole.shots[0] > shotsBefore, 5_000);
      await waitForPhase(page, (s) => s.phase !== 'rolling');
    } else {
      // Bot's turn or a roll in progress: wait for one settled change.
      const mark = JSON.stringify([state.phase, state.activePlayer, state.hole.shots]);
      await waitForPhase(
        page,
        (s) => s.phase !== 'rolling' && JSON.stringify([s.phase, s.activePlayer, s.hole.shots]) !== mark,
      );
    }
  }

  const final = await getState(page);
  expect(final.phase).toBe('matchOver');
  expect(final.holeIndex).toBe(2);
  await expect.poll(async () => (await sceneObject(page, 'Play', 'resultPanel')).visible).toBe(true);
  expect((await sceneObject(page, 'Play', 'playAgainButton')).visible).toBe(true);
  expect(sawAimRing).toBe(true);
  expect(sawTurnPointer).toBe(true);
  expect((await sceneObject(page, 'Play', 'aimRing')).visible).toBe(false);
  expect((await sceneObject(page, 'Play', 'turnPointer')).visible).toBe(false);

  // The hint band faded away after the first settled shot on hole 1.
  expect((await sceneObject(page, 'Play', 'hintLabel')).visible).toBe(false);

  // The match result was recorded and the in-progress slot cleared.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('minigolf:save') ?? 'null'));
  expect(saved.inProgress).toBeNull();
  expect(saved.wins + saved.losses + saved.draws).toBe(1);

  expect(errors).toEqual([]);
});
