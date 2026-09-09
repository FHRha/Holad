import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const appVersion = process.env.RELEASE_VERSION 
  ? process.env.RELEASE_VERSION.replace(/^v/i, '')
  : (process.env.npm_package_version || pkg.version || '0.0.0');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
