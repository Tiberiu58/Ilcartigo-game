import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split three.js into its own chunk so app code can rebuild without
        // re-shipping the engine — better long-term caching for repeat players.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
