import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_APP_BASE || '/Holad/',
  server: {
    port: 5173,
    proxy: {
      '/Holad/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/Holad/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
})
