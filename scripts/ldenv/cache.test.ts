import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    changedFiles,
    sourceHash,
    relocateBuildMetadata,
    cloneFormulaParser,
} from './cache';
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

test('build metadata keeps external dependencies valid at a different worktree depth', () => {
    const source = '/home/dev/parents/base';
    const target = '/home/dev/worktrees/project/thread';
    const metadata = 'packages/common/dist/cjs/.tsbuildinfo';
    const external = '/home/dev/store/pkg/index.d.ts';
    const relative = path.relative(
        path.dirname(path.join(source, metadata)),
        external,
    );
    const result = relocateBuildMetadata(
        {
            fileNames: ['../../src/index.ts', relative, 'lib.es5.d.ts'],
            packageJsons: [relative.replace('index.d.ts', 'package.json')],
            missingPackageJsons: ['../../node_modules/missing/package.json'],
            options: {
                rootDir: '../../src',
                tsBuildInfoFile: './.tsbuildinfo',
            },
        },
        source,
        target,
        metadata,
    );
    assert.equal(
        path.resolve(target, path.dirname(metadata), result.fileNames[1]),
        external,
    );
    assert.equal(
        path.resolve(target, path.dirname(metadata), result.packageJsons[0]),
        '/home/dev/store/pkg/package.json',
    );
    assert.equal(result.fileNames[0], '../../src/index.ts');
    assert.equal(result.fileNames[2], 'lib.es5.d.ts');
    assert.deepEqual(result.options, {
        rootDir: '../../src',
        tsBuildInfoFile: './.tsbuildinfo',
    });
    assert.equal(
        result.missingPackageJsons[0],
        '../../node_modules/missing/package.json',
    );
});

test('forks carry the generated formula parser used by the frontend source alias', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-formula-'));
    try {
        const relative = 'packages/formula/src/grammar/parser.js';
        const source = path.join(root, 'parent', relative);
        const target = path.join(root, 'child', relative);
        await mkdir(path.dirname(source), { recursive: true });
        await writeFile(source, 'export const parse = () => 42;');
        await cloneFormulaParser(
            path.join(root, 'parent'),
            path.join(root, 'child'),
        );
        assert.equal(
            await readFile(target, 'utf8'),
            await readFile(source, 'utf8'),
        );
        await writeFile(target, 'changed');
        assert.equal(
            await readFile(source, 'utf8'),
            'export const parse = () => 42;',
        );
    } finally {
        await rm(root, { recursive: true });
    }
});
