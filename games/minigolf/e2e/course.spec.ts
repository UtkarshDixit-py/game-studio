import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';

// Hole 1 renders through CourseView: the `course` container holds named tiles
// and the shot-cap banner.

const waitForPlay = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
};

const courseChildNames = (page: Page) =>
  page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container | null;
    return course ? course.list.map((child) => child.name) : null;
  });

test('course container exists with hole, start, props and cap banner', async ({ page }) => {
  await waitForPlay(page);
  const names = await courseChildNames(page);
  expect(names).not.toBeNull();
  expect(names).toContain('hole');
  expect(names).toContain('start');
  expect(names!.filter((n) => n.startsWith('prop-')).length).toBeGreaterThanOrEqual(4);
  expect(names!.filter((n) => n.startsWith('wall-')).length).toBeGreaterThanOrEqual(2);
  expect(names).toContain('water-0');

  const banner = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container;
    const text = course.getByName('capBanner') as Phaser.GameObjects.Text;
    return { text: text.text, visible: text.visible };
  });
  expect(banner).toEqual({ text: 'MAX SHOTS 5', visible: true });
});

test('course sits at the SPEC origin (40,150) and names every hole 1 tile', async ({ page }) => {
  await waitForPlay(page);
  const info = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container;
    return { x: course.x, y: course.y, names: course.list.map((c) => c.name).sort() };
  });
  expect(info.x).toBe(40);
  expect(info.y).toBe(150);
  expect(info.names).toEqual(
    expect.arrayContaining([
      'hole',
      'start',
      'wall-0',
      'wall-1',
      'water-0',
      'prop-ring-top',
      'prop-ring-bottom',
      'prop-ring-left',
      'prop-ring-right',
      'capBanner',
    ]),
  );
});

test('setFlags hides broken props and shows the rest', async ({ page }) => {
  await waitForPlay(page);
  const result = await page.evaluate(() => {
    const course = window.__GAME__!.scene.getScene('Play').children.getByName('course') as Phaser.GameObjects.Container & {
      setFlags(flags: { brokenProps: string[]; collectedStars: string[] }): void;
    };
    const visible = () =>
      ['ring-top', 'ring-bottom', 'ring-left', 'ring-right'].map(
        (id) => (course.getByName(`prop-${id}`) as Phaser.GameObjects.Shape).visible,
      );
    const before = visible();
    course.setFlags({ brokenProps: ['ring-top', 'ring-left'], collectedStars: [] });
    const broken = visible();
    course.setFlags({ brokenProps: [], collectedStars: [] });
    const restored = visible();
    return { before, broken, restored };
  });
  expect(result.before).toEqual([true, true, true, true]);
  expect(result.broken).toEqual([false, true, false, true]);
  expect(result.restored).toEqual([true, true, true, true]);
});

test('tapping the start zone places the ball inside it', async ({ page }) => {
  await waitForPlay(page);
  // The ball is unplaced until the human taps the start zone.
  const unplaced = await page.evaluate(() => {
    const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & { getBall(): unknown };
    return scene.getBall();
  });
  expect(unplaced).toBeNull();

  // Hole 1's start zone is bottom-left: x 24..88, y 472..536 in course units,
  // drawn at the course origin (40,150). Tap its centre.
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + ((40 + 56) / 480) * box.width, box.y + ((150 + 504) / 800) * box.height);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__GAME__!.scene.getScene('Play') as Phaser.Scene & {
          getBall(): { x: number; y: number } | null;
        };
        const ball = scene.getBall();
        return ball !== null && ball.x > 24 && ball.x < 88 && ball.y > 472 && ball.y < 536;
      }),
    )
    .toBe(true);
});
