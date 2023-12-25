import reactPlugin from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        svgrPlugin(),
        reactPlugin(),
        compression({
            include: [/\.(js)$/, /\.(css)$/, /\.js\.map$/],
            filename: '[path][base].gzip',
        }),
        monacoEditorPlugin({
            forceBuildCDN: true,
            languageWorkers: ['json'],
        }),
    ],
    css: {
        transformer: 'lightningcss',
    },
    build: {
        outDir: 'build',
        target: 'es2015',
        minify: true,
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: [
                        'react',
                        'react-dom',
                        'react-router-dom',
                        'react-hook-form',
                        'react-use',
                        'react-beautiful-dnd',
                        'react-draggable',
                        '@tanstack/react-query',
                        '@tanstack/react-table',
                        '@tanstack/react-virtual',
                    ],
                    echarts: ['echarts'],
                    vega: ['vega', 'vega-lite'],
                    ace: ['ace-builds', 'react-ace/lib'],
                    modules: [
                        'moment/moment.js',
                        'moment/dist/moment.js',
                        'pegjs',
                        'jspdf',
                        'ajv',
                        'ajv-formats',
                        'lodash',
                        'colorjs.io',
                        'liquidjs',
                        'zod',
                    ],
                    thirdparty: [
                        '@sentry/react',
                        '@sentry/tracing',
                        'rudder-sdk-js',
                        'posthog-js',
                    ],
                    uiw: [
                        '@uiw/copy-to-clipboard',
                        '@uiw/react-markdown-preview',
                        '@uiw/react-md-editor',
                    ],
                    mantine: [
                        '@mantine/core',
                        '@mantine/dates',
                        '@mantine/form',
                        '@mantine/hooks',
                        '@mantine/notifications',
                        '@mantine/prism',
                        '@mantine/spotlight',
                    ],
                },
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
