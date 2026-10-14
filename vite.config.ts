/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4500' },
    fs: { deny: ['.env', '.env.*', '*.local', '**/data/**', '**/.git/**'] },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], testTimeout: 15_000 },
})
