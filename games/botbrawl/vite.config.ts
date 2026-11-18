import { defineConfig } from 'vite';

// base './' keeps the build relocatable: GitHub Pages sub-folder today,
// Capacitor's file:// WebView later.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
