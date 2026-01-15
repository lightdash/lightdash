import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const useHttps = process.env.HTTPS === 'true' || process.env.HTTPS === '1';
const httpsConfig =
    useHttps && process.env.SSL_CRT_FILE && process.env.SSL_KEY_FILE
        ? {
              key: fs.readFileSync(process.env.SSL_KEY_FILE),
              cert: fs.readFileSync(process.env.SSL_CRT_FILE),
          }
        : useHttps
          ? true
          : undefined;

const allowedHosts =
    process.env.ALLOWED_HOSTS?.split(',').map((v) => v.trim()).filter(Boolean) ||
    true; // 默认允许全部，避免 ngrok 域名被拦截

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3500,
        host: true,
        allowedHosts,
        https: httpsConfig,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    preview: {
        port: 3500,
        host: true,
        allowedHosts,
        https: httpsConfig,
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
