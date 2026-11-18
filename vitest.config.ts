import { defineConfig } from 'vitest/config';

// One Vitest run covers every workspace. Logic under src/logic/ must stay
// Phaser-free so it runs in plain Node.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'games/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
