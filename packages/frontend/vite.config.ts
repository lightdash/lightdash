import reactPlugin from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

const ReactCompilerConfig = {
    target: '19',
};

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [
        tsconfigPaths(),
        svgrPlugin(),
        reactPlugin({
            babel: {
                plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
            },
        }),
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
                        'react-router',
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
    // @ts-expect-error this is correct
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
            '/slack/events': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    clearScreen: false,
});
