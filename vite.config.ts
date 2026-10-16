import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Extension pages (popup, dashboard). The service worker and content scripts
// are built separately as self-contained bundles by scripts/build-content.mjs,
// so they never share a chunk with React (which needs a DOM).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
      },
    },
  },
  server: { open: '/dashboard.html' },
});
