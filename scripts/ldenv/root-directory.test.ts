import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { statePath } from './io';
import { recordedRootDirectory } from './lifecycle';
import { instanceId } from './model';

const unregistered = async () => {
    throw new Error('git failed (128): fatal: not a git repository');
};

test('an unregistered folder with a recorded instance resolves to itself', async () => {
    const directory = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-root-')),
    );
    try {
        const recorded = statePath(instanceId(directory));
        assert.equal(
            await recordedRootDirectory(directory, {
                rootDirectory: unregistered,
                exists: (file) => file === recorded,
            }),
            directory,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('an unregistered folder without a recorded instance keeps the git error', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-root-'));
    try {
        await assert.rejects(
            recordedRootDirectory(directory, {
                rootDirectory: unregistered,
                exists: () => false,
            }),
            /not a git repository/,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('a registered worktree still resolves through git', async () => {
    assert.equal(
        await recordedRootDirectory('/anywhere', {
            rootDirectory: async () => '/repo/root',
            exists: () => {
                throw new Error('should not look up instances');
            },
        }),
        '/repo/root',
    );
});
