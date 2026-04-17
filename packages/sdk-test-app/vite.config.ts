import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const sdkPackageJson = JSON.parse(
    readFileSync(resolve(__dirname, '../frontend/sdk/package.json'), 'utf-8'),
);

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        exclude: ['@lightdash/common', '@lightdash/common/src'],
    },
    server: {
        port: 3002,
        host: true,
    },
    resolve: {
        alias: [
            {
                find: '@lightdash/common/src',
                replacement: resolve(__dirname, '../common/src'),
            },
            {
                find: '@lightdash/common',
                replacement: resolve(__dirname, '../common/src/index.ts'),
            },
            {
                find: '@lightdash/formula',
                replacement: resolve(__dirname, '../formula/src/index.ts'),
            },
            {
                find: '@lightdash/sdk/sdk.css',
                replacement: resolve(__dirname, '../frontend/sdk/dist/sdk.css'),
            },
            {
                find: '@lightdash/sdk',
                replacement: resolve(__dirname, '../frontend/sdk/index.tsx'),
            },
        ],
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        __SDK_VERSION__: JSON.stringify(sdkPackageJson.version),
        REACT_QUERY_DEVTOOLS_ENABLED:
            process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? false,
    },
});
