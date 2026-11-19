import { defineConfig } from 'vite';

// base './' keeps the build relocatable: GitHub Pages sub-folder today,
// Capacitor's file:// WebView later.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    // Phaser's SVG loader treats inline SVG data URLs as base64; keep every
    // art asset external so imports resolve to real SVG/PNG/JPG URLs.
    assetsInlineLimit: 0,
  },
});
