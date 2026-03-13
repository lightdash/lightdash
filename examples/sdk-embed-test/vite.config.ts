import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@lightdash/sdk': resolve(
                __dirname,
                '../../packages/frontend/sdk/dist/sdk.es.js',
            ),
        },
    },
    server: {
        port: 3030,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
});
