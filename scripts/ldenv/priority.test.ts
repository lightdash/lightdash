import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('background commands wait for a foreground lease, then run at low priority', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-priority-'));
    process.env.LDENV_HOME = root;
    const { backgroundWork, foregroundWork, foregroundActive, runner } =
        await import('./io.js');
    try {
        let release!: () => void;
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const foreground = foregroundWork(async () => {
            entered();
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        });
        await started;
        assert.equal(await foregroundActive(), true);
        let completed = false;
        const background = backgroundWork(async () => {
            const output = await runner.run(
                process.execPath,
                [
                    '-e',
                    "process.stdout.write(String(require('node:os').getPriority()))",
                ],
                { cwd: root },
            );
            completed = true;
            return Number(output);
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(completed, false);
        release();
        await foreground;
        assert.equal(await foregroundActive(), false);
        assert((await background) >= 10);
        await assert.rejects(
            foregroundWork(async () => {
                throw new Error('failed fork');
            }),
        );
        assert.equal(await foregroundActive(), false);
    } finally {
        await rm(root, { recursive: true });
    }
});
