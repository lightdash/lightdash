import { readFileSync } from 'fs';
import { resolve } from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import dts from 'vite-plugin-dts';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'production';

const sdkPackageJson = JSON.parse(
    readFileSync(resolve(__dirname, 'sdk', 'package.json'), 'utf-8'),
);

export default defineConfig({
    mode: 'production',
    publicDir: false,
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
        __SDK_VERSION__: JSON.stringify(sdkPackageJson.version),
    },
    plugins: [
        svgrPlugin(),
        dts({ rollupTypes: true }),
        cssInjectedByJsPlugin(),
    ],
    build: {
        outDir: 'sdk/dist',
        emptyOutDir: true,
        target: 'es2020',
        // minify: 'esbuild',
        sourcemap: true,
        lib: {
            entry: resolve(__dirname, 'sdk', 'index.tsx'),
            name: 'LightdashSDK',
            formats: ['es', 'cjs'],
            fileName: (ext) => `sdk.${ext}.js`,
            cssFileName: 'sdk',
        },
        rolldownOptions: {
            external: [
                'react',
                'react-dom',
                'react-dom/server',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
            ],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                },
                codeSplitting: false,
            },
        },
    },
});
