import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    plugins: [viteSingleFile()],
    build: {
        target: 'esnext',
        outDir: 'dist',
        rolldownOptions: {
            input: 'chart-app.html',
        },
    },
});
