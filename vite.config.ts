import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' + HashRouter: the build works from any folder or static host.
export default defineConfig({
  base: './',
  // In development the API (server/index.ts) runs on 3001; Vite forwards /api to it.
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Atril',
        short_name: 'Atril',
        description: 'Tu biblioteca de EPUB, con convertidor de PDF.',
        lang: 'es',
        start_url: '.',
        display: 'standalone',
        background_color: '#F7F2EA',
        theme_color: '#F7F2EA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png}'],
        // pdf.js's worker weighs about 1 MB; it has to be cached to convert offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
