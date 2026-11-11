import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Normal build: React app for the Express / Vercel-function backend.
// `--mode single`: everything (game logic, fonts, styles) inlined into ONE
// index.html that runs with no server — see src/local/localBackend.js.
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    plugins: single ? [react(), viteSingleFile()] : [react()],
    server: {
      proxy: { '/api': 'http://localhost:3001' },
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
    },
  };
});
