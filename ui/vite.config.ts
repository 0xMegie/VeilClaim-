import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

// Midnight runtimes ship WASM with top-level await; mirrors midnightntwrk/midnight-leaderboard.
export default defineConfig({
  cacheDir: './.vite',
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    target: 'esnext',
    commonjsOptions: { transformMixedEsModules: true },
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  server: { port: 3000 },
});
