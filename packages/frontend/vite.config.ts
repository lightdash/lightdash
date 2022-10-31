import reactPlugin from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';
import svgrPlugin from 'vite-plugin-svgr';
import tsconfigPathsPlugin from 'vite-tsconfig-paths';

const mapManualChunks = (mapping: Record<string, string>) => (id: string) => {
    for (const [match, chunk] of Object.entries(mapping)) {
        if (id.includes(match)) {
            return chunk;
        }
    }
};

export default defineConfig({
    plugins: [
        reactPlugin(),
        svgrPlugin(),
        tsconfigPathsPlugin(),
        {
            // do not fail on serve (i.e. local development)
            ...eslintPlugin({
                failOnWarning: false,
                failOnError: false,
            }),
            apply: 'serve',
            enforce: 'post',
        },
    ],
    // css: {
    //     devSourcemap: true,
    // },
    build: {
        outDir: 'build',
        // sourcemap: true,
        target: 'es2015',
        minify: true,
        rollupOptions: {
            output: {
                manualChunks: mapManualChunks({
                    '@blueprintjs/icons': 'blueprint-icons-vendor',
                    '@blueprintjs/': 'blueprint-vendor',
                    'highlight.js': 'highlight-vendor',
                    echarts: 'echarts-vendor',
                    '@mapbox/': 'mapbox-vendor',
                    rudder: 'rudder-vendor',
                    sentry: 'sentry-vendor',
                }),
            },
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
