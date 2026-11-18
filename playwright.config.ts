import { defineConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';

// Every folder under games/ becomes a Playwright project served by `vite preview`
// on its own port. Run `npm run check` (which builds) before `npm run e2e`.
const games = readdirSync('games', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const PORT_BASE = 4173;
const port = (i: number) => PORT_BASE + i;

export default defineConfig({
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Portrait phone. Matches the 480x800 design resolution with FIT scaling.
    viewport: { width: 480, height: 800 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    browserName: 'chromium',
  },
  projects: games.map((name, i) => ({
    name,
    testDir: `games/${name}/e2e`,
    use: { baseURL: `http://localhost:${port(i)}` },
  })),
  webServer: games.map((name, i) => ({
    command: `npm run preview -w games/${name} -- --port ${port(i)} --strictPort`,
    port: port(i),
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  })),
});
