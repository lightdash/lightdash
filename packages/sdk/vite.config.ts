import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        react(),
        dts({
            tsconfigPath: './tsconfig.json',
            rollupTypes: true,
        }),
    ],

    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.tsx'),
            name: 'LightdashSdk',
            formats: ['es', 'cjs'],
            fileName: 'sdk',
        },
        outDir: 'dist',
    },
});
