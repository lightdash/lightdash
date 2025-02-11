import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { peerDependencies } from './package.json';

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
        outDir: 'dist',
        target: 'es2020',
        sourcemap: true,
        minify: false,

        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: '@lightdash/sdk',
            formats: ['es', 'cjs'],
            fileName: 'sdk',
        },
        rollupOptions: {
            external: [
                'react/jsx-runtime',
                'react-dom/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-dom/jsx-dev-runtime',
                'react',
                'react-dom',
                ...Object.keys(peerDependencies),
            ],
        },

        emptyOutDir: false,
    },
});
