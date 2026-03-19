import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ['exifr', 'leaflet', 'react-leaflet'],
  },
  build: {
    // Raise warning limit — MapLibre GL is large by nature (~1MB minified)
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // MapLibre GL (the heaviest dependency ~1MB) — load separately
          if (id.includes('maplibre-gl') || id.includes('maplibre-gl-leaflet')) {
            return 'vendor-maplibre'
          }
          // Leaflet + clustering
          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'vendor-leaflet'
          }
          // EXIF parser
          if (id.includes('exifr')) {
            return 'vendor-exif'
          }
          // All other node_modules → vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
  },
})
