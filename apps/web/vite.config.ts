import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Manifest colours mirror design-system tokens (--color-primary / --color-background);
// a web manifest cannot reference CSS variables.
const THEME_COLOR = '#1E3A5F';
const BACKGROUND_COLOR = '#F8FAFC';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // External registerSW.js keeps the CSP free of inline scripts.
      injectRegister: 'script-defer',
      manifest: {
        name: 'Etkinlik Platformu',
        short_name: 'Etkinlik',
        description: 'Üniversite etkinliklerini oylayın, başvurun ve katılın.',
        lang: 'tr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Only version-stamped build output is precached ("cache first").
        globPatterns: ['assets/**/*.{js,css,woff2}', 'icons/*.{png,svg}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The app shell always tries the network first.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'shell', networkTimeoutSeconds: 3 },
          },
          {
            // Votes, applications, attendance and profile data are never cached.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  server: {
    proxy: {
      // Local dev without Caddy: same-origin /api proxied to the API.
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
