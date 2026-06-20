import { defineConfig } from 'vite';

// The game is served from the `/play/` sub-path in production (the marketing
// site lives at the domain root, the game launcher at ilcartigo.com/play/).
// `base` rewrites asset URLs to that prefix so the bundle resolves correctly
// under /play/. In dev we keep `/` so the Vite server serves at the root.
//   - Production build:  vite build           → base '/play/'
//   - Root build (e.g. standalone host): BASE=/ npm run build
const base = process.env.BASE ?? (process.env.NODE_ENV === 'production' ? '/play/' : '/');

export default defineConfig({
  base,
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
