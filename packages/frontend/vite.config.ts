import { sentryVitePlugin } from '@sentry/vite-plugin';
import reactPlugin from '@vitejs/plugin-react';
import * as path from 'path';
import { compression } from 'vite-plugin-compression2';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

const FE_PORT = process.env.FE_PORT ? parseInt(process.env.FE_PORT) : 3000;
const BE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

export default defineConfig({
    publicDir: 'public',
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        REACT_SCAN_ENABLED: process.env.REACT_SCAN_ENABLED ?? true,
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
                // Rolldown-specific chunking (types not yet available)
                // @ts-expect-error advancedChunks is a Rolldown feature
                advancedChunks: {
                    groups: [
                        {
                            name: 'react',
                            test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-hook-form|react-use|@hello-pangea[\\/]dnd|@tanstack[\\/]react-query|@tanstack[\\/]react-table|@tanstack[\\/]react-virtual)[\\/]/,
                        },
                        {
                            name: 'echarts',
                            test: /[\\/]node_modules[\\/]echarts/,
                        },
                        {
                            name: 'ace',
                            test: /[\\/]node_modules[\\/](ace-builds|react-ace)[\\/]/,
                        },
                        {
                            name: 'modules',
                            test: /[\\/]node_modules[\\/](jspdf|lodash|colorjs\.io|zod)[\\/]/,
                        },
                        {
                            name: 'thirdparty',
                            test: /[\\/]node_modules[\\/](@sentry[\\/]react|rudder-sdk-js|posthog-js)[\\/]/,
                        },
                        {
                            name: 'uiw',
                            test: /[\\/]node_modules[\\/]@uiw[\\/](react-markdown-preview|react-md-editor)[\\/]/,
                        },
                        {
                            name: 'mantine',
                            test: /[\\/]node_modules[\\/]@mantine[\\/](core|dates|form|hooks|notifications|prism)[\\/]/,
                        },
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
