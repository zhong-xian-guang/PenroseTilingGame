import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt' without ever prompting: a new version installs in the background and waits; it takes over
      // only once every window of the app is closed, so a running game is never reloaded underneath the player.
      // The next launch then runs the new version.
      registerType: 'prompt',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Penrose Tiling',
        short_name: 'Penrose',
        description: 'A tile-laying game built on the kites and darts of the Penrose tiling.',
        lang: 'zh-Hant',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        theme_color: '#2b3440',
        background_color: '#f6f4ef',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell plus the subset fonts (src/fonts/*.woff2, emitted by Vite into assets/).
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
