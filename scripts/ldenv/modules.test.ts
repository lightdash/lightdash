import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readlink,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { cloneGlobalModules, globalModuleInputsMatch } from './modules';

const run = promisify(execFile);

async function fixture(): Promise<{
    base: string;
    parent: string;
    target: string;
    store: string;
}> {
    const base = await mkdtemp(path.join(os.tmpdir(), 'ldenv-modules-'));
    const parent = path.join(base, 'parents', 'base');
    const target = path.join(base, 'validation', 'links', 'deep', 'child');
    const store = path.join(base, 'store', 'v11');
    await mkdir(parent, { recursive: true });
    await mkdir(target, { recursive: true });
    await mkdir(path.join(store, 'links/pkg/node_modules/pkg'), {
        recursive: true,
    });
    await writeFile(
        path.join(store, 'links/pkg/node_modules/pkg/index.js'),
        'module.exports = 7;',
    );
    for (const relative of [
        'package.json',
        'packages/backend/package.json',
        'packages/common/package.json',
        'packages/formula/package.json',
        'packages/frontend/package.json',
    ]) {
        await mkdir(path.dirname(path.join(parent, relative)), {
            recursive: true,
        });
        await mkdir(path.dirname(path.join(target, relative)), {
            recursive: true,
        });
        await writeFile(path.join(parent, relative), '{}');
        await writeFile(path.join(target, relative), '{}');
    }
    await run('git', ['init', '-q'], { cwd: parent });
    await run('git', ['init', '-q'], { cwd: target });
    for (const root of [parent, target]) {
        for (const file of [
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            '.npmrc',
            '.pnpmfile.cjs',
        ])
            await writeFile(path.join(root, file), file);
        await mkdir(path.join(root, 'patches'), { recursive: true });
        await writeFile(
            path.join(root, 'patches', 'dependency.patch'),
            'patch',
        );
    }
    await run('git', ['add', '.'], { cwd: parent });
    await run('git', ['add', '.'], { cwd: target });
    for (const relative of [
        'node_modules/.pnpm/node_modules/@lightdash',
        'node_modules/.pnpm/node_modules/.bin',
        'node_modules/.bin',
        'packages/backend/node_modules/@lightdash',
        'packages/common/node_modules',
        'packages/frontend/node_modules/.vite',
        'packages/frontend/node_modules/.ldenv-vite-cache',
    ])
        await mkdir(path.join(parent, relative), { recursive: true });
    const link = async (source: string, destination: string) => {
        await symlink(
            path.relative(path.dirname(destination), source),
            destination,
        );
    };
    await link(
        path.join(store, 'links/pkg/node_modules/pkg'),
        path.join(parent, 'node_modules/pkg'),
    );
    await link(
        path.join(parent, 'packages/common'),
        path.join(parent, 'packages/backend/node_modules/@lightdash/common'),
    );
    await link(
        path.join(parent, 'packages/formula'),
        path.join(parent, 'node_modules/.pnpm/node_modules/@lightdash/formula'),
    );
    await writeFile(
        path.join(parent, 'packages/common/node_modules/private.txt'),
        'parent',
    );
    await writeFile(
        path.join(parent, 'packages/frontend/node_modules/.vite/cache.js'),
        'vite',
    );
    await writeFile(
        path.join(
            parent,
            'packages/frontend/node_modules/.ldenv-vite-cache/cache.js',
        ),
        'vite',
    );
    await writeFile(
        path.join(parent, 'node_modules/.bin/pkg'),
        `#!/bin/sh\nexec node "${parent}/node_modules/pkg/index.js"\n`,
    );
    await writeFile(
        path.join(parent, 'node_modules/.pnpm/node_modules/.bin/pkg'),
        `#!/bin/sh\nexec node "${parent}/node_modules/pkg/index.js"\n`,
    );
    await writeFile(
        path.join(parent, 'node_modules/.modules.yaml'),
        JSON.stringify({
            storeDir: store,
            virtualStoreDir: path.relative(
                path.join(parent, 'node_modules'),
                path.join(store, 'links'),
            ),
        }),
    );
    await writeFile(
        path.join(parent, 'node_modules/.pnpm-workspace-state-v1.json'),
        JSON.stringify({
            projects: {
                [parent]: {},
                [path.join(parent, 'packages/common')]: {},
            },
        }),
    );
    return { base, parent, target, store };
}

