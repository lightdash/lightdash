import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import svgr from 'vite-plugin-svgr';

const sdkPackageJson = JSON.parse(
    readFileSync(resolve(__dirname, '../frontend/sdk/package.json'), 'utf-8'),
);

// The SDK is aliased to its source, so its CSS must go through the same
// PostCSS pipeline the published bundle uses: the frontend's plugins
// (postcss-preset-mantine for rem(), light-dark(), ...) plus the SDK's
// document-rule scoping. Plugins are resolved from the frontend package.
const frontendRequire = createRequire(
    resolve(__dirname, '../frontend/package.json'),
);
const frontendPostcssConfig: {
    plugins: Record<string, Record<string, unknown>>;
} = frontendRequire('./postcss.config.cjs');
const { scopeDocumentRules } = frontendRequire('./sdk/styles/postcss.cjs');
const sdkPostcssPlugins = [
    ...Object.entries(frontendPostcssConfig.plugins).map(([name, options]) =>
        frontendRequire(name)(options),
    ),
    scopeDocumentRules,
];

const getLightdashProxyTarget = (embedUrl: string | undefined) => {
    if (!embedUrl) return undefined;

    try {
        const url = new URL(embedUrl);
        const embedSegmentIndex = url.pathname.indexOf('/embed');
        const instancePath =
            embedSegmentIndex >= 0
                ? url.pathname.slice(0, embedSegmentIndex)
                : url.pathname;

        return `${url.origin}${instancePath}`.replace(/\/$/, '');
    } catch {
        return undefined;
    }
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const lightdashProxyTarget =
        env.LIGHTDASH_PROXY_TARGET ??
        getLightdashProxyTarget(env.VITE_EMBED_URL);

    return {
        plugins: [react(), svgr()],
        css: { postcss: { plugins: sdkPostcssPlugins } },
        optimizeDeps: {
            exclude: ['@lightdash/common', '@lightdash/common/src'],
        },
        server: {
            port: 3002,
            host: true,
            proxy: lightdashProxyTarget
                ? {
                      '/sdk-test-app-api/lightdash': {
                          target: lightdashProxyTarget,
                          changeOrigin: true,
                          rewrite: (path) =>
                              path.replace(
                                  /^\/sdk-test-app-api\/lightdash/,
                                  '',
                              ),
                      },
                  }
                : undefined,
        },
        resolve: {
            alias: [
                {
                    find: '@lightdash/common/src',
                    replacement: resolve(__dirname, '../common/src'),
                },
                {
                    find: '@lightdash/common',
                    replacement: resolve(__dirname, '../common/src/index.ts'),
                },
                {
                    find: '@lightdash/formula',
                    replacement: resolve(__dirname, '../formula/src/index.ts'),
                },
                {
                    find: 'free-email-domains',
                    replacement: resolve(
                        __dirname,
                        '../common/node_modules/free-email-domains/domains.js',
                    ),
                },
                {
                    find: '@lightdash/sdk/sdk.css',
                    replacement: resolve(
                        __dirname,
                        '../frontend/sdk/dist/sdk.css',
                    ),
                },
                {
                    find: '@lightdash/sdk',
                    replacement: resolve(
                        __dirname,
                        '../frontend/sdk/index.tsx',
                    ),
                },
            ],
        },
        define: {
            __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
            __SDK_VERSION__: JSON.stringify(sdkPackageJson.version),
            REACT_QUERY_DEVTOOLS_ENABLED:
                process.env.REACT_QUERY_DEVTOOLS_ENABLED ?? false,
        },
    };
});
