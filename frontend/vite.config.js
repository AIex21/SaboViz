import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true, // Critical for Docker hot-reload to work reliably
    },
    host: true, // equivalent to 0.0.0.0
    strictPort: true,
    port: 5173, 
  }
})