import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        // Phase A: デプロイ後に UranekoApi の prod URL に差し替える
        target: 'https://uraneko.rou39.com',
        changeOrigin: true,
      },
    },
  },
});
