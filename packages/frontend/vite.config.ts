import reactPlugin from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compression } from 'vite-plugin-compression2';
import dts from 'vite-plugin-dts';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import svgrPlugin from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const dirnamePath = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
    const isLib = mode === 'lib';

    return {
        publicDir: isLib ? false : 'public',
        define: {
            __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        },
        plugins: [
            tsconfigPaths(),
            svgrPlugin(),
            reactPlugin(),
            compression({
                include: [/\.(js)$/, /\.(css)$/, /\.js\.map$/],
                filename: '[path][base].gzip',
            }),

            ...(isLib
                ? [
                      dts({
                          rollupTypes: true,
                      }),
                  ]
                : [
                      monacoEditorPlugin({
                          forceBuildCDN: true,
                          languageWorkers: ['json'],
                      }),
                  ]),
        ],
        css: {
            transformer: 'lightningcss',
        },
        build: {
            outDir: isLib ? 'dist' : 'build',
            target: 'es2020',
            minify: true,
            sourcemap: true,
            ...(isLib
                ? {
                      lib: {
                          entry: resolve(dirnamePath, 'src/sdk/index.tsx'),
                          name: '@lightdash/frontend',
                          formats: ['es', 'cjs'],
                          fileName: 'frontend',
                      },
                      rollupOptions: {
                          external: [
                              'react/jsx-runtime',
                              'react-dom/jsx-runtime',
                              'react/jsx-dev-runtime',
                              'react-dom/jsx-dev-runtime',
                              'react',
                              'react-dom',
                          ],
                      },
                  }
                : {
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
                                  vega: ['vega', 'vega-lite'],
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
                  }),
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
                '/slack/events': {
                    target: 'http://localhost:8080',
                    changeOrigin: true,
                },
            },
        },
        clearScreen: false,
    };
});
