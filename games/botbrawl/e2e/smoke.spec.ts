import { expect, test } from '@playwright/test';
import type Phaser from 'phaser';

// Smoke: the game boots in a phone viewport and the placeholder button responds to touch.
test('boots and reacts to a tap', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Boot'));

  // Convert the button's design-space position to screen space (FIT scaling applied).
  const target = await page.evaluate(() => {
    const game = window.__GAME__!;
    const btn = game.scene.getScene('Boot').children.getByName('tapButton') as Phaser.GameObjects.Container;
    const rect = game.scale.canvas.getBoundingClientRect();
    return {
      x: rect.left + btn.x * (rect.width / game.scale.width),
      y: rect.top + btn.y * (rect.height / game.scale.height),
    };
  });
  await page.touchscreen.tap(target.x, target.y);

  const counterText = () =>
    page.evaluate(
      () => (window.__GAME__!.scene.getScene('Boot').children.getByName('tapCounter') as Phaser.GameObjects.Text).text,
    );
  await expect.poll(counterText).toBe('taps: 1');
});
