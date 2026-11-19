import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
    plugins: [viteSingleFile()],
    build: {
        target: 'esnext',
        outDir: 'dist',
        emptyOutDir: false,
        rolldownOptions: {
            input: process.env.MCP_APP_ENTRY ?? 'chart-app.html',
        },
    },
});
