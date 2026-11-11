import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Express server hosts Vite in middleware mode (one port).
// The proxy below is only used if you run `vite` on its own.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
