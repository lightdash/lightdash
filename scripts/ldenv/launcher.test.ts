import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { targetArguments } from './launcher';

test('target path can precede or follow the command and leaves command options intact', () => {
    for (const args of [
        ['--worktree', '/tmp/fresh tree', 'up', '--no-wait'],
        ['up', '--no-wait', '--worktree', '/tmp/fresh tree'],
    ])
        assert.deepEqual(targetArguments(args, '/fallback'), {
            args: ['up', '--no-wait'],
            worktree: '/tmp/fresh tree',
        });
    assert.deepEqual(targetArguments(['status'], '/t3/target'), {
        args: ['status'],
        worktree: '/t3/target',
    });
    assert.equal(
        targetArguments(['up', '--worktree', '.'], '/fallback').worktree,
        path.resolve('.'),
    );
    assert.throws(() => targetArguments(['up', '--worktree'], '/fallback'));
    assert.throws(() =>
        targetArguments(['--worktree', '--no-wait'], '/fallback'),
    );
});
