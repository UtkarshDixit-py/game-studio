import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { MatchState } from '../src/logic/match';

// `?hole=N` starts the match at that hole (1-based) and renders its course.

type PlayHandle = Phaser.Scene & { getState(): MatchState };

const waitForPlay = async (page: Page, query: string) => {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

const getState = (page: Page) =>
  page.evaluate(() => (window.__GAME__!.scene.getScene('Play') as PlayHandle).getState());

const courseInfo = (page: Page) =>
  page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container;
    const banner = course.getByName('capBanner') as Phaser.GameObjects.Text;
    return { names: course.list.map((child) => child.name), banner: banner.text, bannerVisible: banner.visible };
  });

test('?hole=2 starts on Portal pegs with the bot teeing off', async ({ page }) => {
  await waitForPlay(page, '?hole=2&seed=1');
  const state = await getState(page);
  expect(state.holeIndex).toBe(1);
  expect(state.activePlayer).toBe(1);
  expect(state.points).toEqual([0, 0]);

  const info = await courseInfo(page);
  expect(info.banner).toBe('MAX SHOTS 4');
  expect(info.bannerVisible).toBe(true);
  expect(info.names.filter((n) => n.startsWith('portal-')).length).toBeGreaterThanOrEqual(1);
  expect(info.names.filter((n) => n.startsWith('conveyor-')).length).toBeGreaterThanOrEqual(1);
  expect(info.names).toContain('sand-0');
  expect(info.names).toContain('water-0');
  expect(info.names.filter((n) => n.startsWith('wall-')).length).toBeGreaterThanOrEqual(8);
  // The hint band is for hole 1 only.
  const hint = await page.evaluate(() => {
    const label = window.__GAME__!.scene.getScene('Play').children.getByName('hintLabel') as Phaser.GameObjects.Text;
    return label.visible;
  });
  expect(hint).toBe(false);
});

test('?hole=3 starts on Belt maze with conveyors and a star', async ({ page }) => {
  await waitForPlay(page, '?hole=3&seed=1');
  const state = await getState(page);
  expect(state.holeIndex).toBe(2);
  expect(state.activePlayer).toBe(0);
  expect(state.phase).toBe('placing');

  const info = await courseInfo(page);
  expect(info.banner).toBe('MAX SHOTS 6');
  expect(info.names.filter((n) => n.startsWith('conveyor-')).length).toBeGreaterThanOrEqual(3);
  expect(info.names.filter((n) => n.startsWith('star-')).length).toBe(1);
  expect(info.names).toContain('sand-0');
});

test('an out-of-range or missing ?hole falls back sensibly', async ({ page }) => {
  await waitForPlay(page, '?hole=9');
  expect((await getState(page)).holeIndex).toBe(2);
  await waitForPlay(page, '?hole=abc');
  expect((await getState(page)).holeIndex).toBe(0);
  expect((await courseInfo(page)).banner).toBe('MAX SHOTS 5');
});
