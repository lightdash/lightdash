import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

process.env.NODE_ENV = 'production';

export default defineConfig({
    mode: 'production',
    publicDir: false,
    plugins: [dts({ rollupTypes: true })],
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
            fileName: (ext) => `index.${ext}.js`,
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
