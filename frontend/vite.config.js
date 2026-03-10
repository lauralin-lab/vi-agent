import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-livekit': ['livekit-client'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || `http://localhost:${process.env.API_PORT || 8000}`,
        changeOrigin: true,
      },
      '/nanoclaw': {
        target: process.env.VITE_NANOCLAW_URL || `http://localhost:${process.env.NANOCLAW_PORT || 3100}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nanoclaw/, ''),
      },
    },
  },
})
