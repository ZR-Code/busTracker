/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  return {
    envDir: root,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: false } },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: false } },
    },
    build: {
      rollupOptions: {
        output: { manualChunks: { leaflet: ['leaflet', 'react-leaflet'], react: ['react', 'react-dom', 'react-router-dom'] } },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
