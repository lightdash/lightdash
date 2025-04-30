import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

process.env.NODE_ENV = 'production';

export default defineConfig({
    mode: 'production',
    publicDir: false,
    logLevel: 'warn',
    plugins: [dts({ rollupTypes: true }), react()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2020',
        minify: true,
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, 'src', 'index.ts'),
            name: 'LightdashMantineV7',
            formats: ['es', 'cjs'],
            fileName: (ext, name) => {
                const cleanName = name.replace('node_modules/.pnpm/', '');
                return `${cleanName}.${ext}.js`;
            },
            cssFileName: 'style',
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
            ],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                },

                preserveModules: true,
                preserveModulesRoot: 'src',
            },
        },
    },
});
