import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: "Beauty's Me",
        short_name: "Beauty's Me",
        description: 'Catálogo, apartados y ventas · Beauty\'s Me',
        theme_color: '#e6007e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,svg,ico,woff,woff2}'],
        // Sube el límite del precache: el bundle principal pasa los 2 MiB
        // por defecto desde que agregamos jsPDF + html2canvas. Lo dejamos
        // en 5 MiB para tener holgura sin reventar el build.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // No cachear el index.html: siempre que se navegue,
        // pedirlo a la red para que entren las versiones nuevas.
        navigateFallback: null,
        // El nuevo SW toma control inmediato y borra caches viejos
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Runtime caching: imágenes de Supabase (catálogo, comprobantes,
        // historias, deseos) se sirven desde cache después del primer
        // load. Eso hace que el grid de la tienda y los apartados se
        // vean instantáneo al regresar.
        runtimeCaching: [
          {
            // Bucket de imágenes de Supabase. Cubre AMBOS endpoints:
            //   /storage/v1/object/public/...   (URL raw)
            //   /storage/v1/render/image/public/... (con transform)
            // Las variantes de producto son inmutables (SKU = UUID),
            // así que CacheFirst por 30 días.
            urlPattern: ({ url }) =>
              /\.supabase\.co\/storage\/v1\/(object|render\/image)\/public\//i.test(
                url.href,
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mari-supabase-images',
              expiration: {
                maxEntries: 800,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Catálogo público (lectura de productos): SWR con TTL corto.
            // La pantalla pinta instantáneo desde cache y revalida en bg.
            // No incluye productos individuales con stock crítico — esos
            // los pide la app con el cliente Supabase directo.
            urlPattern: ({ url }) =>
              /\.supabase\.co\/rest\/v1\/(products|variants)\?/i.test(url.href),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mari-supabase-catalog',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 15,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Avatares públicos (OpenStreetMap, gravatar, etc.) — net first
            urlPattern: ({ url }) =>
              /openstreetmap\.org|gravatar\.com|googleusercontent\.com/i.test(url.host),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mari-third-party-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Code-splitting de vendors pesados.
    //
    // IMPORTANTE: `recharts` y `html2canvas` y `jspdf` y `html5-qrcode`
    // ya viajan en chunks dedicados gracias a dynamic imports (lazy() +
    // import() dentro de la app), así que NO los listamos acá. Si los
    // forzáramos aquí entraríamos en conflicto con el chunking automático
    // de Rollup para los dynamic imports y rompería el build.
    //
    // Sólo agrupamos los vendors que se importan SIEMPRE estáticamente
    // (React, lucide, supabase, framer-motion, etc.), para que vivan en
    // chunks separados y se cacheen aparte del código de la app.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
          'vendor-fuse': ['fuse.js'],
          'vendor-confetti': ['canvas-confetti'],
        },
      },
    },
    sourcemap: false,
    // Threshold del warning de chunks gigantes — informativo.
    chunkSizeWarningLimit: 800,
  },
})