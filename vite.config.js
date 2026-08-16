import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Conservative target: keeps output runnable (and avoids relying on
    // very-recent JIT-optimized syntax) across the range of Chromium
    // versions embedded in LG webOS sets from the last several years.
    target: 'es2018',
  },
})
