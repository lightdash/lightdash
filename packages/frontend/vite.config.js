// vite.config.js
import react from '@vitejs/plugin-react';
import { defineConfig, splitVendorChunkPlugin } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    // TODO:
    // configure ESLINT
    // configure browserlist
    // https://v2.vitejs.dev/guide/build.html#browser-compatibility
    //"browserslist": {
    //     "production": [
    //         ">0.2%",
    //         "not dead",
    //         "not op_mini all"
    //     ],
    //     "development": [
    //         "last 1 chrome version",
    //         "last 1 firefox version",
    //         "last 1 safari version"
    //     ]
    // },
    plugins: [react(), svgr(), tsconfigPaths(), splitVendorChunkPlugin()],
    css: {
        devSourcemap: true,
    },
    optimizeDeps: {
        exclude: ['lightdash/common'],
    },
    build: {
        outDir: 'build',
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
