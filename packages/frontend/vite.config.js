import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';
import svgrPlugin from 'vite-plugin-svgr';

// https://vitejs.dev/config/
export default defineConfig({
    // This changes the out put dir from dist to build
    // comment this out if that isn't relevant for your project
    build: {
        outDir: 'build',
    },
    resolve: {
        alias: {
            '@lightdash/common': '@lightdash/common/src',
        },
    },
    server: {
        hmr: {
            overlay: true,
        },
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    vite: {
        clearScreen: false,
    },
    plugins: [
        react(),
        eslint({
            failOnError: false,
            failOnWarning: false,
        }),
        svgrPlugin({
            svgrOptions: {
                icon: true,
                // ...svgr options (https://react-svgr.com/docs/options/)
            },
        }),
    ],
});
