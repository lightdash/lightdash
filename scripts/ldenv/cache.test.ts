import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    rm,
    readFile,
    writeFile,
    symlink,
    realpath,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    changedFiles,
    sourceHash,
    relocateBuildMetadata,
    cloneFormulaParser,
    prepareForkCode,
} from './cache';
import { git, hashFile, runner } from './io';
import type { Parent } from './model';

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

test('fork artifact copies and dependency links finish before metadata relocation or fallback install', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-code-copy-'));
    const parentRoot = path.join(directory, 'parent');
    const target = path.join(directory, '.t3/worktrees/lightdash/child');
    const fallback = path.join(directory, '.t3/worktrees/lightdash/fallback');
    const store = path.join(directory, 'store');
    const packagePath = path.join(store, 'links/tslib/node_modules/tslib');
    const originalRun = runner.run.bind(runner);
    try {
        await mkdir(parentRoot, { recursive: true });
        await git(parentRoot, ['init']);
        await git(parentRoot, ['config', 'user.email', 'test@example.invalid']);
        await git(parentRoot, ['config', 'user.name', 'Test']);
        for (const file of [
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
        ])
            await writeFile(path.join(parentRoot, file), '{}');
        await writeFile(
            path.join(parentRoot, '.gitignore'),
            'node_modules\ndist\n*.tsbuildinfo\nparser.js\n',
        );
        for (const name of ['formula', 'common', 'warehouses', 'backend']) {
            await mkdir(path.join(parentRoot, 'packages', name, 'src'), {
                recursive: true,
            });
            await writeFile(
                path.join(parentRoot, 'packages', name, 'package.json'),
                '{}',
            );
            await writeFile(
                path.join(parentRoot, 'packages', name, 'src/index.ts'),
                'export const value = 1;',
            );
        }
        await mkdir(path.join(parentRoot, 'packages/backend/src/generated'), {
            recursive: true,
        });
        for (const name of ['routes.ts', 'swagger.json'])
            await writeFile(
                path.join(parentRoot, 'packages/backend/src/generated', name),
                '{}',
            );
        await git(parentRoot, ['add', '.']);
        await git(parentRoot, ['commit', '-m', 'fixture']);
        await git(parentRoot, ['worktree', 'add', '--detach', target, 'HEAD']);
        await git(parentRoot, [
            'worktree',
            'add',
            '--detach',
            fallback,
            'HEAD',
        ]);
        await mkdir(packagePath, { recursive: true });
        await writeFile(
            path.join(packagePath, 'index.js'),
            'module.exports = {};',
        );
        await mkdir(path.join(parentRoot, 'node_modules'), { recursive: true });
        await symlink(packagePath, path.join(parentRoot, 'node_modules/tslib'));
        await writeFile(
            path.join(parentRoot, 'node_modules/.modules.yaml'),
            JSON.stringify({
                storeDir: store,
                virtualStoreDir: path.join(store, 'links'),
            }),
        );
        const hashes: Record<string, string> = {};
        for (const name of ['formula', 'common', 'warehouses']) {
            const prefix = `packages/${name}`;
            hashes[prefix] = await sourceHash(parentRoot, prefix);
            const dist = path.join(parentRoot, prefix, 'dist');
            await mkdir(dist);
            await writeFile(
                path.join(dist, 'index.js'),
                'module.exports = {};',
            );
            await writeFile(
                path.join(dist, '.tsbuildinfo'),
                JSON.stringify({
                    fileNames: [
                        path.relative(dist, path.join(packagePath, 'index.js')),
                    ],
                }),
            );
        }
        await mkdir(path.join(parentRoot, 'packages/formula/src/grammar'), {
            recursive: true,
        });
        await writeFile(
            path.join(parentRoot, 'packages/formula/src/grammar/parser.js'),
            'module.exports = {};',
        );
        const parent: Parent = {
            path: parentRoot,
            sha: await git(parentRoot, ['rev-parse', 'HEAD']),
            warehouseDatabase: 'fixture',
            warehouseHash: 'fixture',
            database: 'fixture',
            builtAt: '',
            lockHash: await hashFile(path.join(parentRoot, 'pnpm-lock.yaml')),
            sourceHashes: hashes,
            migrations: [],
            timings: {},
            seedComplete: true,
            nodeVersion: process.version,
            pnpmVersion: 'fixture',
            platform: process.platform,
            arch: process.arch,
        };
        let installations = 0;
        runner.run = async (command, args, options) => {
            if (command === 'pnpm' && args[0] === '--version') return 'fixture';
            if (command === 'sfw') {
                installations++;
                assert.equal(options.cwd, fallback);
                for (const name of ['formula', 'common', 'warehouses'])
                    assert.equal(
                        await readFile(
                            path.join(
                                fallback,
                                'packages',
                                name,
                                'dist/index.js',
                            ),
                            'utf8',
                        ),
                        'module.exports = {};',
                    );
                assert.equal(
                    await readFile(
                        path.join(
                            fallback,
                            'packages/formula/src/grammar/parser.js',
                        ),
                        'utf8',
                    ),
                    'module.exports = {};',
                );
                const metadata = JSON.parse(
                    await readFile(
                        path.join(
                            fallback,
                            'packages/common/dist/.tsbuildinfo',
                        ),
                        'utf8',
                    ),
                );
                assert.equal(
                    metadata.fileNames[0],
                    path.relative(
                        path.join(parentRoot, 'packages/common/dist'),
                        path.join(packagePath, 'index.js'),
                    ),
                );
                for (const file of [
                    'node_modules/.bin/tsx',
                    'node_modules/.bin/tsc',
                    'packages/backend/node_modules/pg',
                    'packages/frontend/node_modules/.bin/vite',
                ]) {
                    await mkdir(path.dirname(path.join(fallback, file)), {
                        recursive: true,
                    });
                    await writeFile(path.join(fallback, file), '');
                }
                await symlink(
                    packagePath,
                    path.join(fallback, 'node_modules/tslib'),
                );
                return '';
            }
            return originalRun(command, args, options);
        };
        const timings: Record<string, number> = {};
        await prepareForkCode(parent, target, {}, 'fixture', timings);
        assert.equal(installations, 0);
        assert.equal(
            await realpath(path.join(target, 'node_modules/tslib')),
            await realpath(packagePath),
        );
        const relocated = JSON.parse(
            await readFile(
                path.join(target, 'packages/common/dist/.tsbuildinfo'),
                'utf8',
            ),
        );
        assert.equal(
            path.resolve(
                target,
                'packages/common/dist',
                relocated.fileNames[0],
            ),
            path.join(packagePath, 'index.js'),
        );
        assert('artifactsFinalize' in timings);
        await symlink(
            path.join(directory, 'missing'),
            path.join(parentRoot, 'node_modules/broken'),
        );
        await prepareForkCode(parent, fallback, {}, 'fixture-fallback', {});
        assert.equal(installations, 1);
        const fallbackMetadata = JSON.parse(
            await readFile(
                path.join(fallback, 'packages/common/dist/.tsbuildinfo'),
                'utf8',
            ),
        );
        assert.equal(
            path.resolve(
                fallback,
                'packages/common/dist',
                fallbackMetadata.fileNames[0],
            ),
            path.join(packagePath, 'index.js'),
        );
    } finally {
        runner.run = originalRun;
        await rm(directory, { recursive: true, force: true });
    }
});
