import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instanceIsLive, resumeExistingInstance } from './live';
import { newInstance, type Instance } from './model';
import type { ProcessInfo } from './processes';

test('live readiness requires owned running processes and API health', async () => {
    const instance = newInstance('/fixture/worktree', 'a'.repeat(40));
    instance.ports = { api: 8080 } as Instance['ports'];
    const processes = ['api', 'frontend'].map(
        (suffix) =>
            ({
                name: `${instance.id}-${suffix}`,
                pid: 1,
                pm2_env: { status: 'online' },
            }) as ProcessInfo,
    );
    const operations = {
        ownedProcesses: async () => processes,
        health: async () => true,
        alive: () => true,
    };
    assert.equal(await instanceIsLive(instance, operations), true);
    assert.equal(
        await instanceIsLive(instance, {
            ...operations,
            health: async () => false,
        }),
        false,
    );
    assert.equal(
        await instanceIsLive(instance, { ...operations, alive: () => false }),
        false,
    );
    processes.pop();
    assert.equal(await instanceIsLive(instance, operations), false);
});

test('up restarts stale ready state and never reports ready solely from disk', async () => {
    const instance = newInstance('/fixture/worktree', 'a'.repeat(40));
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    const events: string[] = [];
    const operations = {
        instanceIsLive: async () => false,
        saveInstance: async (state: Instance) => {
            events.push(`save ${state.phase}`);
        },
        alive: () => false,
        cancelMonitor: async () => {
            events.push('cancel monitor');
        },
        stopProcesses: async () => {
            events.push('stop owned processes');
        },
    };
    const start = async (state: Instance, noWait: boolean) => {
        assert.equal(noWait, true);
        assert.equal(state.readyAt, null);
        events.push(`start ${state.phase}`);
        state.phase = 'starting';
        return state;
    };
    assert.equal(
        (await resumeExistingInstance(instance, true, start, operations)).phase,
        'starting',
    );
    assert.deepEqual(events, [
        'cancel monitor',
        'stop owned processes',
        'save stopped',
        'start stopped',
    ]);
    await assert.rejects(
        resumeExistingInstance(instance, true, start, operations),
        /partial instance/,
    );
    instance.phase = 'ready';
    assert.equal(
        await resumeExistingInstance(instance, true, start, {
            ...operations,
            instanceIsLive: async () => true,
        }),
        instance,
    );
    assert.equal(events.length, 4);
});
