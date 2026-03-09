import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from the monorepo root (insight/) instead of frontend/
  const env = loadEnv(mode, '../', '')

  return {
    plugins: [react()],
    // Tell Vite to read .env files from insight/ (one level up)
    envDir: '../',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8001',
          changeOrigin: true,
        },
      },
    },
  }
})
