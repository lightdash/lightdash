import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    plugins: [react()],
    resolve: {
        alias: {
            '@lightdash/query-sdk': path.resolve(__dirname, '../src'),
            // Force a single React instance — the SDK source alias can cause
            // Vite to resolve a second copy from the SDK's node_modules.
            react: path.resolve(__dirname, 'node_modules/react'),
            'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
