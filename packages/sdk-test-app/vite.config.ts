import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3030,
        host: true,
    },
    resolve: {
        alias: {
            '@lightdash/sdk/sdk.css': resolve(__dirname, '../frontend/sdk/dist/sdk.css'),
            '@lightdash/sdk': resolve(__dirname, '../frontend/sdk/index.tsx'),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        REACT_SCAN_ENABLED: process.env.REACT_SCAN_ENABLED ?? false,
        REACT_QUERY_DEVTOOLS_ENABLED:
            process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? false,
    }
});
