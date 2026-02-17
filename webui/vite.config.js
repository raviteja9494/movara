import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
var __dirname = dirname(fileURLToPath(import.meta.url));
function getVersion() {
    if (process.env.VERSION)
        return process.env.VERSION;
    try {
        var rootPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
        return rootPkg.version || '0.2.6';
    }
    catch (_a) {
        return '0.2.6';
    }
}
export default defineConfig({
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(getVersion()),
    },
    server: {
        port: 5173,
        host: '0.0.0.0',
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
