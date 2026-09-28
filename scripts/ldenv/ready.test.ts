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
    syncReadyPool,
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
    assert.equal(events[0], 'save:claimed');
    assert.ok(
        events.indexOf('priority:false') >
            events.indexOf('branch -m ready/aaaaaaa-123 work/aaaaaaa-123'),
    );
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
            git: async (_root, args) =>
                args.includes('--show-current')
                    ? instance.readyWorktree!.branch
                    : '',
        }),
        /priority denied/,
    );
    assert.equal(instance.kind, 'claimed');
    assert.equal(waitDecision(instance, false)?.state, 'failed');
});

test('claim removes the stable picker name before foreground promotion can fail', async () => {
    const instance = fixture();
    instance.readyWorktree = {
        ...instance.readyWorktree!,
        branch: 'ready',
        suffix: 'stable-spare',
    };
    let branch = 'ready';
    await assert.rejects(
        promoteReadyWorktree(instance, 'process cwd', 123, {
            saveInstance: async () => {},
            git: async (_root, args) => {
                if (args.includes('--show-current')) return branch;
                assert.deepEqual(args, [
                    'branch',
                    '-m',
                    'ready',
                    'work/stable-spare',
                ]);
                branch = args[3];
                return '';
            },
            processPriority: async () => {
                assert.equal(branch, 'work/stable-spare');
                throw new Error('priority denied');
            },
        }),
        /priority denied/,
    );
    assert.equal(instance.kind, 'claimed');
    assert.equal(branch, 'work/stable-spare');
    assert.equal(instance.readyWorktree.branch, 'work/stable-spare');
    assert.equal(waitDecision(instance, false)?.state, 'failed');
});

test('an owned branch rename in progress does not look like user activity', async () => {
    for (const branch of ['ready-2', 'ready']) {
        const instance = fixture();
        instance.readyWorktree = {
            ...instance.readyWorktree!,
            branch: 'ready-2',
            renaming: {
                from: 'ready-2',
                to: 'ready',
                at: new Date().toISOString(),
            },
        };
        const changed = await readyWorktreeChanged(
            instance,
            async (_root, args) => {
                if (args[0] === 'branch') return branch;
                if (args[0] === 'rev-parse') return instance.parent;
                return '';
            },
        );
        assert.equal(changed, false);
    }
});

test('claim recovery relinquishes ready when Git moved before the claim record was saved', async () => {
    const instance = fixture();
    instance.kind = 'claimed';
    instance.claim = {
        at: new Date().toISOString(),
        reason: 'process cwd',
        pid: 42,
    };
    instance.readyWorktree!.branch = 'ready';
    instance.readyWorktree!.suffix = 'recover-claim';
    await promoteReadyWorktree(instance, 'process cwd', 42, {
        saveInstance: async () => {},
        processPriority: async () => {},
        git: async (_root, args) => {
            assert.deepEqual(args, ['branch', '--show-current']);
            return 'work/recover-claim';
        },
    });
    assert.equal(instance.readyWorktree!.branch, 'work/recover-claim');
    assert.equal(waitDecision(instance, false)?.state, 'ready');
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

test('claim transfers the picker name before releasing the pool lock', async () => {
    const instance = fixture();
    const held = new Set<string>();
    let renamed = false;
    let replacementReady = false;
    await claimReadyWorktree(instance.worktree, 'process cwd', 42, {
        foregroundWork: async (work) => work(),
        withLock: async (name, work) => {
            assert.ok(!held.has(name));
            held.add(name);
            try {
                return await work();
            } finally {
                held.delete(name);
            }
        },
        currentState: async () => instance,
        promoteReadyWorktree: async (value) => {
            assert.ok(held.has('pool') && held.has(value.id));
            renamed = true;
            value.kind = 'claimed';
            return value;
        },
        reconcileReadyBranches: async (_root, options) => {
            assert.ok(renamed && held.has('pool') && !held.has(instance.id));
            assert.equal(options?.poolLockHeld, true);
            replacementReady = true;
        },
        queuePoolRefill: async () => {
            assert.ok(replacementReady);
            assert.equal(held.size, 0);
        },
    });
    assert.ok(replacementReady);
});

test('install replaces the old monitor under the pool lock before migration', async () => {
    for (const claimed of [false, true]) {
        const instance = fixture();
        if (claimed) {
            instance.kind = 'claimed';
            instance.timings.readyClaim = 1;
        }
        let poolHeld = false;
        let oldMonitorRunning = true;
        let migrated = false;
        await syncReadyPool('/tool', {
            withLock: async (name, work) => {
                assert.equal(name, 'pool');
                poolHeld = true;
                try {
                    return await work();
                } finally {
                    poolHeld = false;
                }
            },
            instances: async () => [instance],
            source: async () => '/source',
            ensurePoolMonitor: async (root) => {
                assert.equal(root, '/source');
                assert.ok(poolHeld);
                oldMonitorRunning = false;
            },
            reconcileReadyBranches: async (_root, options) => {
                assert.ok(poolHeld && !oldMonitorRunning);
                assert.equal(options?.poolLockHeld, true);
                migrated = true;
            },
        });
        assert.ok(migrated);
        assert.equal(poolHeld, false);
    }
});

test('a stale monitor observation cannot claim a renaming, retiring or failed spare', async () => {
    for (const changed of ['renaming', 'retiring', 'failed']) {
        const instance = fixture();
        const observed = structuredClone(instance);
        const operations: NonNullable<
            Parameters<typeof claimReadyWorktree>[3]
        > = {
            foregroundWork: async (work) => work(),
            withLock: async (name, work) => {
                if (name === instance.id) {
                    if (changed === 'failed') instance.phase = 'failed';
                    else if (changed === 'renaming')
                        instance.readyWorktree!.renaming = {
                            from: instance.readyWorktree!.branch,
                            to: 'ready',
                            at: new Date().toISOString(),
                        };
                    else
                        instance.readyWorktree!.retiring = {
                            branch: 'ldenv-retiring/aaaaaaa-123',
                            at: new Date().toISOString(),
                        };
                }
                return work();
            },
            currentState: async () => instance,
            promoteReadyWorktree: async () =>
                assert.fail('stale observation must not promote'),
            queuePoolRefill: async () =>
                assert.fail('stale observation must not refill'),
        };
        const result = await claimReadyWorktree(
            instance.worktree,
            'worktree changed',
            null,
            operations,
            observed,
        );
        assert.equal(result.kind, 'spare');
        assert.equal(result.claim, undefined);
    }
});

test('explicit claim rejects a spare whose teardown has started', async () => {
    const instance = fixture();
    instance.phase = 'failed';
    await assert.rejects(
        claimReadyWorktree(instance.worktree, 'explicit claim', null, {
            foregroundWork: async (work) => work(),
            withLock: async (_name, work) => work(),
            currentState: async () => instance,
            promoteReadyWorktree: async () =>
                assert.fail('failed spare must not promote'),
            queuePoolRefill: async () =>
                assert.fail('failed spare must not refill'),
        }),
        /no longer ready/,
    );
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
