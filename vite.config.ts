import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    /**
     * Do not copy `public/` into `dist/`.
     *
     * It is 133 MB of box art and audio, so copying doubles the build — but the
     * real problem is staleness: covers downloaded *after* the build land in
     * `public/` and a copy in `dist/` would never see them, so the preview
     * would show gaps that the render did not have. The packaged server serves
     * `public/` directly instead, which is always current.
     */
    copyPublicDir: false,
  },
  server: {
    port: 5173,
    // The prefetch writes to public/boxart, so it runs in the Express service.
    // Proxying keeps the UI on one origin and avoids a CORS config.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
