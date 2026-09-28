import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendStatus, runningBackendMode } from './backend-status';
import type { BundleState } from './bundle-state';
import { backendMode, newInstance } from './model';

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
