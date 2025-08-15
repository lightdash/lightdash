import { sentryVitePlugin } from '@sentry/vite-plugin';
import reactPlugin from '@vitejs/plugin-react';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

// @ts-expect-error - Vitest is not typed correctly
export default defineConfig(async () => {
    const { default: spotlight } = await import('@spotlightjs/spotlight/vite-plugin');
    const { default: spotlightSidecar } = await import('@spotlightjs/sidecar/vite-plugin');

    return {
        publicDir: 'public',
        define: {
            __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        },
        plugins: [
            svgrPlugin(),
            reactPlugin(),
            compression({
                include: [/\.(js)$/, /\.(css)$/],
                filename: '[path][base].gzip',
            }),
            monacoEditorPlugin({
                forceBuildCDN: true,
                languageWorkers: ['json'],
            }),
            sentryVitePlugin({
                org: 'lightdash',
                project: 'lightdash-frontend',
                authToken: process.env.SENTRY_AUTH_TOKEN,
                release: {
                    name: process.env.SENTRY_RELEASE_VERSION,
                    inject: true,
                },
                // Sourcemaps are already uploaded by the Sentry CLI
                sourcemaps: {
                    disable: true,
                },
            }),
            ...(process.env.SENTRY_SPOTLIGHT === '1' && process.env.NODE_ENV === 'development'
                ? [spotlight(), spotlightSidecar()]
                : []),
        ],
        css: {
            transformer: 'lightningcss',
        },
        optimizeDeps: {
            exclude: ['@lightdash/common'],
        },
        build: {
            outDir: 'build',
            emptyOutDir: false,
            target: 'es2020',
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
                            // 'react-draggable',
                            '@hello-pangea/dnd',
                            '@tanstack/react-query',
                            '@tanstack/react-table',
                            '@tanstack/react-virtual',
                        ],
                        echarts: ['echarts'],
                        ace: ['ace-builds', 'react-ace/lib'],
                        modules: [
                            // 'ajv',
                            // 'ajv-formats',
                            // 'liquidjs',
                            // 'pegjs',
                            'jspdf',
                            'lodash',
                            'colorjs.io',
                            'zod',
                        ],
                        thirdparty: ['@sentry/react', 'rudder-sdk-js', 'posthog-js'],
                        uiw: ['@uiw/react-markdown-preview', '@uiw/react-md-editor'],
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
            // For docker, cloudflared tunnels, and your ngrok host
            allowedHosts: [
                'lightdash-dev',
                '.lightdash.dev',
                'solucia-analytics-backend.ngrok.app',
            ],
            watch: {
                ignored: ['!**/node_modules/@lightdash/common/**'],
            },
            proxy: {
                '/api': {
                    target: 'http://localhost:8080',
                    changeOrigin: true,
                },
                '/.well-known': {
                    // MCP inspector requires .well-known at root; we forward to backend OAuth metadata
                    target: 'http://localhost:8080/api/v1/oauth',
                    changeOrigin: true,
                },
                '/slack/events': {
                    target: 'http://localhost:8080',
                    changeOrigin: true,
                },
            },
        },
        clearScreen: false,
    };
});
