import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    backendStatus,
    inspectBackendStatus,
    runningBackendMode,
} from './backend-status';
import { apiProcessGeneration, type BundleState } from './bundle-state';
import { backendMode, newInstance, type Instance } from './model';
import type { ProcessInfo } from './processes';

const instance = newInstance('/fixture/worktree', 'a'.repeat(40), 'worktree');
instance.phase = 'ready';

function bundle(
    state: BundleState['state'],
    error: string | null = null,
): BundleState {
    return {
        worktree: instance.worktree,
        supervisorPid: 10,
        apiPid: state === 'ready' ? 11 : null,
        state,
        error,
        generation: 1,
        launchedRevision: 1,
        buildMs: 10,
        builtAt: null,
        apiStartedAt: null,
    };
}

test('bundle status needs a live generation even when HTTP health succeeds', () => {
    for (const state of ['building', 'failed', 'stopped', 'ready'] as const) {
        const result = backendStatus(
            instance,
            'bundle',
            bundle(state),
            null,
            true,
        );
        assert.equal(result.ready, false, state);
        assert.equal(result.phase, 'degraded', state);
    }
    assert.equal(
        backendStatus(instance, 'bundle', null, null, true).ready,
        false,
    );
    assert.equal(
        backendStatus(instance, 'bundle', null, 'tsx-supervisor', true).ready,
        false,
    );
    assert.equal(
        backendStatus(instance, 'bundle', bundle('ready'), 'generation', true)
            .ready,
        true,
    );
});

test('bundle failure adds to existing error and clears after recovery', () => {
    const withTailError = { ...instance, error: 'scheduler failed' };
    assert.equal(
        backendStatus(
            withTailError,
            'bundle',
            bundle('failed', 'syntax error'),
            null,
            true,
        ).error,
        'scheduler failed; Bundle build failed: syntax error',
    );
    assert.equal(
        backendStatus(
            withTailError,
            'bundle',
            bundle('ready'),
            'generation',
            true,
        ).error,
        'scheduler failed',
    );
    assert.equal(
        backendStatus(instance, 'tsx', null, 'generation', true).ready,
        true,
    );
});

test('status reports the online legacy tsx API despite a saved bundle default', () => {
    assert.equal(backendMode(undefined), 'bundle');
    assert.equal(
        runningBackendMode('bundle', {
            pm2_env: { status: 'online', LDENV_BACKEND: undefined },
        }),
        'tsx',
    );
    assert.equal(
        runningBackendMode('bundle', {
            pm2_env: { status: 'stopped', LDENV_BACKEND: undefined },
        }),
        'bundle',
    );
    assert.equal(runningBackendMode('bundle', undefined), 'bundle');
});

test('status brackets HTTP health with the same owned generation in bundle and legacy tsx modes', async () => {
    for (const mode of ['bundle', 'tsx'] as const) {
        for (const change of [
            'none',
            'replace',
            'appear',
            'disappear',
        ] as const) {
            const current = {
                ...instance,
                ports: { api: 8080 } as Instance['ports'],
            };
            let api: ProcessInfo = {
                name: `${current.id}-api`,
                pid: 10,
                monit: { memory: 0 },
                pm2_env: {
                    status: 'online',
                    pm_cwd: current.worktree,
                    pm_uptime: Date.parse(current.startedAt),
                    LDENV_BACKEND: mode === 'bundle' ? 'bundle' : undefined,
                },
            };
            let present = change !== 'appear';
            let state: BundleState = {
                ...bundle('ready'),
                apiStartedAt: current.startedAt,
            };
            const events: string[] = [];
            const result = await inspectBackendStatus(current, 'bundle', {
                ownedProcesses: async () => {
                    events.push('inventory');
                    return present ? [api] : [];
                },
                bundleStatus: async () => state,
                apiProcessGeneration: async (target, process) => {
                    events.push('generation');
                    return apiProcessGeneration(target, process, {
                        alive: () => true,
                        bundleStatus: async () => state,
                    });
                },
                health: async () => {
                    events.push('health');
                    if (change === 'replace') {
                        if (mode === 'bundle')
                            state = {
                                ...state,
                                apiPid: 12,
                                generation: 2,
                                launchedRevision: 2,
                            };
                        else api = { ...api, pid: 12 };
                    }
                    if (change === 'appear') present = true;
                    if (change === 'disappear') present = false;
                    return true;
                },
            });
            assert.deepEqual(events, [
                'inventory',
                'generation',
                'health',
                'inventory',
                'generation',
            ]);
            assert.equal(result.healthy, true);
            assert.equal(result.ready, change === 'none', `${mode} ${change}`);
            if (change !== 'disappear') assert.equal(result.backend, mode);
            if (mode === 'bundle' && change === 'replace') {
                assert.equal(result.processes[0].pid, 10);
                assert.equal(result.bundle?.apiPid, 12);
                assert.equal(result.bundle?.state, 'ready');
            }
        }
    }
});
