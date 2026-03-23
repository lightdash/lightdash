import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lightdash/query-sdk': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://analytics.lightdash.cloud',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
