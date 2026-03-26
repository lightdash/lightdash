import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');

    return {
        plugins: [react()],
        base: './',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            proxy: {
                '/api': {
                    target:
                        env.VITE_LIGHTDASH_URL || 'https://app.lightdash.cloud',
                    changeOrigin: true,
                    secure: true,
                },
            },
        },
    };
});
