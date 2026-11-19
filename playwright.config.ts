import { defineConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';

// Every folder under games/ becomes a Playwright project served by `vite preview`
// on its own port. The assembled static site gets its own project. Run
// `npm run check` (which builds) and `bash scripts/build-site.sh` before
// `npm run e2e`.
const games = readdirSync('games', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const PORT_BASE = 4173;
// QA can point the assembled-site project at a staged candidate while a live
// preview keeps the default site/ on 4180.
const SITE_PORT = Number(process.env.SITE_PORT ?? 4180);
const SITE_DIR = process.env.SITE_DIR ?? 'site';
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
  projects: [
    ...games.map((name, i) => ({
      name,
      testDir: `games/${name}/e2e`,
      use: { baseURL: `http://localhost:${port(i)}` },
    })),
    {
      name: 'site',
      testDir: 'e2e/site',
      use: {
        baseURL: `http://127.0.0.1:${SITE_PORT}`,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: [
    ...games.map((name, i) => ({
      // Bind the preview server to loopback; these are test fixtures, not a
      // public deployment.
      command: `npx vite preview games/${name} --host 127.0.0.1 --port ${port(i)} --strictPort`,
      port: port(i),
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    })),
    {
      command: `npx vite ${SITE_DIR} --host 127.0.0.1 --port ${SITE_PORT} --strictPort`,
      port: SITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
