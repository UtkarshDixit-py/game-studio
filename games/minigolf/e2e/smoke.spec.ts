import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';

// Smoke: the game boots in a phone viewport, a tap places the ball, a pull-back
// drag shows the aim HUD, and releasing rolls the ball until friction stops it.

/** Maps a 480x800 design point to a page point through the FIT-scaled canvas. */
const toPage = async (page: Page, x: number, y: number) => {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + (x / 480) * box.width, y: box.y + (y / 800) * box.height };
};

/** Boots to the title screen and taps Play, landing in the Play scene. */
const waitForPlay = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  const button = await page.evaluate(() => {
    const b = window.__GAME__!.scene.getScene('Title').children.getByName('playButton') as Phaser.GameObjects.Container;
    return { x: b.x, y: b.y };
  });
  const { x, y } = await toPage(page, button.x, button.y);
  await page.mouse.click(x, y);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

/** Taps the centre of hole 1's start zone (course 56,504 → screen 96,654). */
const placeBall = async (page: Page) => {
  const { x, y } = await toPage(page, 40 + 56, 150 + 504);
  await page.mouse.click(x, y);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & { getState(): { phase: string } };
        return scene.getState().phase;
      }),
    )
    .toBe('aiming');
};

const ballPosition = (page: Page) =>
  page.evaluate(() => {
    const ball = window.__GAME__!.scene.getScene('Play').children.getByName('ball0') as Phaser.GameObjects.Arc;
    return { x: ball.x, y: ball.y };
  });

const powerLabel = (page: Page) =>
  page.evaluate(() => {
    const label = window.__GAME__!.scene.getScene('Play').children.getByName('powerLabel') as Phaser.GameObjects.Text;
    return { visible: label.visible, text: label.text };
  });

const ballAtRest = (page: Page) =>
  page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & { isBallAtRest(): boolean };
    return scene.isBallAtRest();
  });

test('boots with a ball on the court', async ({ page }) => {
  await waitForPlay(page);
  const exists = await page.evaluate(
    () => window.__GAME__!.scene.getScene('Play').children.getByName('ball0') !== null,
  );
  expect(exists).toBe(true);
});

test('pull-back drag shows power and shoots the ball', async ({ page }) => {
  await waitForPlay(page);
  await placeBall(page);
  const before = await ballPosition(page);
  expect(await powerLabel(page)).toMatchObject({ visible: false });

  // Drag 120 px straight down from the lower half of the canvas: the ball
  // should fly upward (opposite to the drag).
  const box = (await page.locator('canvas').boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(startX, startY + i * 20);
  }

  await expect.poll(async () => (await powerLabel(page)).visible).toBe(true);
  const label = await powerLabel(page);
  expect(label.text).toMatch(/^\d+%$/);
  expect(parseInt(label.text, 10)).toBeGreaterThan(0);

  await page.mouse.up();

  await expect.poll(async () => (await powerLabel(page)).visible).toBe(false);
  await expect
    .poll(async () => {
      const now = await ballPosition(page);
      return now.x !== before.x || now.y !== before.y;
    })
    .toBe(true);

  await expect.poll(() => ballAtRest(page), { timeout: 15_000 }).toBe(true);
});
