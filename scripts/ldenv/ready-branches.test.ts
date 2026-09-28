import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import {
    assertOwnedWarmForTeardown,
    removeOwnedWarm,
    worktreeRecords,
} from './cleanup';
import { git } from './io';
import { newInstance } from './model';
import {
    hideReadyBranchForRetirement,
    publishReadyBranch,
    retireClaimedReadyBranch,
} from './ready-branches';

const command = promisify(execFile);

async function fixture() {
    const base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-ready-branch-')),
    );
    const repo = path.join(base, 'repo');
    const directory = path.join(base, 'warm', '11111111-111');
    await mkdir(repo);
    await command('git', ['init', '-q', '-b', 'main', repo]);
    await writeFile(path.join(repo, 'source.txt'), 'base\n');
    await git(repo, ['add', 'source.txt']);
    await command('git', [
        '-C',
        repo,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'base',
    ]);
    const head = await git(repo, ['rev-parse', 'HEAD']);
    await mkdir(path.dirname(directory));
    await git(repo, ['worktree', 'add', '--detach', directory, head]);
    const instance = newInstance(directory, head, 'warming');
    instance.phase = 'ready';
    return { base, repo, directory, head, instance };
}

test('publication records ownership before creating a local ready branch; retirement deletes only that ref', async () => {
    const f = await fixture();
    try {
        const saves: string[] = [];
        await publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
            git: async (cwd, args) => {
                if (args[0] === 'switch')
                    assert.equal(
                        saves[0],
                        `ready/${f.head.slice(0, 7)}-deadbeefcafe`,
                    );
                return git(cwd, args);
            },
            saveInstance: async (instance) => {
                saves.push(instance.readyWorktree?.branch ?? '');
            },
            uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
        });
        f.instance.kind = 'spare';
        const branch = f.instance.readyWorktree!.branch;
        assert.equal(
            await git(f.directory, ['branch', '--show-current']),
            branch,
        );
        const io = {
            references: async () => '',
            worktrees: async () =>
                worktreeRecords(
                    await git(f.repo, [
                        'worktree',
                        'list',
                        '--porcelain',
                        '-z',
                    ]),
                ),
            status: async (directory: string) =>
                git(directory, [
                    'status',
                    '--porcelain',
                    '--ignored',
                    '--untracked-files=normal',
                ]),
            remove: async (directory: string) => {
                await git(f.repo, ['worktree', 'remove', '--force', directory]);
            },
            refHead: (ref: string) =>
                git(f.repo, ['rev-parse', '--verify', ref]),
            deleteBranch: async (ref: string, head: string) => {
                await git(f.repo, ['update-ref', '-d', ref, head]);
            },
        };
        await removeOwnedWarm(f.instance, f.repo, f.base, io);
        assert.equal(
            await git(f.repo, [
                'for-each-ref',
                '--format=%(refname)',
                `refs/heads/${branch}`,
            ]),
            '',
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('remote branch collision fails before changing the detached checkout or ownership record', async () => {
    const f = await fixture();
    try {
        const branch = `ready/${f.head.slice(0, 7)}-deadbeefcafe`;
        const remote = path.join(f.base, 'remote.git');
        await command('git', ['init', '-q', '--bare', remote]);
        await git(f.repo, ['remote', 'add', 'origin', remote]);
        await git(f.repo, ['branch', branch, f.head]);
        await git(f.repo, ['push', 'origin', branch]);
        await git(f.repo, ['branch', '-D', branch]);
        await git(f.repo, [
            'update-ref',
            '-d',
            `refs/remotes/origin/${branch}`,
        ]);
        let saved = false;
        await assert.rejects(
            publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
                git,
                saveInstance: async () => {
                    saved = true;
                },
                uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
            }),
            /namespace collision/,
        );
        assert.equal(saved, false);
        assert.equal(f.instance.readyWorktree, undefined);
        assert.equal(await git(f.directory, ['branch', '--show-current']), '');
        assert.equal(await git(f.directory, ['rev-parse', 'HEAD']), f.head);
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('interrupted publication leaves a detached pending checkout that cleanup can retire', async () => {
    const f = await fixture();
    try {
        await assert.rejects(
            publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
                git: async (cwd, args) => {
                    if (args[0] === 'switch')
                        throw new Error('interrupted switch');
                    return git(cwd, args);
                },
                saveInstance: async () => {},
                uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
            }),
            /interrupted switch/,
        );
        assert.equal(f.instance.readyWorktree?.publication, 'pending');
        let removed = false;
        await removeOwnedWarm(f.instance, f.repo, f.base, {
            references: async () => '',
            worktrees: async () =>
                worktreeRecords(
                    await git(f.repo, [
                        'worktree',
                        'list',
                        '--porcelain',
                        '-z',
                    ]),
                ),
            status: async (directory) =>
                git(directory, [
                    'status',
                    '--porcelain',
                    '--ignored',
                    '--untracked-files=normal',
                ]),
            remove: async (directory) => {
                await git(f.repo, ['worktree', 'remove', '--force', directory]);
                removed = true;
            },
            refHead: (ref) => git(f.repo, ['rev-parse', '--verify', ref]),
        });
        assert.equal(removed, true);
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('interrupted publication deletes an exact owned ref after removing its detached worktree', async () => {
    const f = await fixture();
    try {
        await assert.rejects(
            publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
                git: async (cwd, args) => {
                    if (args[0] === 'switch') {
                        await git(cwd, ['branch', args[2], f.head]);
                        throw new Error('interrupted after ref creation');
                    }
                    return git(cwd, args);
                },
                saveInstance: async () => {},
                uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
            }),
            /interrupted after ref creation/,
        );
        const branch = f.instance.readyWorktree!.branch;
        assert.equal(
            await hideReadyBranchForRetirement(f.instance, {
                git,
                saveInstance: async () => {},
                now: () => '2026-09-28T00:00:00.000Z',
            }),
            false,
        );
        assert.equal(f.instance.readyWorktree!.retiring, undefined);
        await removeOwnedWarm(f.instance, f.repo, f.base, {
            references: async () => '',
            worktrees: async () =>
                worktreeRecords(
                    await git(f.repo, [
                        'worktree',
                        'list',
                        '--porcelain',
                        '-z',
                    ]),
                ),
            status: async (directory) =>
                git(directory, [
                    'status',
                    '--porcelain',
                    '--ignored',
                    '--untracked-files=normal',
                ]),
            remove: async (directory) => {
                await git(f.repo, ['worktree', 'remove', '--force', directory]);
            },
            refHead: (ref) => git(f.repo, ['rev-parse', '--verify', ref]),
            deleteBranch: async (ref, head) => {
                await git(f.repo, ['update-ref', '-d', ref, head]);
            },
        });
        assert.equal(
            await git(f.repo, [
                'for-each-ref',
                '--format=%(refname)',
                `refs/heads/${branch}`,
            ]),
            '',
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('retirement hides the picker branch and pre-teardown validation rejects later user edits', async () => {
    const f = await fixture();
    try {
        await publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
            git,
            saveInstance: async () => {},
            uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
        });
        f.instance.kind = 'spare';
        const readyBranch = f.instance.readyWorktree!.branch;
        await hideReadyBranchForRetirement(f.instance, {
            git,
            saveInstance: async () => {},
            now: () => '2026-09-28T00:00:00.000Z',
        });
        assert.equal(
            await git(f.directory, ['branch', '--show-current']),
            f.instance.readyWorktree!.retiring!.branch,
        );
        assert.equal(
            await git(f.repo, [
                'for-each-ref',
                '--format=%(refname)',
                `refs/heads/${readyBranch}`,
            ]),
            '',
        );
        const io = {
            references: async () => '',
            worktrees: async () =>
                worktreeRecords(
                    await git(f.repo, [
                        'worktree',
                        'list',
                        '--porcelain',
                        '-z',
                    ]),
                ),
            status: async (directory: string) =>
                git(directory, [
                    'status',
                    '--porcelain',
                    '--ignored',
                    '--untracked-files=normal',
                ]),
            remove: async () => assert.fail('must not remove'),
            refHead: (ref: string) =>
                git(f.repo, ['rev-parse', '--verify', ref]),
        };
        await assertOwnedWarmForTeardown(f.instance, f.repo, f.base, io);
        await git(f.repo, ['worktree', 'lock', f.directory]);
        await assert.rejects(
            assertOwnedWarmForTeardown(f.instance, f.repo, f.base, io),
            /Locked/,
        );
        await git(f.repo, ['worktree', 'unlock', f.directory]);
        await writeFile(path.join(f.directory, 'source.txt'), 'user edit\n');
        await assert.rejects(
            assertOwnedWarmForTeardown(f.instance, f.repo, f.base, io),
            /user edits/,
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('normal claim removes only the old owned ready ref after switching branches', async () => {
    const f = await fixture();
    try {
        await publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
            git,
            saveInstance: async () => {},
            uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
        });
        const oldBranch = f.instance.readyWorktree!.branch;
        f.instance.kind = 'claimed';
        await git(f.directory, ['switch', '-c', 'feature/test']);
        assert.equal(
            await retireClaimedReadyBranch(f.instance, oldBranch, f.head),
            true,
        );
        assert.equal(
            await git(f.repo, [
                'for-each-ref',
                '--format=%(refname)',
                `refs/heads/${oldBranch}`,
            ]),
            '',
        );
        assert.equal(
            await git(f.directory, ['branch', '--show-current']),
            'feature/test',
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('edited, renamed, and committed ready worktrees remain owned by the user', async () => {
    for (const change of ['edit', 'rename', 'commit']) {
        const f = await fixture();
        try {
            await publishReadyBranch(f.instance, '2026-09-28T00:00:00.000Z', {
                git,
                saveInstance: async () => {},
                uuid: () => 'deadbeef-cafe-0000-0000-000000000000',
            });
            f.instance.kind = 'spare';
            if (change === 'edit')
                await writeFile(
                    path.join(f.directory, 'source.txt'),
                    'user edit\n',
                );
            if (change === 'rename')
                await git(f.directory, ['branch', '-m', 'work/user']);
            if (change === 'commit') {
                await writeFile(
                    path.join(f.directory, 'source.txt'),
                    'user commit\n',
                );
                await git(f.directory, ['add', 'source.txt']);
                await command('git', [
                    '-C',
                    f.directory,
                    '-c',
                    'user.name=Test',
                    '-c',
                    'user.email=test@example.com',
                    '-c',
                    'commit.gpgsign=false',
                    'commit',
                    '-qm',
                    'user',
                ]);
            }
            let removed = false;
            await assert.rejects(
                removeOwnedWarm(f.instance, f.repo, f.base, {
                    references: async () => '',
                    worktrees: async () =>
                        worktreeRecords(
                            await git(f.repo, [
                                'worktree',
                                'list',
                                '--porcelain',
                                '-z',
                            ]),
                        ),
                    status: async (directory) =>
                        git(directory, [
                            'status',
                            '--porcelain',
                            '--ignored',
                            '--untracked-files=normal',
                        ]),
                    remove: async () => {
                        removed = true;
                    },
                    refHead: (ref) =>
                        git(f.repo, ['rev-parse', '--verify', ref]),
                }),
                /Warm worktree retained/,
                change,
            );
            assert.equal(removed, false, change);
            assert.equal(
                await git(f.directory, ['rev-parse', '--is-inside-work-tree']),
                'true',
            );
        } finally {
            await rm(f.base, { recursive: true, force: true });
        }
    }
});
