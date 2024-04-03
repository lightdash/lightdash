import reactPlugin from '@vitejs/plugin-react';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

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
        /**
         * Disable packaging the CSS styles for react-markdown-preview, in lieu of our own. This
         * allows us for more control over how it looks alongside our Mantine theme.
         *
         * This works by forcing .css imports for this package to be inlined (and immediately discarded).
         */
        {
            name: 'ignore-markdown-preview-css',
            enforce: 'pre',
            resolveId: (id) => {
                if (
                    id.includes('@uiw/react-markdown-preview') &&
                    id.endsWith('.css')
                ) {
                    return `${id}?inline`;
                }
            },
        },
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
                        'react-draggable',
                        '@hello-pangea/dnd',
                        '@tanstack/react-query',
                        '@tanstack/react-table',
                        '@tanstack/react-virtual',
                    ],
                    echarts: ['echarts'],
                    vega: ['vega', 'vega-lite'],
                    ace: ['ace-builds', 'react-ace/lib'],
                    modules: [
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
                    ],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/testing/vitest.setup.ts',
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
