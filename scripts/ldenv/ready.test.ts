import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { home } from './io';
import { newInstance } from './model';
import {
    claimReadyWorktree,
    promoteReadyWorktree,
    protectReadyWorktree,
    readyWorktreeChanged,
} from './ready';
import { waitDecision } from './wait';

function fixture() {
    const instance = newInstance(
        path.join(home, 'warm', '12345678-abc'),
        'a'.repeat(40),
        'spare',
    );
    instance.phase = 'ready';
    instance.readyAt = '2026-09-28T10:00:00.000Z';
    instance.startedAt = '2026-09-28T09:59:00.000Z';
    instance.readyWorktree = {
        branch: 'ready/aaaaaaa-123',
        head: instance.parent,
        parentBuiltAt: '2026-09-28T09:00:00.000Z',
    };
    return instance;
}

test('claim preserves the running generation and publishes ownership before promotion', async () => {
    const instance = fixture();
    const original = structuredClone(instance);
    const events: string[] = [];
    await promoteReadyWorktree(instance, 'process cwd', 123, {
        saveInstance: async (value) => {
            events.push(`save:${value.kind}`);
            if (value.timings.readyClaim === undefined)
                assert.equal(waitDecision(value, false), null);
        },
        processPriority: async (_value, low) => {
            events.push(`priority:${low}`);
        },
        git: async (_root, args) => {
            events.push(args.join(' '));
            return args.includes('--show-current')
                ? original.readyWorktree!.branch
                : '';
        },
    });
    assert.equal(instance.startedAt, original.startedAt);
    assert.equal(instance.readyAt, original.readyAt);
    assert.equal(instance.processStartedAt, original.processStartedAt);
    assert.equal(instance.phase, 'ready');
    assert.equal(instance.claim?.reason, 'process cwd');
    assert.equal(instance.claim?.pid, 123);
    assert.deepEqual(events.slice(0, 2), ['save:claimed', 'priority:false']);
    assert.ok(events.includes('branch -m ready/aaaaaaa-123 work/aaaaaaa-123'));
    assert.equal(waitDecision(original, false), null);
    assert.equal(waitDecision(instance, false)?.state, 'ready');
});

test('a promotion failure leaves the checkout user-owned', async () => {
    const instance = fixture();
    await assert.rejects(
        promoteReadyWorktree(instance, 'explicit claim', null, {
            saveInstance: async () => {},
            processPriority: async () => {
                throw new Error('priority denied');
            },
            git: async () => assert.fail('no git after failed promotion'),
        }),
        /priority denied/,
    );
    assert.equal(instance.kind, 'claimed');
    assert.equal(waitDecision(instance, false)?.state, 'failed');
});

test('explicit claim is idempotent and queues one refill', async () => {
    const instance = fixture();
    const locks: string[] = [];
    let promotions = 0;
    let refills = 0;
    const operations: NonNullable<Parameters<typeof claimReadyWorktree>[3]> = {
        foregroundWork: async (work) => work(),
        withLock: async (name, work) => {
            locks.push(name);
            return work();
        },
        currentState: async () => instance,
        promoteReadyWorktree: async (value) => {
            promotions += 1;
            value.kind = 'claimed';
            value.timings.readyClaim = 1;
            return value;
        },
        queuePoolRefill: async () => {
            refills += 1;
        },
    };
    await claimReadyWorktree(
        instance.worktree,
        'explicit claim',
        null,
        operations,
    );
    await claimReadyWorktree(
        instance.worktree,
        'explicit claim',
        null,
        operations,
    );
    assert.equal(promotions, 1);
    assert.equal(refills, 1);
    assert.deepEqual(locks, ['pool', instance.id, 'pool', instance.id]);
});

test('an interrupted promotion can resume without changing process timestamps', async () => {
    const instance = fixture();
    const originalStart = instance.startedAt;
    instance.kind = 'claimed';
    instance.claim = {
        at: new Date().toISOString(),
        reason: 'process cwd',
        pid: 42,
    };
    instance.error = 'Ready claim failed: priority unavailable';
    await promoteReadyWorktree(instance, 'retry', null, {
        saveInstance: async () => {},
        processPriority: async () => {},
        git: async () => 'feature/already-renamed',
    });
    assert.equal(instance.startedAt, originalStart);
    assert.equal(instance.claim.reason, 'process cwd');
    assert.equal(instance.error, null);
    assert.equal(waitDecision(instance, false)?.state, 'ready');
});

test('external cwd and git edits protect spares before retirement', async () => {
    for (const changed of [false, true]) {
        const instance = fixture();
        const protectedResult = await protectReadyWorktree(instance, {
            readyActivity: async () =>
                new Map(
                    changed
                        ? []
                        : [[instance.id, { pid: 9, command: 'agent' }]],
                ),
            readyWorktreeChanged: async () => changed,
            promoteReadyWorktree: async (value, reason) => {
                value.kind = 'claimed';
                assert.equal(
                    reason,
                    changed ? 'worktree changed' : 'process cwd',
                );
                return value;
            },
        });
        assert.equal(protectedResult, true);
        assert.equal(instance.kind, 'claimed');
    }
});

test('branch rename, commit, and source edits each claim a ready worktree', async () => {
    for (const mutation of ['none', 'branch', 'head', 'source']) {
        const instance = fixture();
        const changed = await readyWorktreeChanged(
            instance,
            async (_root, args) => {
                if (args[0] === 'branch')
                    return mutation === 'branch'
                        ? 'feature/user'
                        : instance.readyWorktree!.branch;
                if (args[0] === 'rev-parse')
                    return mutation === 'head'
                        ? 'b'.repeat(40)
                        : instance.parent;
                assert.ok(args.includes(':!packages/backend/src/generated'));
                return mutation === 'source' ? ' M source.ts' : '';
            },
        );
        assert.equal(changed, mutation !== 'none');
    }
});
