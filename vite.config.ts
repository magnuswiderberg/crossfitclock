import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // In dev the Functions host serves /api (npm run api). In production Azure
  // Static Web Apps routes /api to the managed functions on the same origin.
  server: {
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // The announcement clips must be precached, not just cacheable: the
      // fixed vocabulary is the whole reason a preset can run offline without
      // touching /api/speech. Workbox's default pattern list has no mp3.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
      },
      manifest: {
        name: 'CrossFit Clock',
        short_name: 'CFClock',
        description: 'Interval timer for Tabata and CrossFit sessions',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1012',
        theme_color: '#0f1012',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
