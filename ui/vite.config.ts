import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// Midnight runtimes ship WASM loaded through top-level await. Targeting esnext supports that natively,
// so no top-level-await transform is needed (vite-plugin-top-level-await 1.6 also breaks on @swc/core 1.16).
export default defineConfig({
  cacheDir: './.vite',
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
    commonjsOptions: { transformMixedEsModules: true },
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    // Pre-bundle compact-runtime but serve its WASM runtime as-is. bunfig.toml keeps packages hoisted
    // so the pre-bundled chunk can resolve onchain-runtime-v3.
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  server: { port: 3000 },
});