test('relocates workspace and store links at a different depth while copying files privately', async () => {
    const { base, parent, target, store } = await fixture();
    try {
        const result = await cloneGlobalModules(parent, target);
        assert.equal(result.trees, 4);
        assert.equal(result.links, 3);
        assert.equal(
            await realpath(
                path.join(
                    target,
                    'packages/backend/node_modules/@lightdash/common',
                ),
            ),
            await realpath(path.join(target, 'packages/common')),
        );
        assert.equal(
            await realpath(
                path.join(
                    target,
                    'node_modules/.pnpm/node_modules/@lightdash/formula',
                ),
            ),
            await realpath(path.join(target, 'packages/formula')),
        );
        assert.equal(
            await realpath(path.join(target, 'node_modules/pkg')),
            await realpath(path.join(store, 'links/pkg/node_modules/pkg')),
        );
        assert.notEqual(
            await readlink(path.join(parent, 'node_modules/pkg')),
            await readlink(path.join(target, 'node_modules/pkg')),
        );
        await writeFile(
            path.join(target, 'packages/common/node_modules/private.txt'),
            'child',
        );
        assert.equal(
            await readFile(
                path.join(parent, 'packages/common/node_modules/private.txt'),
                'utf8',
            ),
            'parent',
        );
        await assert.rejects(
            lstat(path.join(target, 'packages/frontend/node_modules/.vite')),
        );
        await assert.rejects(
            lstat(
                path.join(
                    target,
                    'packages/frontend/node_modules/.ldenv-vite-cache',
                ),
            ),
        );
        assert.match(
            await readFile(path.join(target, 'node_modules/.bin/pkg'), 'utf8'),
            new RegExp(target),
        );
        assert.doesNotMatch(
            await readFile(path.join(target, 'node_modules/.bin/pkg'), 'utf8'),
            new RegExp(parent),
        );
        assert.doesNotMatch(
            await readFile(
                path.join(target, 'node_modules/.pnpm/node_modules/.bin/pkg'),
                'utf8',
            ),
            new RegExp(parent),
        );
        const metadata = JSON.parse(
            await readFile(
                path.join(target, 'node_modules/.modules.yaml'),
                'utf8',
            ),
        );
        assert.equal(
            await realpath(
                path.resolve(target, 'node_modules', metadata.virtualStoreDir),
            ),
            await realpath(path.join(store, 'links')),
        );
        assert.doesNotMatch(
            await readFile(
                path.join(target, 'node_modules/.pnpm-workspace-state-v1.json'),
                'utf8',
            ),
            new RegExp(parent),
        );
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('rejects existing dependencies without changing them', async () => {
    const { base, parent, target } = await fixture();
    try {
        await mkdir(path.join(target, 'packages/backend/node_modules'), {
            recursive: true,
        });
        await writeFile(
            path.join(target, 'packages/backend/node_modules/keep'),
            'user',
        );
        await assert.rejects(
            cloneGlobalModules(parent, target),
            /Refusing to replace existing dependencies/,
        );
        assert.equal(
            await readFile(
                path.join(target, 'packages/backend/node_modules/keep'),
                'utf8',
            ),
            'user',
        );
        await assert.rejects(lstat(path.join(target, 'node_modules')));
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('rejects links outside the global store and malformed global layout', async () => {
    const { base, parent, target, store } = await fixture();
    try {
        await symlink(
            path.relative(path.join(parent, 'node_modules'), base),
            path.join(parent, 'node_modules/unsafe'),
        );
        await assert.rejects(
            cloneGlobalModules(parent, target),
            /resolves outside parent and pnpm store/,
        );
        await rm(path.join(parent, 'node_modules/unsafe'));
        await symlink(
            path.join(parent, 'packages/common'),
            path.join(store, 'links/alias'),
        );
        await symlink(
            path.join(store, 'links/alias'),
            path.join(parent, 'node_modules/alias'),
        );
        await assert.rejects(
            cloneGlobalModules(parent, target),
            /resolves outside parent and pnpm store/,
        );
        await rm(path.join(parent, 'node_modules/alias'));
        await writeFile(
            path.join(parent, 'node_modules/.modules.yaml'),
            JSON.stringify({ storeDir: base, virtualStoreDir: 'wrong' }),
        );
        await assert.rejects(
            cloneGlobalModules(parent, target),
            /expected global pnpm layout/,
        );
        await assert.rejects(lstat(path.join(target, 'node_modules')));
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('rejects a symlink cycle before creating target dependencies', async () => {
    const { base, parent, target } = await fixture();
    try {
        await symlink('cycle-b', path.join(parent, 'node_modules/cycle-a'));
        await symlink('cycle-a', path.join(parent, 'node_modules/cycle-b'));
        await assert.rejects(
            cloneGlobalModules(parent, target),
            /Unsafe or broken parent dependency link/,
        );
        await assert.rejects(lstat(path.join(target, 'node_modules')));
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('input guard compares tracked and untracked manifests, lock, config, and patch bytes', async () => {
    const { base, parent, target } = await fixture();
    try {
        assert.equal(await globalModuleInputsMatch(parent, target), true);
        for (const file of [
            'packages/backend/package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            '.npmrc',
            '.pnpmfile.cjs',
            'patches/dependency.patch',
        ]) {
            const original = await readFile(path.join(target, file));
            await writeFile(path.join(target, file), 'changed');
            assert.equal(
                await globalModuleInputsMatch(parent, target),
                false,
                file,
            );
            await writeFile(path.join(target, file), original);
        }
        await mkdir(path.join(target, 'packages/new'), { recursive: true });
        await writeFile(path.join(target, 'packages/new/package.json'), '{}');
        assert.equal(await globalModuleInputsMatch(parent, target), false);
        await rm(path.join(target, 'packages/new/package.json'));
        await writeFile(path.join(target, 'patches/extra.patch'), 'untracked');
        assert.equal(await globalModuleInputsMatch(parent, target), false);
        await rm(path.join(target, 'patches/extra.patch'));
        await rm(path.join(target, 'packages/common/package.json'));
        assert.equal(await globalModuleInputsMatch(parent, target), false);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
