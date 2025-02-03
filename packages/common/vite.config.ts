import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        dts({
            tsconfigPath: './tsconfig.json',
            rollupTypes: true,
        }),
    ],

    build: {
        outDir: 'dist',
        target: 'es2020',
        sourcemap: true,
        minify: false,

        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'LightdashCommon',
            formats: ['es', 'cjs'],
            fileName: 'index',
        },

        emptyOutDir: false,
    },
});
