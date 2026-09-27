import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { worktreeCwdMatches, worktreeIsFree } from './pool';

test('live cwd matching includes descendants but excludes sibling worktrees', () => {
    const root = path.resolve('/x/wt-1');
    assert.equal(worktreeCwdMatches(root, root), true);
    assert.equal(
        worktreeCwdMatches(root, path.join(root, 'packages/api')),
        true,
    );
    assert.equal(worktreeCwdMatches(root, path.resolve('/x/wt-10')), false);
    assert.equal(worktreeCwdMatches(root, path.resolve('/x/wt')), false);
});

test(
    'live cwd check rejects another process in the target worktree',
    {
        skip: !['darwin', 'linux'].includes(process.platform),
    },
    async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-adopt-'));
        const child = spawn('sleep', ['30'], { cwd: root });
        try {
            await once(child, 'spawn');
            assert.equal(await worktreeIsFree(root), false);
        } finally {
            const exited = once(child, 'exit');
            child.kill();
            await exited;
            await rm(root, { recursive: true });
        }
    },
);
