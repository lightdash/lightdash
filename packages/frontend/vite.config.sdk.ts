import { resolve } from 'path';
import type { Plugin } from 'vite';
import dts from 'vite-plugin-dts';
import svgrPlugin from 'vite-plugin-svgr';
import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'production';

/**
 * Inline Vite plugin that injects extracted CSS into the JS bundle at runtime.
 * This ensures SDK consumers get styles automatically without needing a separate
 * `import '@lightdash/sdk/sdk.css'` import.
 */
function cssInjectedByJsPlugin(): Plugin {
    return {
        name: 'lightdash-sdk-css-injected-by-js',
        apply: 'build',
        enforce: 'post',
        generateBundle(_options, bundle) {
            let cssCode = '';

            // Collect all CSS from generated assets
            for (const [key, chunk] of Object.entries(bundle)) {
                if (key.endsWith('.css') && chunk.type === 'asset') {
                    cssCode += chunk.source;
                }
            }

            if (!cssCode) return;

            // Inject CSS into each JS entry chunk
            for (const chunk of Object.values(bundle)) {
                if (chunk.type === 'chunk' && chunk.isEntry) {
                    const escapedCss = JSON.stringify(cssCode);
                    const injection = [
                        `(function() {`,
                        `  try {`,
                        `    if (typeof document !== 'undefined') {`,
                        `      var s = document.createElement('style');`,
                        `      s.setAttribute('data-lightdash-sdk', '');`,
                        `      s.appendChild(document.createTextNode(${escapedCss}));`,
                        `      document.head.appendChild(s);`,
                        `    }`,
                        `  } catch(e) {`,
                        `    console.error('Failed to inject Lightdash SDK styles', e);`,
                        `  }`,
                        `})();`,
                    ].join('\n');
                    chunk.code = injection + '\n' + chunk.code;
                }
            }
        },
    };
}

export default defineConfig({
    mode: 'production',
    publicDir: false,
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [svgrPlugin(), dts({ rollupTypes: true }), cssInjectedByJsPlugin()],
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
            },
        },
    },
});
