import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works both at a domain root and under a
  // GitHub Pages project subpath (/chorequest/) without hardcoding the repo name.
  base: './',
  server: { port: 5199, host: true },
})
