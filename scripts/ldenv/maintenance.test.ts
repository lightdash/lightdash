import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queueReadyGc, sweepStaleInstances } from './maintenance';
import { newInstance } from './model';

test('ready gc queues a detached protected stale-instance sweep', async () => {
    const instance = newInstance('/fixture/worktree', 'a'.repeat(40));
    const launches: { args: string[]; name: string }[] = [];
    await queueReadyGc(instance, {
        background: async (args, name) => {
            launches.push({ args, name });
            return 1;
        },
    });
    assert.deepEqual(launches, [
        {
            args: ['gc-stale', '--exclude-instance', instance.id],
            name: `${instance.id}-gc`,
        },
    ]);
});

test('stale-instance sweep is background work and passes the protected ID through', async () => {
    const calls: unknown[][] = [];
    let background = false;
    await sweepStaleInstances('/fixture/root', 'protected', {
        backgroundWork: async (work) => {
            background = true;
            return work();
        },
        garbageCollect: async (...args) => {
            calls.push(args);
        },
    });
    assert.equal(background, true);
    assert.deepEqual(calls, [['/fixture/root', false, undefined, 'protected']]);
});

test('maintenance launch and sweep failures are logged without failing readiness', async () => {
    const instance = newInstance('/fixture/worktree', 'a'.repeat(40));
    const warnings: string[] = [];
    const write = process.stderr.write;
    process.stderr.write = ((message: string) => {
        warnings.push(message);
        return true;
    }) as typeof write;
    try {
        await queueReadyGc(instance, {
            background: async () => {
                throw new Error('launch failed');
            },
        });
        await sweepStaleInstances('/fixture/root', undefined, {
            backgroundWork: async (work) => work(),
            garbageCollect: async () => {
                throw new Error('sweep failed');
            },
        });
        assert.match(
            warnings.join(''),
            new RegExp(`GC QUEUE SKIPPED ${instance.id}`),
        );
        assert.match(warnings.join(''), /launch failed/);
        assert.match(warnings.join(''), /GC SWEEP SKIPPED: sweep failed/);
    } finally {
        process.stderr.write = write;
    }
});
