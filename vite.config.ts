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
        name: 'Mari Inventario',
        short_name: 'Mari Inv',
        description: 'Sistema de inventario, ventas y precios para cosméticos',
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
})