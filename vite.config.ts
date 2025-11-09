import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ArcRaidersLootList/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'search': ['fuse.js']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
