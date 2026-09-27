import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    captureViteCache,
    digest,
    portableValue,
    restoreViteSnapshot,
    viteSnapshotPath,
    type ViteCacheContext,
} from './vite-cache';

async function fixture() {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'ldenv-vite-'));
    const root = await import('node:fs/promises').then((fs) =>
        fs.realpath(scratch),
    );
    const parentRoot = path.join(root, 'parent');
    const targetRoot = path.join(root, 'deeper', 'fork');
    const dependency = path.join(root, 'store/node_modules/example/index.js');
    await mkdir(path.dirname(dependency), { recursive: true });
    await writeFile(dependency, 'export default 42');
    const context = (checkout: string): ViteCacheContext => ({
        root: checkout,
        cacheDir: path.join(
            checkout,
            'packages/frontend/node_modules/.vite/deps',
        ),
        key: 'same-inputs',
        hashes: {
            hash: digest(checkout).slice(0, 8),
            configHash: digest(checkout).slice(0, 8),
            lockfileHash: digest(`${checkout}-mtime`).slice(0, 8),
            browserHash: 'browser',
        },
    });
    const parent = context(parentRoot);
    const target = context(targetRoot);
    await mkdir(parent.cacheDir, { recursive: true });
    await writeFile(
        path.join(parent.cacheDir, 'example.js'),
        'export { x } from "./chunk.js"',
    );
    await writeFile(
        path.join(parent.cacheDir, 'chunk.js'),
        'export const x = 42',
    );
    await writeFile(
        path.join(parent.cacheDir, 'example.js.map'),
        JSON.stringify({
            version: 3,
            sources: [path.relative(parent.cacheDir, dependency)],
            sourcesContent: ['export default 42'],
        }),
    );
    await writeFile(
        path.join(parent.cacheDir, '_metadata.json'),
        JSON.stringify({
            ...parent.hashes,
            optimized: {
                example: {
                    src: path.relative(parent.cacheDir, dependency),
                    file: 'example.js',
                    fileHash: 'hash',
                    needsInterop: false,
                },
            },
            chunks: { chunk: { file: 'chunk.js' } },
        }),
    );
    return {
        root,
        parent,
        target,
        dependency,
        cleanup: () => rm(root, { recursive: true, force: true }),
    };
}

test('Vite cache relocation changes local hashes and preserves global dependency paths at another depth', async () => {
    const f = await fixture();
    try {
        assert.equal((await captureViteCache(f.parent)).status, 'populated');
        assert.equal(
            (await restoreViteSnapshot(f.parent.root, f.target)).status,
            'hit',
        );
        const metadata = JSON.parse(
            await readFile(
                path.join(f.target.cacheDir, '_metadata.json'),
                'utf8',
            ),
        );
        assert.equal(metadata.configHash, f.target.hashes.configHash);
        assert.equal(metadata.lockfileHash, f.target.hashes.lockfileHash);
        assert.notEqual(metadata.browserHash, f.parent.hashes.browserHash);
        assert.equal(
            path.resolve(f.target.cacheDir, metadata.optimized.example.src),
            f.dependency,
        );
        const map = JSON.parse(
            await readFile(
                path.join(f.target.cacheDir, 'example.js.map'),
                'utf8',
            ),
        );
        assert.equal(
            path.resolve(f.target.cacheDir, map.sources[0]),
            f.dependency,
        );
        await writeFile(
            path.join(f.target.cacheDir, 'example.js'),
            'private change',
        );
        assert.equal(
            await readFile(path.join(f.parent.cacheDir, 'example.js'), 'utf8'),
            'export { x } from "./chunk.js"',
        );
        assert.equal(
            (await restoreViteSnapshot(f.parent.root, f.target)).reason,
            'Existing optimizer cache retained',
        );
    } finally {
        await f.cleanup();
    }
});

test('Vite cache rejects changed inputs, corrupted chunks and incomplete metadata without leaving a cache', async () => {
    const f = await fixture();
    try {
        assert.equal((await captureViteCache(f.parent)).status, 'populated');
        assert.equal(
            (
                await restoreViteSnapshot(f.parent.root, {
                    ...f.target,
                    key: 'changed-lock-config-or-patch',
                })
            ).status,
            'miss',
        );
        await assert.rejects(
            readFile(path.join(f.target.cacheDir, '_metadata.json')),
            { code: 'ENOENT' },
        );
        await writeFile(
            path.join(viteSnapshotPath(f.parent.root), 'chunk.js'),
            'corrupted',
        );
        assert.match(
            (await restoreViteSnapshot(f.parent.root, f.target)).reason,
            /checksum/,
        );
        await assert.rejects(
            readFile(path.join(f.target.cacheDir, '_metadata.json')),
            { code: 'ENOENT' },
        );
    } finally {
        await f.cleanup();
    }
});

test('Vite cache rejects linked cache roots and linked snapshot files', async () => {
    const f = await fixture();
    try {
        assert.equal((await captureViteCache(f.parent)).status, 'populated');
        const chunk = path.join(viteSnapshotPath(f.parent.root), 'chunk.js');
        await rm(chunk);
        await symlink(f.dependency, chunk);
        assert.match(
            (await restoreViteSnapshot(f.parent.root, f.target)).reason,
            /non-file/,
        );
        await rm(chunk);
        await writeFile(chunk, 'export const x = 42');
        await mkdir(path.dirname(f.target.cacheDir), { recursive: true });
        await rm(path.dirname(f.target.cacheDir), { recursive: true });
        await symlink(
            path.dirname(f.parent.cacheDir),
            path.dirname(f.target.cacheDir),
        );
        assert.equal(
            (await restoreViteSnapshot(f.parent.root, f.target)).status,
            'miss',
        );
    } finally {
        await f.cleanup();
    }
});

test('Vite refuses to certify an optimizer cache created with other hashes', async () => {
    const f = await fixture();
    try {
        assert.match(
            (await captureViteCache({ ...f.parent, hashes: f.target.hashes }))
                .reason,
            /hashes/,
        );
    } finally {
        await f.cleanup();
    }
});

test('portable configuration normalizes the checkout only at path boundaries', () => {
    assert.equal(
        portableValue({ root: '/a/root', alias: '/a/root/src' }, '/a/root'),
        portableValue({ root: '/b/fork', alias: '/b/fork/src' }, '/b/fork'),
    );
    assert.notEqual(
        portableValue('/a/root-sibling/src', '/a/root'),
        portableValue('/b/fork-sibling/src', '/b/fork'),
    );
});
