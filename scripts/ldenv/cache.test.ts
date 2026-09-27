import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { changedFiles, sourceHash } from './cache';
import { git } from './io';

test('real git diff includes committed, staged, unstaged, renamed and untracked changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-diff-'));
    try {
        await git(root, ['init']);
        await git(root, ['config', 'user.email', 'test@example.invalid']);
        await git(root, ['config', 'user.name', 'Test']);
        await writeFile(path.join(root, 'base.ts'), 'base');
        await git(root, ['add', '.']);
        await git(root, ['commit', '-m', 'fixture']);
        const sha = await git(root, ['rev-parse', 'HEAD']);
        await git(root, ['mv', 'base.ts', 'renamed.ts']);
        await git(root, ['commit', '-m', 'rename']);
        await writeFile(path.join(root, 'staged.ts'), 'staged');
        await git(root, ['add', '.']);
        await writeFile(path.join(root, 'renamed.ts'), 'dirty');
        await writeFile(path.join(root, 'untracked file.ts'), 'untracked');
        assert.deepEqual(await changedFiles(root, sha), [
            'base.ts',
            'renamed.ts',
            'staged.ts',
            'untracked file.ts',
        ]);
    } finally {
        await rm(root, { recursive: true });
    }
});
test('source hash changes with content and deletion but not mtime or ignored dist', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-hash-'));
    try {
        await git(root, ['init']);
        await mkdir(path.join(root, 'packages/common'), { recursive: true });
        await writeFile(path.join(root, '.gitignore'), '**/dist/\n');
        const file = path.join(root, 'packages/common/index.ts');
        await writeFile(file, 'a');
        await git(root, ['add', '.']);
        const first = await sourceHash(root, 'packages/common');
        await writeFile(file, 'a');
        assert.equal(await sourceHash(root, 'packages/common'), first);
        await mkdir(path.join(root, 'packages/common/dist'));
        await writeFile(
            path.join(root, 'packages/common/dist/index.js'),
            'built',
        );
        assert.equal(await sourceHash(root, 'packages/common'), first);
        await writeFile(file, 'b');
        assert.notEqual(await sourceHash(root, 'packages/common'), first);
        await rm(file);
        assert.notEqual(await sourceHash(root, 'packages/common'), first);
    } finally {
        await rm(root, { recursive: true });
    }
});
