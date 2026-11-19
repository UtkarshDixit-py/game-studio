import { expect, test } from '@playwright/test';

// The assembled launcher and mechanics shell, served from site/ exactly as the
// static host serves them. No production deployment is used.

test('launcher lists only the playable game with authored links and a build stamp', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Game Studio');
  await expect(page.locator('.game-card')).toHaveCount(1);
  await expect(page.locator('.game-card__title')).toHaveText('Putt Duel');
  await expect(page.locator('.game-card__description')).toHaveText('Three holes. You versus the bot.');
  await expect(page.locator('.game-card__play')).toHaveText('Play Putt Duel');
  await expect(page.locator('.game-card__play')).toHaveAttribute('href', './minigolf/');
  await expect(page.locator('.game-card__rules')).toHaveText('Rules & mechanics');
  await expect(page.locator('.game-card__rules')).toHaveAttribute('href', './minigolf/mechanics.html');
  await expect(page.locator('.launcher__footer')).toHaveText(/^Build (?:[0-9a-f]{7,}|local) · .+ UTC$/);
  await expect(page.locator('.launcher__header p')).toHaveText('Small games. One more round.');

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('Bot Brawl');
  expect(bodyText).not.toContain('Minigolf');
});

test('launcher controls meet the 44 CSS px floor and do not overflow', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.evaluate(() => {
    const card = document.querySelector('.game-card')!.getBoundingClientRect();
    const preview = document.querySelector('.game-card__preview')!.getBoundingClientRect();
    const play = document.querySelector('.game-card__play')!.getBoundingClientRect();
    const rules = document.querySelector('.game-card__rules')!.getBoundingClientRect();
    return {
      card: { w: card.width },
      preview: { h: preview.height },
      play: { w: play.width, h: play.height },
      rules: { w: rules.width, h: rules.height },
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(sizes.card.w).toBeLessThanOrEqual(480);
  expect(sizes.preview.h).toBe(152);
  expect(sizes.play.h).toBeGreaterThanOrEqual(44);
  expect(sizes.play.w).toBeGreaterThanOrEqual(44);
  expect(sizes.rules.h).toBeGreaterThanOrEqual(44);
  expect(sizes.rules.w).toBeGreaterThanOrEqual(44);
  expect(sizes.overflow).toBe(false);

  await page.setViewportSize({ width: 375, height: 812 });
  const mobile = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.game-grid')!).gridTemplateColumns.split(' ').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    playHeight: document.querySelector('.game-card__play')!.getBoundingClientRect().height,
    rulesHeight: document.querySelector('.game-card__rules')!.getBoundingClientRect().height,
  }));
  expect(mobile.columns).toBe(1);
  expect(mobile.overflow).toBe(false);
  expect(mobile.playHeight).toBeGreaterThanOrEqual(44);
  expect(mobile.rulesHeight).toBeGreaterThanOrEqual(44);
});

test('launcher keyboard focus is visible and links navigate to the game and mechanics', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return { className: element.className, outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
  });
  expect(focus.className).toContain('game-card__play');
  expect(focus.outlineStyle).toBe('solid');
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);

  await page.locator('.game-card__play').click();
  await page.waitForFunction(() => window.__GAME__?.isBooted === true);
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Title'));
  // Desktop Putt Duel intentionally replaces the title canvas with the
  // tabletop title; Play must reveal the canvas again.
  await expect(page.locator('.pd-title')).toBeVisible();
  await expect(page.locator('[data-action-id="playButton"]')).toBeVisible();
  // Let the dispatcher move the title action into the desktop slot before
  // activating it; a real launcher entry has the same settle time.
  await page.waitForTimeout(500);
  await page.locator('[data-action-id="playButton"]').click();
  await page.waitForFunction(() => window.__GAME__!.scene.isActive('Play'));
  await expect(page.locator('.pd-play')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/minigolf/');

  await page.goto('/minigolf/mechanics.html');
  await expect(page.locator('h1')).toHaveText('Putt Duel mechanics');
  await expect(page.locator('.ui-back')).toHaveText('All games');
  await expect(page.locator('.ui-back')).toHaveAttribute('href', '../');
  await expect(page.locator('.scroll[aria-label]')).toHaveCount(6);
  await expect(page.locator('table')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  const back = await page.locator('.ui-back').boundingBox();
  expect(back!.height).toBeGreaterThanOrEqual(44);
  await page.locator('.ui-back').click();
  await expect(page.locator('h1')).toHaveText('Game Studio');
});

test('the skeleton is not published and the mechanics page keeps its facts', async ({ page, request }) => {
  for (const path of [
    '/ui/styles/tokens.css',
    '/ui/styles/fonts.css',
    '/ui/styles/launcher.css',
    '/ui/assets/fonts/NunitoSans-variable.ttf',
    '/ui/assets/fonts/OFL.txt',
  ]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await page.goto('/minigolf/mechanics.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('#s-match')).toHaveText('The match');
  await expect(page.locator('#s-aim')).toHaveText('Aiming');
  await expect(page.locator('#s-holes')).toHaveText('The three holes');
  await expect(page.getByText('12 s', { exact: true })).toHaveCount(1);
  await expect(page.getByText('85%', { exact: true })).toHaveCount(1);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toContain('Nunito Sans');
});

test('a blocked assembled game bundle shows the startup error and Reload', async ({ page }) => {
  await page.route('**/minigolf/assets/*.js', (route) => route.abort());
  await page.goto('/minigolf/');
  await expect(page.locator('#ui-startup-status')).toHaveText('The game couldn’t load.');
  await expect(page.locator('#ui-startup-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#ui-startup-status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#ui-startup-track')).toBeHidden();
  await expect(page.locator('#ui-startup-reload')).toBeVisible();
  const box = (await page.locator('#ui-startup-reload').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(160);
  expect(box.height).toBeGreaterThanOrEqual(48);
  const navigated = page.waitForEvent('framenavigated');
  await page.locator('#ui-startup-reload').click();
  await navigated;
  await expect(page.locator('#ui-startup-status')).toHaveText('The game couldn’t load.');
  await expect(page.locator('#ui-startup-track')).toBeHidden();
  await expect(page.locator('#ui-host')).toHaveAttribute('aria-busy', 'false');
});
