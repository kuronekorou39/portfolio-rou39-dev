import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    // amazon-cognito-identity-js が global を参照するため必須
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'https://notes.rou39.com',
        changeOrigin: true,
      },
    },
  },
});
