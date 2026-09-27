import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    readFile,
    realpath,
    rm,
    stat,
    symlink,
    utimes,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    captureViteCache,
    hasViteSnapshot,
    restoreViteSnapshot,
} from './vite-cache';
import { frontendOptions, loadVite, viteCacheContext } from './vite-runtime';

test('installed Vite accepts relocated optimizer metadata without rebundling and invalidates meaningful inputs', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'ldenv-vite-real-'));
    const root = await realpath(scratch);
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
        const installedVite = await realpath(
            path.join(__dirname, '../../packages/frontend/node_modules/vite'),
        );
        const dependency = path.join(root, 'store/node_modules/example');
        await mkdir(dependency, { recursive: true });
        await writeFile(
            path.join(dependency, 'package.json'),
            JSON.stringify({
                name: 'example',
                version: '1.0.0',
                type: 'module',
                main: 'index.js',
            }),
        );
        await writeFile(
            path.join(dependency, 'index.js'),
            'export const value = 42;',
        );
        const parent = path.join(root, 'parent');
        const fork = path.join(root, 'deep', 'fork');
        for (const checkout of [parent, fork]) {
            const frontend = path.join(checkout, 'packages/frontend');
            await mkdir(path.join(frontend, 'node_modules'), {
                recursive: true,
            });
            await mkdir(path.join(frontend, 'src'));
            await mkdir(path.join(checkout, 'node_modules'));
            await mkdir(path.join(checkout, 'patches'));
            await writeFile(
                path.join(checkout, 'node_modules/.package-lock.json'),
                '{"lockfileVersion":3}',
            );
            await writeFile(
                path.join(checkout, 'pnpm-lock.yaml'),
                'lockfileVersion: 9.0',
            );
            await writeFile(
                path.join(checkout, 'package.json'),
                '{"private":true}',
            );
            await writeFile(
                path.join(checkout, 'patches/example.patch'),
                'initial patch',
            );
            await writeFile(
                path.join(frontend, 'package.json'),
                '{"name":"fixture","private":true}',
            );
            await writeFile(
                path.join(frontend, 'index.html'),
                '<script type="module" src="/src/index.js"></script>',
            );
            await writeFile(
                path.join(frontend, 'src/index.js'),
                'import { value } from "example"; console.log(value);',
            );
            await writeFile(
                path.join(frontend, 'vite.config.mjs'),
                'import path from "node:path"; export default { server: { warmup: { clientFiles: ["./src/providers/**/*.tsx", "./src/lazy/**/*.tsx"] } }, optimizeDeps: { include: ["example"] }, resolve: { alias: { "@src": path.join(import.meta.dirname, "src") } } };',
            );
            await symlink(
                installedVite,
                path.join(frontend, 'node_modules/vite'),
            );
            await symlink(
                dependency,
                path.join(frontend, 'node_modules/example'),
            );
        }
        await utimes(
            path.join(parent, 'patches'),
            new Date(1000),
            new Date(1000),
        );
        await utimes(
            path.join(fork, 'patches'),
            new Date(2000),
            new Date(2000),
        );
        const vite = await loadVite(parent);
        const resolve = (checkout: string) =>
            vite.resolveConfig(
                { ...frontendOptions(checkout), logLevel: 'silent' },
                'serve',
            );
        const parentConfig = await resolve(parent);
        const forkConfig = await resolve(fork);
        for (const config of [parentConfig, forkConfig]) {
            assert.deepEqual(config.server.warmup.clientFiles, [
                './src/index.tsx',
                './src/App.tsx',
                './src/Routes.tsx',
            ]);
            assert.deepEqual(config.environments.client.dev.warmup, [
                './src/index.tsx',
                './src/App.tsx',
                './src/Routes.tsx',
            ]);
        }
        const parentContext = await viteCacheContext(parent, parentConfig);
        const forkContext = await viteCacheContext(fork, forkConfig);
        assert(parentContext, 'installed Vite must match the reviewed adapter');
        assert(forkContext);
        assert.equal(parentContext.key, forkContext.key);
        assert.notEqual(
            parentContext.hashes.configHash,
            forkContext.hashes.configHash,
        );
        assert.notEqual(
            parentContext.hashes.lockfileHash,
            forkContext.hashes.lockfileHash,
        );
        await vite.optimizeDeps(parentConfig, true);
        assert.equal(
            (await captureViteCache(parentContext)).status,
            'populated',
        );
        assert.equal(await hasViteSnapshot(parentContext), true);
        assert.equal(
            await hasViteSnapshot({ ...parentContext, key: 'incompatible' }),
            false,
        );
        assert.equal(
            (await restoreViteSnapshot(parent, forkContext)).status,
            'hit',
        );
        const output = path.join(forkContext.cacheDir, 'example.js');
        const before = await stat(output, { bigint: true });
        const cached = await vite.optimizeDeps(forkConfig, false, true);
        assert.equal(cached.configHash, forkContext.hashes.configHash);
        assert.equal(
            (await stat(output, { bigint: true })).mtimeNs,
            before.mtimeNs,
        );
        const restored = JSON.parse(
            await readFile(
                path.join(forkContext.cacheDir, '_metadata.json'),
                'utf8',
            ),
        );
        assert(restored.optimized.example, JSON.stringify(restored));
        assert.equal(
            path.resolve(forkContext.cacheDir, restored.optimized.example.src),
            path.join(dependency, 'index.js'),
        );
        await writeFile(
            path.join(fork, 'packages/frontend/src/index.js'),
            'console.log("source-only edit");',
        );
        assert.equal(
            (await viteCacheContext(fork, await resolve(fork)))?.key,
            forkContext.key,
        );
        for (const relative of [
            'pnpm-lock.yaml',
            'patches/example.patch',
            'packages/frontend/vite.config.mjs',
        ]) {
            const file = path.join(fork, relative);
            const original = await readFile(file, 'utf8');
            await writeFile(file, `${original}\n`);
            assert.notEqual(
                (await viteCacheContext(fork, await resolve(fork)))?.key,
                forkContext.key,
                relative,
            );
            await writeFile(file, original);
        }
        const changedDefine = await vite.resolveConfig(
            {
                ...frontendOptions(fork),
                logLevel: 'silent',
                define: { FEATURE: 'true' },
            },
            'serve',
        );
        assert.notEqual(
            (await viteCacheContext(fork, changedDefine))?.key,
            forkContext.key,
        );
        const unsupported = path.join(root, 'unsupported');
        await mkdir(path.join(unsupported, 'dist/node/chunks'), {
            recursive: true,
        });
        await writeFile(
            path.join(unsupported, 'package.json'),
            JSON.stringify({ name: 'vite', exports: './dist/node/index.js' }),
        );
        await writeFile(path.join(unsupported, 'dist/node/index.js'), '');
        await writeFile(
            path.join(unsupported, 'dist/node/chunks/node.js'),
            'changed upstream hash implementation',
        );
        const unsupportedRoot = path.join(root, 'other-checkout');
        const viteLink = path.join(
            unsupportedRoot,
            'packages/frontend/node_modules/vite',
        );
        await mkdir(path.dirname(viteLink), { recursive: true });
        await symlink(unsupported, viteLink);
        assert.equal(await viteCacheContext(unsupportedRoot, forkConfig), null);
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        await rm(root, { recursive: true, force: true });
    }
});
