import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'production';

export default defineConfig({
    mode: 'production',
    publicDir: false,
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [svgrPlugin(), dts({ rollupTypes: true })],
    build: {
        outDir: 'sdk/dist',
        emptyOutDir: true,
        target: 'es2020',
        // minify: 'esbuild',
        sourcemap: true,
        // Disable CSS code splitting to bundle all CSS into a single file
        cssCodeSplit: false,
        lib: {
            entry: resolve(__dirname, 'sdk', 'index.tsx'),
            name: 'LightdashSDK',
            formats: ['es', 'cjs'],
            fileName: (ext) => `sdk.${ext}.js`,
            cssFileName: 'sdk',
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
                assetFileNames: (assetInfo) => {
                    // Ensure CSS is named consistently
                    if (assetInfo.name === 'style.css') return 'sdk.css';
                    return assetInfo.name || '';
                },
            },
        },
    },
    css: {
        // Ensure CSS from node_modules is processed
        postcss: {},
    },
});
