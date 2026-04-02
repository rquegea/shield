import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shieldai/detectors': path.resolve(__dirname, '../../packages/detectors/src/index.ts'),
    },
  },
})
