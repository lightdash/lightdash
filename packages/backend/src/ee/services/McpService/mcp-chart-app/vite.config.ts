import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    plugins: [viteSingleFile()],
    resolve: {
        alias: {
            '@lightdash/common': path.resolve(
                __dirname,
                '../../../../../../common/src',
            ),
        },
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
        rollupOptions: {
            input: 'chart-app.html',
        },
    },
});
