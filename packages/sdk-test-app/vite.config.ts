import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const sdkPackageJson = JSON.parse(
    readFileSync(resolve(__dirname, '../frontend/sdk/package.json'), 'utf-8'),
);

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
        plugins: [react()],
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
                    replacement: resolve(__dirname, '../frontend/sdk/index.tsx'),
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
