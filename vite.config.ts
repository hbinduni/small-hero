import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8080' } },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/phaser/') ? 'phaser' : undefined),
      },
    },
    chunkSizeWarningLimit: 1700,
  },
});
