import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CalcInk',
        short_name: 'CalcInk',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: {
        // cache everything the app needs, including the models and the WASM runtime
        globPatterns: ['**/*.{js,css,html,wasm,onnx,mjs,json,png,svg}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024, // the ORT .wasm is ~10 MB
        navigateFallback: null,
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    rollupOptions: { input: { main: 'index.html', debug: 'debug.html' } }, // add your friend's index.html here later
  },
  server: { port: 3000 },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});