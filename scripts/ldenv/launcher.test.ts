import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { bundleLauncher, launcherScript, targetArguments } from './launcher';

const execFileAsync = promisify(execFile);

test('installed launcher uses a bundle and retains the tsx fallback', async () => {
    const directory = path.resolve(__dirname, '../..');
    const bundle = path.join(__dirname, `index.bundle-test-${process.pid}.cjs`);
    const launcher = path.join(__dirname, `launcher-test-${process.pid}.sh`);
    const executable = process.execPath;
    const loader = path.join(directory, 'node_modules/tsx/dist/loader.mjs');
    const entry = path.join(__dirname, 'index.ts');
    try {
        await bundleLauncher(directory, entry, bundle);
        await writeFile(
            launcher,
            launcherScript(executable, bundle, loader, entry),
        );
        const bundled = await execFileAsync('sh', [launcher, '--help']);
        assert.match(bundled.stdout, /ldenv screenshot/);
        await rm(bundle);
        const fallback = await execFileAsync('sh', [launcher, '--help']);
        assert.match(fallback.stdout, /ldenv screenshot/);
    } finally {
        await rm(bundle, { force: true });
        await rm(launcher, { force: true });
    }
});

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
