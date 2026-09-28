import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
    cleanupPlan,
    removeCleanupEntry,
    removeOwnedWarm,
    worktreeRecords,
    type CleanupRuntime,
} from './cleanup';
import { readJson, writeJson } from './io';
import { newInstance } from './model';

test('cleanup prunes only unused detached warm and tool worktrees and rechecks reservations', async () => {
    const base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-cleanup-')),
    );
    try {
        const warm = path.join(base, 'warm', '11111111-111');
        const claimed = path.join(base, 'warm', '22222222-222');
        const live = path.join(base, 'warm', '33333333-333');
        const edited = path.join(base, 'warm', '44444444-444');
        const tool = (digit: string) =>
            path.join(base, 'tools', digit.repeat(12));
        const paths = [
            warm,
            claimed,
            live,
            edited,
            tool('a'),
            tool('b'),
            tool('c'),
            tool('d'),
        ];
        for (const directory of paths)
            await mkdir(directory, { recursive: true });
        await writeJson(path.join(base, 'tool.json'), {
            directory: tool('a'),
            previousDirectory: tool('b'),
        });
        const removed: string[] = [];
        const io: CleanupRuntime = {
            references: async () =>
                `${live}/packages/backend/src/index.ts ${tool('d')}/scripts/ldenv/vite-launcher.cjs`,
            worktrees: async () =>
                paths.map((directory) => ({
                    directory,
                    detached: directory !== claimed,
                    locked: false,
                })),
            status: async (directory) =>
                directory === edited
                    ? '?? useful.txt'
                    : '!! node_modules/\n M packages/backend/src/generated/routes.ts',
            remove: async (directory) => {
                removed.push(directory);
            },
        };
        const plan = await cleanupPlan(base, base, io);
        assert.deepEqual(
            plan
                .filter((entry) => entry.remove)
                .map((entry) => entry.directory),
            [warm, tool('c')],
        );
        assert.deepEqual(removed, []);
        await removeCleanupEntry(
            plan.find((entry) => entry.directory === tool('c'))!,
            base,
            base,
            io,
        );
        assert.deepEqual(removed, [tool('c')]);
        const reserved = newInstance(warm, 'a'.repeat(40), 'spare');
        await writeJson(
            path.join(base, 'instances', `${reserved.id}.json`),
            reserved,
        );
        await assert.rejects(
            removeCleanupEntry(plan[0], base, base, io),
            /no longer safe/,
        );
        assert.deepEqual(removed, [tool('c')]);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('down removes owned spare worktrees but retains claimed paths permanently', async () => {
    const base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-retirement-')),
    );
    try {
        const directory = path.join(base, 'warm', '11111111-111');
        await mkdir(directory, { recursive: true });
        const instance = newInstance(directory, 'a'.repeat(40), 'spare');
        const removed: string[] = [];
        const io: CleanupRuntime = {
            references: async () => '',
            worktrees: async () => [
                { directory, detached: true, locked: false },
            ],
            status: async () => '!! node_modules/',
            remove: async (value) => {
                removed.push(value);
            },
        };
        await removeOwnedWarm(instance, base, base, io);
        assert.deepEqual(removed, [directory]);
        instance.kind = 'claimed';
        await removeOwnedWarm(instance, base, base, io);
        assert.deepEqual(removed, [directory]);
        assert.deepEqual(
            await readJson(
                path.join(base, 'retained-worktrees', `${instance.id}.json`),
            ),
            { directory },
        );
        assert.equal((await cleanupPlan(base, base, io))[0].remove, false);
        instance.kind = 'spare';
        io.references = async () => `${directory}/node_modules/node/bin/node`;
        await assert.rejects(
            removeOwnedWarm(instance, base, base, io),
            /Referenced by a process/,
        );
        assert.deepEqual(removed, [directory]);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('cleanup refuses symlinks and parses locked worktrees with spaced paths', async () => {
    assert.deepEqual(
        worktreeRecords(
            'worktree /tmp/a b\0HEAD abc\0detached\0locked reason\0\0',
        ),
        [
            {
                directory: '/tmp/a b',
                detached: true,
                locked: true,
                branch: undefined,
                head: 'abc',
            },
        ],
    );
    const base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-cleanup-link-')),
    );
    try {
        await mkdir(path.join(base, 'warm'));
        await symlink(os.tmpdir(), path.join(base, 'warm', '11111111-111'));
        const io: CleanupRuntime = {
            references: async () => '',
            worktrees: async () => [],
            status: async () => '',
            remove: async () => assert.fail('must not delete'),
        };
        const plan = await cleanupPlan(base, base, io);
        assert.equal(plan[0].remove, false);
        assert.match(plan[0].reason, /real directory/);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
