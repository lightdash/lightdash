import { defineConfig } from 'vite';
import reactRefresh from '@vitejs/plugin-react-refresh';
import svgrPlugin from 'vite-plugin-svgr';

// https://vitejs.dev/config/
export default defineConfig({
    // This changes the out put dir from dist to build
    // comment this out if that isn't relevant for your project
    build: {
        outDir: 'build',
    },
    resolve: {
        alias: {
            '@lightdash/common': '@lightdash/common/src',
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
            },
        },
    },
    plugins: [
        reactRefresh(),
        svgrPlugin({
            svgrOptions: {
                icon: true,
                // ...svgr options (https://react-svgr.com/docs/options/)
            },
        }),
    ],
});
