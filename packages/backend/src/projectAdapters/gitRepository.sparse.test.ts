import execa from 'execa';
import fs from 'fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'os';
import path from 'path';
import { simpleGit } from 'simple-git';
import { pathToFileURL } from 'url';
import { GIT_REPOSITORY_ENVIRONMENT, GitRepository } from './gitRepository';

const hasGit = spawnSync('git', ['--version']).status === 0;
const bundle = path.join(
    __dirname,
    '__fixtures__/sparse-checkout/sparse-checkout.bundle',
);

it.skipIf(!hasGit).each([false, true])(
    'keeps unrelated files and blobs absent across real clone and refresh (signal=%s)',
    async (withSignal) => {
        await fs.access(bundle);
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'sparse-git-test-'),
        );
        try {
            const config = path.join(root, 'gitconfig');
            await fs.writeFile(config, '');
            const environment = {
                PATH: process.env.PATH ?? '',
                HOME: root,
                GIT_CONFIG_GLOBAL: config,
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_TERMINAL_PROMPT: '0',
            };
            const run = (args: string[], cwd = root) =>
                execa('git', args, {
                    cwd,
                    extendEnv: false,
                    env: environment,
                });
            const server = path.join(root, 'server.git');
            const checkout = path.join(root, 'checkout');
            await run(['init', '--bare', '--initial-branch=main', server]);
            await run(
                ['fetch', bundle, 'refs/heads/main:refs/heads/main'],
                server,
            );
            await run(['config', 'uploadpack.allowFilter', 'true'], server);
            const { stdout: first } = await run(
                ['rev-parse', 'main~1'],
                server,
            );
            const { stdout: second } = await run(['rev-parse', 'main'], server);
            await run(['update-ref', 'refs/heads/main', first], server);
            const repository = new GitRepository(
                simpleGit({
                    allowEnvironment: [
                        ...GIT_REPOSITORY_ENVIRONMENT,
                        'GIT_CONFIG_GLOBAL',
                        'GIT_CONFIG_NOSYSTEM',
                    ],
                    // Only the empty config created by this fixture is trusted.
                    unsafe: { allowUnsafeConfigPaths: true },
                }).env(environment),
                checkout,
                pathToFileURL(server).href,
                'fixture',
                'main',
                environment,
                { kind: 'sparse', directories: ['analytics/dbt'] },
            );
            const refresh = () =>
                repository.refresh(
                    withSignal ? new AbortController().signal : undefined,
                );
            const assertSparseTree = async (revision: string, sql: string) => {
                expect(
                    await fs.readFile(
                        path.join(checkout, 'analytics/dbt/models/a.sql'),
                        'utf8',
                    ),
                ).toBe(sql);
                expect(
                    await fs.readFile(path.join(checkout, 'README.md'), 'utf8'),
                ).toContain('Sparse checkout integration fixture');
                expect(
                    await fs.readFile(
                        path.join(checkout, 'analytics/notes.txt'),
                        'utf8',
                    ),
                ).toContain('ancestor directories');
                await expect(
                    fs.access(path.join(checkout, 'other')),
                ).rejects.toThrow();
                await expect(
                    fs.access(path.join(checkout, 'analytics/shared')),
                ).rejects.toThrow();
                const { stdout: excludedBlob } = await run(
                    ['rev-parse', `${revision}:other/large.bin`],
                    server,
                );
                const { stdout: objects } = await run(
                    ['rev-list', '--objects', '--missing=print', 'HEAD'],
                    checkout,
                );
                expect(objects.split('\n')).toContain(`?${excludedBlob}`);
                await Promise.all(
                    [
                        ['core.sparseCheckout', 'true'],
                        ['core.sparseCheckoutCone', 'true'],
                        ['remote.origin.promisor', 'true'],
                        ['remote.origin.partialclonefilter', 'blob:none'],
                    ].map(async ([key, value]) => {
                        expect(
                            (await run(['config', '--get', key], checkout))
                                .stdout,
                        ).toBe(value);
                    }),
                );
                expect(
                    await fs.readFile(
                        path.join(checkout, '.git/info/sparse-checkout'),
                        'utf8',
                    ),
                ).toContain('/analytics/dbt/');
            };

            await refresh();
            await assertSparseTree(first, 'select 1 as id\n');
            await refresh();
            await assertSparseTree(first, 'select 1 as id\n');
            await run(['update-ref', 'refs/heads/main', second], server);
            await refresh();
            await assertSparseTree(second, 'select 2 as id\n');
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    },
    15000,
);

it.skipIf(!hasGit)(
    'does not start git for an already-cancelled sparse checkout',
    async () => {
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'sparse-git-cancel-'),
        );
        try {
            const reason = new Error('Compile cancelled before clone');
            const controller = new AbortController();
            controller.abort(reason);
            const repository = new GitRepository(
                simpleGit(),
                root,
                'https://example.test/repo.git',
                'repo',
                'main',
                {},
                { kind: 'sparse', directories: ['analytics/dbt'] },
            );
            await expect(repository.refresh(controller.signal)).rejects.toBe(
                reason,
            );
            expect(await fs.readdir(root)).toEqual([]);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    },
);
