import { sentryVitePlugin } from '@sentry/vite-plugin';
import reactPlugin from '@vitejs/plugin-react';
import * as path from 'path';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

const FE_PORT = process.env.FE_PORT ? parseInt(process.env.FE_PORT) : 3000;
const BE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

import { startServer } from '@react-grab/claude-code/server';

if (
    process.env.REACT_GRAB_ENABLED === 'true' &&
    process.env.NODE_ENV === 'development'
) {
    startServer().catch((e) => {
        console.error('[Claude Code Server] Failed to start:', e);
    });
}

export default defineConfig({
    publicDir: 'public',
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        REACT_SCAN_ENABLED: process.env.REACT_SCAN_ENABLED ?? false,
        REACT_GRAB_ENABLED: process.env.REACT_GRAB_ENABLED ?? false,
        REACT_QUERY_DEVTOOLS_ENABLED:
            process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? true,
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
            telemetry: false,
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
    ],
    optimizeDeps: {
        exclude: ['@lightdash/common'],
    },
    resolve: {
        alias:
            process.env.NODE_ENV === 'development'
                ? {
                      '@lightdash/common/src': path.resolve(
                          __dirname,
                          '../common/src',
                      ),
                      '@lightdash/common': path.resolve(
                          __dirname,
                          '../common/src/index.ts',
                      ),
                  }
                : undefined,
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
                        // TODO: removed because of PNPM
                        // 'react-draggable',
                        '@hello-pangea/dnd',
                        '@tanstack/react-query',
                        '@tanstack/react-table',
                        '@tanstack/react-virtual',
                    ],
                    echarts: ['echarts'],
                    ace: ['ace-builds', 'react-ace/lib'],
                    modules: [
                        // TODO: removed because of PNPM
                        // 'ajv',
                        // 'ajv-formats',
                        // 'liquidjs',
                        // 'pegjs',
                        'jspdf',
                        'lodash',
                        'colorjs.io',
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
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/testing/vitest.setup.ts',
        env: {
            VITE_REACT_SCAN_ENABLED: 'false',
            VITE_REACT_QUERY_DEVTOOLS_ENABLED: 'false',
            VITE_REACT_GRAB_ENABLED: 'false',
        },
    },
    server: {
        port: FE_PORT,
        host: true,
        hmr: {
            overlay: true,
        },
        allowedHosts: [
            'lightdash-dev', // for local development with docker
            '.lightdash.dev', // for cloudflared tunnels
        ],
        watch: {
            ignored: ['!**/node_modules/@lightdash/common/**'],
        },
        proxy: {
            '/api': {
                target: `http://localhost:${BE_PORT}`,
                changeOrigin: true,
            },
            '/.well-known': {
                // MCP inspector requires .well-known to be on the root, but according to RFC 9728 (OAuth 2.0 Protected Resource Metadata) the .well-known endpoint is not required to be at the root level.
                target: `http://localhost:${BE_PORT}/api/v1/oauth`,
                changeOrigin: true,
            },
            '/slack/events': {
                target: `http://localhost:${BE_PORT}`,
                changeOrigin: true,
            },
        },
    },
    clearScreen: false,
});
