import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
function getVersion(): string {
  if (process.env.VERSION) return process.env.VERSION;
  try {
    const rootPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return rootPkg.version || '1.1.0';
  } catch {
    return '1.1.0';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react';
          if (id.includes('node_modules/react-router')) return 'router';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // listen on all interfaces so phone on same WiFi can reach
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
