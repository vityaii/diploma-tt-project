import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:7070'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/login': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/register': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/refresh': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/logout': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/tasks': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
