import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Icon generation (run once when public/icon.svg changes, then commit the PNGs):
//   npm run icons
// The icon is full-bleed with the artwork inside the maskable safe zone, so no extra padding.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#2b3440' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#2b3440' } },
  },
  images: ['public/icon.svg'],
});
