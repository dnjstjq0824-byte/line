import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Local UI work: `LUNO_DEV_API=http://127.0.0.1:8911 npx vite --port 5180`
// serves the web with hot reload and forwards API and WebSocket calls to a
// local `wrangler dev`, so cookies stay same-origin. Unset in normal builds.
const devApi = process.env.LUNO_DEV_API
const forward = { target: devApi, changeOrigin: true }

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: devApi
    ? {
        proxy: {
          '/api': { ...forward, ws: true },
          '/ws': { ...forward, ws: true },
          '/healthz': forward,
          '/download': forward,
        },
      }
    : undefined,
})
