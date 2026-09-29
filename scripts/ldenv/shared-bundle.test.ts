import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    backendBundleInputs,
    publishSharedBundle,
    readSharedBundle,
    sharedBundleDirectory,
    sharedBundleGc,
} from './shared-bundle';

const controlRoot = path.resolve(__dirname, '../..');

async function fixture(directory: string, name: string): Promise<string> {
    const root = path.join(directory, name);
    const backend = path.join(root, 'packages/backend');
    const source = path.join(backend, 'src');
    await mkdir(source, { recursive: true });
    await mkdir(path.join(root, 'packages/frontend/build'), {
        recursive: true,
    });
    await mkdir(path.join(backend, 'node_modules'));
    await symlink(
        path.join(controlRoot, 'node_modules'),
        path.join(root, 'node_modules'),
    );
    await writeFile(
        path.join(backend, 'tsconfig.json'),
        '{"compilerOptions":{"target":"ES2022"}}',
    );
    await writeFile(
        path.join(source, 'index.ts'),
        "import fs from 'node:fs'; import path from 'node:path'; export const asset=fs.readFileSync(path.join(__dirname,'../../frontend/build/asset.txt'),'utf8');",
    );
    await writeFile(path.join(root, 'packages/frontend/build/asset.txt'), name);
    const initialized = spawnSync('git', ['init', '-q', root]);
    assert.equal(initialized.status, 0);
    return root;
}

test('same source publishes one read-only bundle and edited backend gets another key', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-shared-'));
    const base = path.join(directory, 'home');
    try {
        const first = await fixture(directory, 'first');
        const second = await fixture(directory, 'second');
        const firstInputs = await backendBundleInputs(first);
        const secondInputs = await backendBundleInputs(second);
        assert.equal(firstInputs.key, secondInputs.key);
        const published = await publishSharedBundle(first, firstInputs, base);
        const shared = sharedBundleDirectory(firstInputs.key, base);
        const original = await readFile(path.join(shared, 'api.cjs'));
        assert.equal(
            (await readSharedBundle(firstInputs.key, base))?.key,
            published.key,
        );
        assert.equal(
            (await publishSharedBundle(second, secondInputs, base)).key,
            published.key,
        );
        const run = spawnSync(
            process.execPath,
            [
                '-e',
                `console.log(require(${JSON.stringify(path.join(shared, 'api.cjs'))}).asset)`,
            ],
            {
                encoding: 'utf8',
                env: { ...process.env, LDENV_WORKTREE: second },
            },
        );
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout.trim(), 'second');
        await writeFile(
            path.join(second, 'packages/backend/src/index.ts'),
            "export const asset='edited';",
        );
        const changedInputs = await backendBundleInputs(second);
        assert.notEqual(changedInputs.key, firstInputs.key);
        await publishSharedBundle(second, changedInputs, base);
        assert.deepEqual(
            await readFile(path.join(shared, 'api.cjs')),
            original,
        );
        const active = path.join(base, 'bundles/ldenv_fixture');
        await mkdir(active);
        await writeFile(
            path.join(active, 'status.json'),
            JSON.stringify({
                state: 'building',
                apiPid: null,
                supervisorPid: process.pid,
                sharedKey: firstInputs.key,
            }),
        );
        assert.deepEqual(await sharedBundleGc(true, 1, base), []);
        await rm(active, { recursive: true });
        const old = await sharedBundleGc(true, 1, base);
        assert.deepEqual(old, [firstInputs.key]);
        assert.deepEqual(await sharedBundleGc(false, 1, base), old);
        assert.equal(await readSharedBundle(firstInputs.key, base), null);
        assert.equal(
            (await readSharedBundle(changedInputs.key, base))?.key,
            changedInputs.key,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
