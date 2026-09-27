import { glob, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ResolvedConfig } from '../../packages/frontend/node_modules/vite/dist/node/index.js' with {
    'resolution-mode': 'import',
};
import {
    captureViteCache,
    hasViteSnapshot,
    digest,
    portableValue,
    restoreViteSnapshot,
    type ViteCacheContext,
    type ViteCacheResult,
    type ViteHashes,
} from './vite-cache';

export const supportedViteSource =
    'c3dd49d14b140acd79ce8f76d3b9c191dbe76713a47e15947c2efc65f453588b';
export const supportedViteVersion = '8.0.16';
type ViteApi = typeof import(
    '../../packages/frontend/node_modules/vite/dist/node/index.js',
    { with: { 'resolution-mode': 'import' } }
);
type Optimizer = {
    initDepsOptimizerMetadata(environment: { config: unknown }): ViteHashes;
};

export async function loadVite(root: string): Promise<ViteApi> {
    const requireFrontend = createRequire(
        path.join(root, 'packages/frontend/package.json'),
    );
    return import(
        pathToFileURL(requireFrontend.resolve('vite')).href
    ) as Promise<ViteApi>;
}

export function frontendOptions(root: string) {
    const port = process.env.FE_PORT ? Number(process.env.FE_PORT) : null;
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535))
        throw new Error('Invalid FE_PORT');
    return {
        root: path.join(root, 'packages/frontend'),
        mode: 'development',
        plugins: [
            {
                name: 'ldenv-static-entry-warmup',
                enforce: 'post' as const,
                configResolved(config: ResolvedConfig) {
                    const entries = [
                        './src/index.tsx',
                        './src/App.tsx',
                        './src/Routes.tsx',
                    ];
                    config.server.warmup.clientFiles = [...entries];
                    config.environments.client.dev.warmup = [...entries];
                },
            },
        ],
        server: {
            ...(port === null ? {} : { port }),
            strictPort: true,
        },
    };
}

export async function viteCacheContext(
    root: string,
    config: ResolvedConfig,
): Promise<ViteCacheContext | null> {
    root = await realpath(root);
    const requireFrontend = createRequire(
        path.join(root, 'packages/frontend/package.json'),
    );
    const viteEntry = requireFrontend.resolve('vite');
    const chunk = path.join(path.dirname(viteEntry), 'chunks/node.js');
    if (digest(await readFile(chunk)) !== supportedViteSource) return null;
    const vite = await loadVite(root);
    if (vite.version !== supportedViteVersion) return null;
    const internal = (await import(pathToFileURL(chunk).href)) as {
        D: Optimizer;
    };
    const environmentConfig = { ...config, ...config.environments.client };
    const { hash, configHash, lockfileHash, browserHash } =
        internal.D.initDepsOptimizerMetadata({ config: environmentConfig });
    const hashes = { hash, configHash, lockfileHash, browserHash };
    const normalizedConfig = {
        mode: config.mode,
        define: environmentConfig.define,
        env: config.env,
        resolve: environmentConfig.resolve,
        assetsInclude: environmentConfig.assetsInclude,
        optimizeDeps: environmentConfig.optimizeDeps,
        keepProcessEnv: environmentConfig.keepProcessEnv,
        plugins: config.plugins.map(
            (plugin) => (plugin as { name: string }).name,
        ),
    };
    const inputs = new Set(config.configFileDependencies);
    for (const file of [
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'package.json',
        '.npmrc',
        'tsconfig.json',
    ])
        inputs.add(path.join(root, file));
    for await (const file of glob(
        [
            'patches/**/*',
            'packages/*/package.json',
            'packages/frontend/tsconfig*.json',
        ],
        { cwd: root, exclude: ['**/node_modules/**'] },
    ))
        inputs.add(path.join(root, file));
    const files: Array<[string, string]> = [];
    for (const file of [...inputs].sort()) {
        try {
            files.push([
                portableValue(file, root),
                digest(await readFile(file)),
            ]);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EISDIR') continue;
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            files.push([portableValue(file, root), 'missing']);
        }
    }
    const key = digest(
        portableValue(
            {
                schema: 1,
                vite: supportedViteSource,
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                config: normalizedConfig,
                files,
            },
            root,
        ),
    );
    return { root, cacheDir: path.join(config.cacheDir, 'deps'), key, hashes };
}

export async function runViteCache(
    action: 'populate' | 'restore',
    root: string,
    parentRoot: string | null,
): Promise<ViteCacheResult> {
    try {
        const vite = await loadVite(root);
        const config = await vite.resolveConfig(frontendOptions(root), 'serve');
        const context = await viteCacheContext(root, config);
        if (!context)
            return {
                status: 'miss',
                reason: 'Unsupported Vite optimizer implementation',
            };
        if (action === 'restore') {
            if (!parentRoot) throw new Error('Parent root is required');
            return await restoreViteSnapshot(
                await realpath(parentRoot),
                context,
            );
        }
        if (await hasViteSnapshot(context))
            return {
                status: 'populated',
                reason: 'Compatible optimizer snapshot already exists',
            };
        await vite.optimizeDeps(config, true);
        return await captureViteCache(context);
    } catch (error) {
        return { status: 'miss', reason: (error as Error).message };
    }
}
