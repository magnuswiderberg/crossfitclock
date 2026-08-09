import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The public origin, substituted for `%SITE_URL%` in the static pages. Canonical
 * and Open Graph tags have to be absolute, and scrapers don't run JS, so this is
 * the one place a domain move needs editing (or `SITE_URL=… npm run build`).
 * The current host is a placeholder — a better domain is still to be found.
 */
const SITE_URL = (process.env.SITE_URL ?? 'https://workout.magnuswiderberg.se').replace(/\/+$/, '')

function siteUrl(): Plugin {
  return {
    name: 'crossfitclock:site-url',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
    },
  }
}

/**
 * The two rewrites Azure Static Web Apps performs in production (see
 * `public/staticwebapp.config.json`), taught to the dev and preview servers so
 * a URL can't work locally and 404 only once deployed: `/c/<CODE>` is one
 * static page serving every code, and `/app` without the trailing slash is the
 * form people actually type.
 */
const staticRoutes: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url) {
    if (/^\/c\/[^/?#]+/.test(req.url)) req.url = '/c/index.html'
    else if (/^\/app($|[?#])/.test(req.url)) req.url = '/app/index.html'
  }
  next()
}

function serveLikeAzure(): Plugin {
  return {
    name: 'crossfitclock:serve-like-azure',
    configureServer: (server) => void server.middlewares.use(staticRoutes),
    configurePreviewServer: (server) => void server.middlewares.use(staticRoutes),
  }
}

export default defineConfig({
  // In dev the Functions host serves /api (npm run api). In production Azure
  // Static Web Apps routes /api to the managed functions on the same origin.
  server: {
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  build: {
    rollupOptions: {
      // Three pages: the marketing landing page at /, one shared workout at
      // /c/<CODE>, and the app itself at /app. Only the last one is React —
      // the other two exist to be crawlable and to paint instantly, which a
      // screen inside the app bundle could never be.
      input: {
        landing: page('index.html'),
        code: page('c/index.html'),
        app: page('app/index.html'),
      },
    },
  },
  plugins: [
    react(),
    siteUrl(),
    serveLikeAzure(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // `src/main.tsx` registers the worker itself. Left on 'auto' the plugin
      // would also inject a registration into the two static pages, which have
      // no business installing a service worker.
      injectRegister: null,
      // The announcement clips must be precached, not just cacheable: the
      // fixed vocabulary is the whole reason a preset can run offline without
      // touching /api/speech. Workbox's default pattern list has no mp3.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        // The social card is for scrapers, never for a phone in a gym.
        globIgnores: ['**/og-image.png'],
        // Once the worker is installed, the navigation fallback answers *every*
        // navigation from the cache — which would quietly serve the app in place
        // of the landing page from the second visit onwards. Both static pages
        // are precached under their own URLs, so they only need excluding here.
        navigateFallback: '/app/index.html',
        navigateFallbackDenylist: [/^\/$/, /^\/index\.html$/, /^\/c\//],
      },
      manifest: {
        // Identity, kept at '/' on purpose: the default id is start_url, so
        // moving start_url to /app/ would read as a different app to browsers
        // that already have this one installed.
        id: '/',
        name: 'CrossFit Clock',
        short_name: 'CFClock',
        description: 'Interval timer for Tabata and CrossFit sessions',
        // Launching from the home screen goes straight to the app; scope stays
        // at the root so the landing page can still offer to install it.
        start_url: '/app/',
        scope: '/',
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
