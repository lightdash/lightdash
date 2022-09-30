import react from '@vitejs/plugin-react';
import { defineConfig, splitVendorChunkPlugin } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    // TODO: add ESLINT plugin

    plugins: [react(), svgr(), tsconfigPaths(), splitVendorChunkPlugin()],
    css: {
        devSourcemap: true,
    },
    optimizeDeps: {
        exclude: ['lightdash/common'],
    },
    build: {
        outDir: 'build',
        sourcemap: true,
        commonjsOptions: {
            exclude: ['lightdash/common'],
        },
    },
    resolve: {
        alias: {
            '@lightdash/common': '@lightdash/common/src',
        },
    },
    server: {
        port: 3000,
        host: true,
        hmr: {
            overlay: true,
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    clearScreen: false,
});
