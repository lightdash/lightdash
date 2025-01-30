import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [react(), dts()],

    build: {
        lib: {
            entry: 'src/index.tsx',
            name: 'LightdashSdk',
            formats: ['es', 'umd'],
            fileName: 'index',
        },
        outDir: 'dist',
    },
});
