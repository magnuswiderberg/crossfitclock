import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
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
