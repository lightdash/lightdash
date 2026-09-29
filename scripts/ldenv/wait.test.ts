import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { newInstance } from './model';
import { waitDecision, waitForInstance } from './wait';

test('wait distinguishes readiness from background verification and failure', () => {
    const instance = newInstance('/tmp/ldenv-wait', 'a'.repeat(40));
    assert.equal(waitDecision(instance, false), null);
    instance.phase = 'ready';
    instance.verification = {
        state: 'pending',
        checkedAt: null,
        error: null,
        timings: {},
    };
    assert.equal(waitDecision(instance, false)?.state, 'ready');
    assert.equal(waitDecision(instance, true), null);
    instance.verification.state = 'failed';
    instance.verification.error = 'chart failed';
    assert.deepEqual(waitDecision(instance, true), {
        state: 'failed',
        error: 'chart failed',
    });
});

test('wait observes a state file created after it starts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-wait-'));
    const instance = newInstance('/tmp/ldenv-wait-file', 'a'.repeat(40));
    try {
        const pending = waitForInstance(instance.id, 2, false, directory);
        instance.phase = 'ready';
        await writeFile(
            path.join(directory, `${instance.id}.json`),
            JSON.stringify(instance),
        );
        assert.equal((await pending).state, 'ready');
        assert.deepEqual(
            await waitForInstance('missing', 0, false, directory),
            { state: 'timeout' },
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
