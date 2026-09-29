import assert from 'node:assert/strict';
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import { git, home } from './io';
import { newInstance, type Instance, type Parent } from './model';
import {
    claimInstance,
    publishSpare,
    retireStalePoolInstances,
    fillPool,
    inspectReadySpares,
    reconcileReadyBranches,
} from './pool';
import { claimedWorkBranch } from './ready-branches';

const tracing = process.env.LDENV_TRACING;
const selectedBackend = process.env.LDENV_BACKEND;
before(() => {
    delete process.env.LDENV_TRACING;
    delete process.env.LDENV_BACKEND;
});
after(() => {
    if (tracing === undefined) delete process.env.LDENV_TRACING;
    else process.env.LDENV_TRACING = tracing;
    if (selectedBackend === undefined) delete process.env.LDENV_BACKEND;
    else process.env.LDENV_BACKEND = selectedBackend;
});

function fixture(name = '12345678-abc') {
    const parentSha = 'a'.repeat(40);
    const targetSha = 'b'.repeat(40);
    const worktree = path.join(home, 'warm', name);
    const spare = newInstance(worktree, parentSha, 'spare');
    spare.phase = 'ready';
    spare.verification = {
        state: 'passed',
        checkedAt: new Date().toISOString(),
        error: null,
        timings: {},
    };
    const parent: Parent = {
        sha: parentSha,
        path: '/fixture/parent',
        database: 'ldp_aaaaaaaaaaaa',
        warehouseDatabase: 'ldj_aaaaaaaaaaaa',
        warehouseHash: '',
        builtAt: new Date().toISOString(),
        lockHash: '',
        sourceHashes: {},
        migrations: [],
        timings: {},
        seedComplete: true,
        nodeVersion: process.version,
        pnpmVersion: '',
        platform: process.platform,
        arch: process.arch,
    };
    const state = {
        checkedOut: false,
        checkoutFails: false,
        checkoutChangesBeforeFailure: false,
        healthFails: false,
        teardownFails: false,
        refillFails: false,
        head: parentSha,
        branch: '',
        deep: false,
        backend: false,
        dirtyAfterFailure: false,
        switched: false,
        canonicalPath: worktree,
        backendMode: 'bundle' as 'bundle' | 'tsx',
    };
    const events: string[] = [];
    const saved: Instance[] = [];
    const downKinds: Instance['kind'][] = [];
    const operations: NonNullable<Parameters<typeof claimInstance>[3]> = {
        instanceIsLive: async () => true,
        realpath: async () => state.canonicalPath,
        git: async (_root, args) => {
            events.push(`git ${args.join(' ')}`);
            switch (args[0]) {
                case 'check-ref-format':
                case 'show-ref':
                    return '';
                case 'status':
                    return state.switched && state.dirtyAfterFailure
                        ? ' M source.ts'
                        : '';
                case 'worktree':
                    return state.checkedOut
                        ? 'worktree /fixture/user\0HEAD abc\0branch refs/heads/feature/test\0\0'
                        : '';
                case 'rev-parse':
                    return args.includes('HEAD') ? state.head : targetSha;
                case 'branch':
                    return state.branch;
                case 'diff':
                    return state.deep
                        ? 'package.json\0'
                        : state.backend
                          ? 'packages/backend/src/services/TestService.ts\0'
                          : '';
                case 'switch':
                    state.switched = true;
                    if (
                        !state.checkoutFails ||
                        state.checkoutChangesBeforeFailure
                    ) {
                        state.head = targetSha;
                        state.branch = 'feature/test';
                    }
                    if (state.checkoutFails) throw new Error('checkout failed');
                    return '';
                default:
                    throw new Error(`Unexpected git call: ${args.join(' ')}`);
            }
        },
        instances: async () => [spare],
        parents: async () => [parent],
        ancestor: async () => true,
        withLock: async (name, work) => {
            events.push(`lock ${name}`);
            return work();
        },
        processPriority: async (_instance, low) => {
            events.push(`priority ${low}`);
        },
        protectReadyWorktree: async () => false,
        saveInstance: async (instance) => {
            events.push(`save ${instance.kind} ${instance.phase}`);
            saved.push(structuredClone(instance));
        },
        recipeAt: async () => ({
            env: {},
            tiers: state.deep
                ? [
                      {
                          name: 'build',
                          preset: null,
                          run: 'build',
                          files: ['package.json'],
                          env: {},
                          watch: [],
                      },
                  ]
                : [],
            seed: { run: '', env: {} },
            warm: [],
            paint: { selector: '', timeout: 0 },
        }),
        stopProcesses: async () => {
            events.push('stop');
            state.healthFails = true;
        },
        stopClaimApi: async () => {
            events.push('stop-api');
            return 1000;
        },
        startClaimApi: async () => {
            events.push('start-api');
        },
        dotenv: async () => ({ LDENV_BACKEND: state.backendMode }),
        dependencies: async () => {
            throw new Error('unexpected dependencies');
        },
        runTiers: async () => {},
        changedFiles: async () => [],
        start: async () => {
            throw new Error('start failed');
        },
        cheapReady: async (instance, settleApi) => {
            if (settleApi) events.push('stable-health');
            events.push('health');
            if (state.healthFails) throw new Error('health failed');
            instance.phase = 'ready';
            instance.error = null;
            instance.verification = {
                state: 'pending',
                checkedAt: null,
                error: null,
                timings: {},
            };
        },
        background: async (args) => {
            events.push(`background ${args.join(' ')}`);
            if (state.refillFails && args[0] === 'pool')
                throw new Error('refill failed');
            return 123;
        },
        down: async (instance) => {
            events.push('down');
            downKinds.push(instance.kind);
            if (state.teardownFails) throw new Error('teardown failed');
        },
        poolSettings: async () => ({ size: 1, source: '/fixture/root' }),
        writeJson: async () => {},
    };
    return {
        spare,
        state,
        events,
        saved,
        downKinds,
        operations,
        claim: () =>
            claimInstance('/fixture/root', 'feature/test', 'HEAD', operations),
    };
}

const retirementTestHooks = {
    hideReadySpare: async (instance: Instance) => {
        if (instance.readyWorktree)
            instance.readyWorktree.retiring ??= {
                branch: `ldenv-retiring/${instance.readyWorktree.branch.slice('ready/'.length)}`,
                at: new Date().toISOString(),
                hiddenAt: new Date().toISOString(),
            };
        return Boolean(instance.readyWorktree);
    },
    waitForGrace: async () => {},
    assertOwnedWarmForTeardown: async () => {},
};

test('claim rejects a checked-out branch before reserving a spare and schedules refill', async () => {
    const f = fixture();
    f.state.checkedOut = true;
    await assert.rejects(f.claim(), /already checked out.*\/fixture\/user/);
    assert.equal(f.saved.length, 0);
    assert.equal(f.events.includes('lock pool'), false);
    assert(f.events.includes('background pool fill --size 1'));
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function mutex() {
    const held = new Set<string>();
    const tails = new Map<string, Promise<void>>();
    const context = new AsyncLocalStorage<string[]>();
    const withLock: NonNullable<
        Parameters<typeof claimInstance>[3]
    >['withLock'] = async (name, work) => {
        const nesting = context.getStore() ?? [];
        if (name === 'pool')
            assert.equal(nesting.length, 0, 'instance-to-pool lock inversion');
        const previous = tails.get(name) ?? Promise.resolve();
        const released = deferred();
        tails.set(name, released.promise);
        await previous;
        held.add(name);
        try {
            return await context.run([...nesting, name], work);
        } finally {
            held.delete(name);
            released.resolve();
        }
    };
    return { withLock, held };
}

test('a deep claim permits another reservation and spare publication while its build is pending', async () => {
    const f = fixture();
    const second = fixture('87654321-abc');
    const warming = fixture('abcdef01-234').spare;
    warming.kind = 'warming';
    const registry = [f.spare, second.spare, warming];
    const locks = mutex();
    const entered = deferred();
    const release = deferred();
    f.state.deep = true;
    f.operations.withLock = locks.withLock;
    second.operations.withLock = locks.withLock;
    f.operations.instances = second.operations.instances = async () => registry;
    f.operations.runTiers = async () => {
        entered.resolve();
        await release.promise;
    };
    f.operations.start = async (instance) => {
        instance.phase = 'ready';
        return instance;
    };
    const claim = f.claim();
    try {
        await entered.promise;
        assert.equal(locks.held.has(f.spare.id), true);
        assert.equal(locks.held.has('pool'), false);
        const other = await second.claim();
        assert.equal(other.id, second.spare.id);
        assert.equal(other.kind, 'claimed');
        assert.equal(locks.held.has(f.spare.id), true);
        await publishSpare(warming, {
            withLock: locks.withLock,
            instances: async () => registry,
            saveInstance: async () => {},
            down: async () => {
                throw new Error('unexpected down');
            },
            alive: () => false,
        });
        assert.equal(warming.kind, 'spare');
        assert.equal(locks.held.has(f.spare.id), true);
    } finally {
        release.resolve();
        await claim;
    }
});

test('spare publication waits without a deadline and bypasses foreground yielding', async () => {
    const f = fixture();
    f.spare.kind = 'warming';
    const locks = mutex();
    const held = deferred();
    const release = deferred();
    const contention = locks.withLock('pool', async () => {
        held.resolve();
        await release.promise;
    });
    await held.promise;
    let published = false;
    const publication = publishSpare(f.spare, {
        withLock: async (name, work, options) => {
            assert.equal(options?.timeoutMs, null);
            if (name === 'pool')
                assert.equal(options?.yieldToForeground, false);
            return locks.withLock(name, work, options);
        },
        instances: f.operations.instances,
        saveInstance: async () => {
            published = true;
        },
        down: f.operations.down,
        alive: () => false,
    });
    assert.equal(published, false);
    release.resolve();
    await Promise.all([contention, publication]);
    assert.equal(published, true);
    assert.equal(f.spare.kind, 'spare');
});

test('spare publication does not resurrect an instance changed while waiting', async () => {
    for (const change of ['missing', 'stopped', 'epoch', 'kind']) {
        const f = fixture();
        f.spare.kind = 'warming';
        const current = structuredClone(f.spare);
        if (change === 'stopped') current.phase = 'stopped';
        if (change === 'epoch') current.startedAt = 'another-start';
        if (change === 'kind') current.kind = 'claimed';
        await assert.rejects(
            publishSpare(f.spare, {
                withLock: mutex().withLock,
                instances: async () => (change === 'missing' ? [] : [current]),
                saveInstance: async () => {
                    throw new Error('must not write changed instance');
                },
                down: f.operations.down,
                alive: () => false,
            }),
            /changed before publication/,
        );
        assert.equal(f.spare.kind, 'warming');
    }
});

test('publication rejects a refreshed parent generation before creating a ready branch', async () => {
    const f = fixture();
    f.spare.kind = 'warming';
    const parent = (await f.operations.parents())[0];
    const refreshed = {
        ...parent,
        builtAt: new Date(Date.parse(parent.builtAt) + 1000).toISOString(),
    };
    let saved = false;
    await assert.rejects(
        publishSpare(
            f.spare,
            {
                withLock: f.operations.withLock,
                instances: async () => [f.spare],
                saveInstance: async () => {
                    saved = true;
                },
                down: f.operations.down,
                alive: () => false,
                parents: async () => [refreshed],
            },
            parent.builtAt,
            { sha: parent.sha, builtAt: parent.builtAt },
        ),
        /Parent generation changed/,
    );
    assert.equal(saved, false);
    assert.equal(f.spare.kind, 'warming');
    assert.equal(f.spare.readyWorktree, undefined);
});

test('pool retirement catches abandoned warming-ready instances but preserves live monitors and active claims', async () => {
    const f = fixture();
    const abandoned = structuredClone(f.spare);
    abandoned.kind = 'warming';
    const dead = { ...abandoned, id: 'dead', monitorPid: 99 };
    const live = { ...abandoned, id: 'live', monitorPid: 123 };
    const building = {
        ...abandoned,
        id: 'building',
        phase: 'starting' as const,
    };
    const claimed = { ...abandoned, id: 'claimed', kind: 'claimed' as const };
    const retired: string[] = [];
    await retireStalePoolInstances(f.spare.parent, {
        ...retirementTestHooks,
        withLock: mutex().withLock,
        instances: async () => [
            abandoned,
            dead,
            live,
            building,
            claimed,
            f.spare,
        ],
        down: async (instance) => {
            retired.push(instance.id);
        },
        saveInstance: f.operations.saveInstance,
        alive: (pid) => pid === 123,
        spareBackendMode: async () => 'bundle' as const,
    });
    assert.deepEqual(retired, [abandoned.id, 'dead']);
});

test('one failed spare retirement does not block the others', async () => {
    const f = fixture();
    const stuck = {
        ...structuredClone(f.spare),
        id: 'stuck',
        phase: 'failed' as const,
    };
    const next = {
        ...structuredClone(f.spare),
        id: 'next',
        phase: 'failed' as const,
    };
    const retired: string[] = [];
    await assert.rejects(
        retireStalePoolInstances(f.spare.parent, {
            ...retirementTestHooks,
            withLock: mutex().withLock,
            instances: async () => [stuck, next],
            down: async (instance) => {
                if (instance.id === 'stuck') throw new Error('lsof timed out');
                retired.push(instance.id);
            },
            saveInstance: f.operations.saveInstance,
            alive: () => false,
            spareBackendMode: async () => 'bundle' as const,
        }),
        /lsof timed out/,
    );
    assert.deepEqual(retired, ['next']);
});

test('same-SHA parent refresh retires only old named spares and checks user activity before teardown', async () => {
    const f = fixture();
    const parent = (await f.operations.parents())[0];
    const old = structuredClone(f.spare);
    old.readyWorktree = {
        branch: 'ready/aaaaaaa-oldoldoldold',
        head: parent.sha,
        parentBuiltAt: '2026-09-27T00:00:00.000Z',
    };
    const current = structuredClone(f.spare);
    current.id = 'current';
    current.worktree = '/fixture/current';
    current.readyWorktree = {
        branch: 'ready/aaaaaaa-newnewnewnew',
        head: parent.sha,
        parentBuiltAt: parent.builtAt,
    };
    const registry = [old, current];
    const retired: string[] = [];
    let protectedOld = false;
    const operations = {
        ...retirementTestHooks,
        withLock: f.operations.withLock,
        instances: async () => registry,
        saveInstance: async () => {},
        down: async (instance: Instance) => {
            retired.push(instance.id);
        },
        alive: () => false,
        spareBackendMode: async () => 'bundle' as const,
        protectReadyWorktree: async (instance: Instance) => {
            if (instance.id === old.id && protectedOld) {
                instance.kind = 'claimed';
                return true;
            }
            return false;
        },
    };
    await retireStalePoolInstances(
        parent.sha,
        operations,
        'bundle',
        parent.builtAt,
    );
    assert.deepEqual(retired, [old.id]);
    assert.equal(current.phase, 'ready');
    retired.length = 0;
    old.kind = 'spare';
    old.phase = 'ready';
    protectedOld = true;
    await retireStalePoolInstances(
        parent.sha,
        operations,
        'bundle',
        parent.builtAt,
    );
    assert.deepEqual(retired, []);
    assert.equal(old.kind, 'claimed');
});

test('an agent entering during retirement grace is claimed before runtime teardown', async () => {
    const f = fixture();
    const parent = (await f.operations.parents())[0];
    f.spare.readyWorktree = {
        branch: 'ready/aaaaaaa-oldoldoldold',
        head: parent.sha,
        parentBuiltAt: '2026-09-27T00:00:00.000Z',
        publication: 'published',
    };
    let activity = false;
    let downCalled = false;
    await retireStalePoolInstances(
        parent.sha,
        {
            withLock: f.operations.withLock,
            instances: async () => [f.spare],
            saveInstance: async () => {},
            down: async () => {
                downCalled = true;
            },
            alive: () => false,
            spareBackendMode: async () => 'bundle',
            protectReadyWorktree: async (instance) => {
                if (!activity) return false;
                instance.kind = 'claimed';
                return true;
            },
            hideReadySpare: async (instance: Instance) => {
                instance.readyWorktree!.retiring = {
                    branch: 'ldenv-retiring/aaaaaaa-oldoldoldold',
                    at: new Date().toISOString(),
                    hiddenAt: new Date().toISOString(),
                };
                return true;
            },
            waitForGrace: async () => {
                activity = true;
            },
            assertOwnedWarmForTeardown: async () => {},
        },
        'bundle',
        parent.builtAt,
    );
    assert.equal(downCalled, false);
    assert.equal(f.spare.kind, 'claimed');
    assert.equal(f.spare.phase, 'ready');
});

test('foreground claim cannot make background retirement wait on itself', async () => {
    const f = fixture();
    f.spare.kind = 'warming';
    const locks = mutex();
    const shared = new AsyncLocalStorage<boolean>();
    const foreground = new AsyncResource('foreground-claim');
    const escape = deferred();
    const withSharedLock: typeof locks.withLock = (name, work, options) =>
        locks.withLock(
            name,
            () =>
                shared.run(name === 'pool' || Boolean(shared.getStore()), work),
            options,
        );
    let claim: Promise<void> | null = null;
    const retirement = retireStalePoolInstances(f.spare.parent, {
        ...retirementTestHooks,
        withLock: withSharedLock,
        instances: async () => [f.spare],
        saveInstance: async () => {},
        alive: () => false,
        spareBackendMode: async () => 'bundle',
        down: async () => {
            claim = foreground.runInAsyncScope(() =>
                withSharedLock('pool', () =>
                    withSharedLock(f.spare.id, async () => {}),
                ),
            );
            await new Promise<void>((resolve) => setImmediate(resolve));
            if (!shared.getStore()) await Promise.race([claim, escape.promise]);
        },
    });
    let timedOut = false;
    try {
        await Promise.race([
            retirement,
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error('retirement deadlocked')),
                    200,
                ),
            ),
        ]);
    } catch {
        timedOut = true;
        escape.resolve();
        await retirement;
    }
    if (claim) await claim;
    assert.equal(
        timedOut,
        false,
        'background down waited for a claim blocked on its instance lock',
    );
});

test('retirement grace leaves the pool available, then teardown holds pool before instance', async () => {
    const f = fixture();
    const stale = fixture('abcdef01-234').spare;
    stale.kind = 'warming';
    const warming = fixture('abcdef01-567').spare;
    warming.kind = 'warming';
    warming.monitorPid = 123;
    const registry = [f.spare, stale, warming];
    const locks = mutex();
    const graceEntered = deferred();
    const graceRelease = deferred();
    const entered = deferred();
    const release = deferred();
    const operations = {
        ...retirementTestHooks,
        waitForGrace: async () => {
            graceEntered.resolve();
            await graceRelease.promise;
        },
        withLock: locks.withLock,
        instances: async () => registry,
        saveInstance: f.operations.saveInstance,
        alive: (pid: number | null) => pid === 123,
        spareBackendMode: async () => 'bundle' as const,
        down: async (instance: Instance) => {
            assert.equal(instance.id, stale.id);
            entered.resolve();
            await release.promise;
        },
    };
    const teardown = retireStalePoolInstances(f.spare.parent, operations);
    try {
        await graceEntered.promise;
        assert.equal(locks.held.has('pool'), false);
        f.operations.withLock = locks.withLock;
        f.operations.instances = operations.instances;
        assert.equal((await f.claim()).id, f.spare.id);
        await publishSpare(warming, operations);
        assert.equal(warming.kind, 'spare');
        graceRelease.resolve();
        await entered.promise;
        assert.equal(stale.phase, 'failed');
        assert.equal(locks.held.has('pool'), true);
        assert.equal(locks.held.has(stale.id), true);
    } finally {
        graceRelease.resolve();
        release.resolve();
        await teardown;
    }
});

test('a routine record write during grace does not block retirement', async () => {
    const f = fixture();
    f.spare.kind = 'warming';
    let registry: Instance[] = [f.spare];
    const locks = mutex();
    let acquired = 0;
    let removed = false;
    await retireStalePoolInstances(f.spare.parent, {
        ...retirementTestHooks,
        withLock: async (name, work, options) => {
            if (name === f.spare.id && ++acquired === 2) {
                const written = structuredClone(f.spare);
                written.updatedAt = 'monitor-heartbeat';
                registry = [written];
            }
            return locks.withLock(name, work, options);
        },
        instances: async () => registry,
        saveInstance: f.operations.saveInstance,
        alive: () => false,
        spareBackendMode: async () => 'bundle' as const,
        down: async () => {
            removed = true;
        },
    });
    assert.equal(removed, true);
});

test('stale teardown rechecks generation and state after grace under the pool lock', async () => {
    for (const change of ['missing', 'phase', 'epoch', 'kind', 'claim']) {
        const f = fixture();
        f.spare.kind = 'warming';
        let registry: Instance[] = [f.spare];
        const locks = mutex();
        let acquired = 0;
        let removed = false;
        await retireStalePoolInstances(f.spare.parent, {
            ...retirementTestHooks,
            withLock: async (name, work, options) => {
                if (name === f.spare.id && ++acquired === 2) {
                    assert.equal(locks.held.has('pool'), true);
                    assert.equal(f.spare.phase, 'ready');
                    const changed = structuredClone(f.spare);
                    if (change === 'phase') changed.phase = 'starting';
                    if (change === 'epoch') changed.startedAt = 'another-start';
                    if (change === 'kind') changed.kind = 'claimed';
                    if (change === 'claim')
                        changed.claim = {
                            at: 'during-grace',
                            reason: 'process cwd',
                            pid: 1,
                        };
                    registry = change === 'missing' ? [] : [changed];
                }
                return locks.withLock(name, work, options);
            },
            instances: async () => registry,
            saveInstance: f.operations.saveInstance,
            alive: () => false,
            spareBackendMode: async () => 'bundle' as const,
            down: async () => {
                removed = true;
            },
        });
        assert.equal(removed, false, change);
    }
});

test('production publication outwaits contention and finishes during a foreground lease', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'ldenv-publication-'),
    );
    try {
        const script = `
            const assert = require('node:assert/strict');
            const path = require('node:path');
            const { setTimeout: delay } = require('node:timers/promises');
            const { home, saveInstance, foregroundWork, foregroundActive, backgroundWork, withLock, readJson, statePath } = require(${JSON.stringify(path.join(__dirname, 'io.ts'))});
            const { newInstance } = require(${JSON.stringify(path.join(__dirname, 'model.ts'))});
            const { publishSpare } = require(${JSON.stringify(path.join(__dirname, 'pool.ts'))});
            (async () => {
                const instance = newInstance(path.join(home, 'warm/12345678-abc'), 'a'.repeat(40), 'warming');
                instance.phase = 'ready';
                await saveInstance(instance);
                const now = Date.now;
                await foregroundWork(async () => {
                    let entered;
                    let release;
                    const held = new Promise(resolve => { entered = resolve; });
                    const gate = new Promise(resolve => { release = resolve; });
                    const holder = withLock('pool', async () => { entered(); await gate; });
                    await held;
                    const publication = backgroundWork(() => publishSpare(instance));
                    publication.catch(() => {});
                    try {
                        await delay(75);
                        Date.now = () => now() + 120000;
                        await delay(75);
                        release();
                        await holder;
                        let timer;
                        try {
                            await Promise.race([
                                publication,
                                new Promise((_, reject) => {
                                    timer = setTimeout(() => reject(new Error('publication blocked by foreground lease')), 2000);
                                }),
                            ]);
                        } finally { clearTimeout(timer); }
                        assert.equal(await foregroundActive(), true);
                        assert.equal((await readJson(statePath(instance.id))).kind, 'spare');
                    } finally { Date.now = now; release(); }
                });
            })().catch(error => { console.error(error); process.exit(1); });
        `;
        await promisify(execFile)(
            process.execPath,
            ['--require', require.resolve('tsx/cjs'), '-e', script],
            {
                env: { ...process.env, LDENV_HOME: directory },
                timeout: 8000,
            },
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('claim rechecks its reservation after releasing the pool lock', async () => {
    for (const change of ['missing', 'phase', 'epoch', 'kind']) {
        const f = fixture();
        const locks = mutex();
        let acquisitions = 0;
        let registered: Instance[] = [f.spare];
        f.operations.instances = async () => registered;
        f.operations.withLock = async (name, work, options) => {
            if (name === f.spare.id && ++acquisitions === 2) {
                assert.equal(locks.held.has('pool'), false);
                assert.equal(options?.timeoutMs, null);
                const other = structuredClone(f.spare);
                if (change === 'phase') other.phase = 'stopped';
                if (change === 'epoch') other.startedAt = 'another-start';
                if (change === 'kind') other.kind = 'worktree';
                registered = change === 'missing' ? [] : [other];
            }
            return locks.withLock(name, work, options);
        };
        await assert.rejects(f.claim(), /Claim reservation changed/);
        assert.equal(
            f.events.some((event) => event.startsWith('git switch')),
            false,
        );
        assert.equal(f.events.includes('down'), false);
        assert(f.events.includes('background pool fill --size 1'));
    }
});

test('claim restores an unchanged healthy spare after checkout fails and schedules refill', async () => {
    const f = fixture();
    f.state.checkoutFails = true;
    await assert.rejects(f.claim(), /checkout failed/);
    assert.equal(f.spare.kind, 'spare');
    assert.equal(f.spare.verification?.state, 'passed');
    assert.equal(f.spare.phase, 'ready');
    assert(f.events.includes('health'));
    assert(f.events.includes('priority true'));
    assert.equal(f.events.includes('down'), false);
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim tears down a failed owned checkout and schedules refill', async () => {
    const f = fixture();
    f.state.healthFails = true;
    await assert.rejects(f.claim(), /health failed/);
    assert(f.events.includes('down'));
    assert.deepEqual(f.downKinds, ['claimed']);
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim does not recycle a partially changed checkout', async () => {
    for (const change of ['head', 'branch', 'files']) {
        const f = fixture();
        f.state.checkoutFails = true;
        f.state.checkoutChangesBeforeFailure = change !== 'files';
        if (change === 'branch') f.state.head = 'b'.repeat(40);
        f.state.dirtyAfterFailure = change === 'files';
        await assert.rejects(f.claim(), /checkout failed/);
        assert.equal(f.events.includes('health'), false, change);
        assert.deepEqual(f.downKinds, ['claimed'], change);
        assert(f.events.includes('background pool fill --size 1'));
    }
});

test('claim tears down an unchanged spare if recovery health fails after processes stop', async () => {
    const f = fixture();
    f.state.deep = true;
    f.state.checkoutFails = true;
    await assert.rejects(f.claim(), /checkout failed/);
    assert(f.events.indexOf('stop') < f.events.indexOf('health'));
    assert.deepEqual(f.downKinds, ['spare']);
    assert.equal(f.spare.phase, 'failed');
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim preserves failure and exact down command when teardown fails and still refills', async () => {
    const f = fixture();
    f.state.healthFails = true;
    f.state.teardownFails = true;
    await assert.rejects(f.claim(), (error: Error) => {
        assert.match(error.message, /health failed/);
        assert.match(error.message, /teardown failed/);
        assert(
            error.message.includes(
                `~/.ldenv/bin/ldenv down --worktree '${f.spare.worktree}'`,
            ),
        );
        return true;
    });
    assert.equal(f.spare.kind, 'claimed');
    assert.equal(f.spare.phase, 'failed');
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim refuses automatic teardown for unowned or redirected worktrees', async () => {
    for (const change of [
        'outside',
        'nested',
        'basename',
        'identity',
        'symlink',
    ]) {
        const f = fixture();
        f.state.healthFails = true;
        if (change === 'outside')
            Object.assign(
                f.spare,
                newInstance('/fixture/user', 'a'.repeat(40), 'spare'),
                { phase: 'ready' },
            );
        if (change === 'nested')
            Object.assign(
                f.spare,
                newInstance(
                    path.join(home, 'warm/nested/12345678-abc'),
                    'a'.repeat(40),
                    'spare',
                ),
                { phase: 'ready' },
            );
        if (change === 'basename')
            Object.assign(
                f.spare,
                newInstance(
                    path.join(home, 'warm/user'),
                    'a'.repeat(40),
                    'spare',
                ),
                { phase: 'ready' },
            );
        if (change === 'identity') f.spare.database = 'unowned';
        f.state.canonicalPath =
            change === 'symlink' ? '/fixture/user' : f.spare.worktree;
        await assert.rejects(f.claim(), (error: Error) => {
            assert.match(error.message, /ownership/i);
            assert.match(error.message, /down --worktree/);
            return true;
        });
        assert.equal(f.events.includes('down'), false, change);
        assert(f.events.includes('background pool fill --size 1'));
    }
});

test('claim keeps the original failure when refill also fails', async () => {
    const f = fixture();
    f.state.healthFails = true;
    f.state.teardownFails = true;
    f.state.refillFails = true;
    await assert.rejects(f.claim(), (error: Error) => {
        assert.match(error.message, /health failed/);
        assert.match(error.message, /teardown failed/);
        assert.match(error.message, /down --worktree/);
        assert.match(error.message, /pool refill failed/);
        assert.match(error.message, /Run ~\/.ldenv\/bin\/ldenv pool fill/);
        return true;
    });
});

test('claim success keeps the claimed instance and schedules verification and refill', async () => {
    const f = fixture();
    assert.equal(await f.claim(), f.spare);
    assert.equal(f.spare.kind, 'claimed');
    assert.equal(f.spare.phase, 'ready');
    assert(f.events.includes(`background verify ${f.spare.id}`));
    assert(f.events.includes('background pool fill --size 1'));
    assert.equal(f.events.includes('down'), false);
});

test('watched backend claim replaces only the API around checkout before its readiness gate', async () => {
    const f = fixture();
    f.state.backend = true;
    await f.claim();
    const checkout = f.events.indexOf('git switch feature/test');
    assert(f.events.indexOf('stop-api') >= 0);
    assert(f.events.indexOf('stop-api') < checkout);
    assert(f.events.indexOf('start-api') > checkout);
    assert(f.events.indexOf('stable-health') > f.events.indexOf('start-api'));
    assert.equal(f.events.includes('stop'), false);
});

test('shallow claim keeps its physical process epoch when resetting claim timing', async () => {
    const f = fixture();
    const physical = '2026-09-01T00:00:00.000Z';
    f.spare.startedAt = physical;
    delete f.spare.processStartedAt;
    await f.claim();
    assert.equal(f.spare.processStartedAt, physical);
    assert.notEqual(f.spare.startedAt, physical);
    assert.equal(f.events.includes('stop-api'), false);
    assert.equal(f.events.includes('stable-health'), false);
});

test('claim skips a dead ready spare under its lock and reserves a live spare', async () => {
    const f = fixture();
    const live = fixture('87654321-abc').spare;
    const locks = mutex();
    f.operations.withLock = locks.withLock;
    f.operations.instances = async () => [f.spare, live];
    f.operations.instanceIsLive = async (instance) => {
        assert.equal(locks.held.has(instance.id), true);
        assert.equal(instance.kind, 'spare');
        return instance.id === live.id;
    };
    assert.equal((await f.claim()).id, live.id);
    assert.equal(f.spare.kind, 'spare');
    assert.equal(f.spare.phase, 'failed');
    assert.equal(f.spare.readyAt, null);
    assert.match(f.spare.error ?? '', /not live/i);
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim fails with refill instructions when every ready spare is dead', async () => {
    const f = fixture();
    f.operations.instanceIsLive = async () => false;
    await assert.rejects(f.claim(), /No ready spare.*pool fill/);
    assert.equal(f.spare.kind, 'spare');
    assert.equal(f.spare.phase, 'failed');
    assert.equal(
        f.events.some((event) => event.startsWith('git switch')),
        false,
    );
    assert.equal(f.events.includes('priority false'), false);
    assert(f.events.includes('background pool fill --size 1'));
});

test('default bundle claim skips a legacy tsx spare without reserving it', async () => {
    const f = fixture();
    f.state.backendMode = 'tsx';
    await assert.rejects(f.claim(), /No ready spare/);
    assert.equal(f.spare.kind, 'spare');
    assert.equal(
        f.events.some((event) => event.startsWith('save claimed')),
        false,
    );
    assert(f.events.includes('background pool fill --size 1'));
});

test('explicit tsx claim keeps the cheap path for a tsx spare', async () => {
    const f = fixture();
    f.state.backendMode = 'tsx';
    process.env.LDENV_BACKEND = 'tsx';
    try {
        assert.equal((await f.claim()).kind, 'claimed');
        assert.equal(f.events.includes('stop'), false);
        assert(f.events.includes('health'));
    } finally {
        delete process.env.LDENV_BACKEND;
    }
});

test('claim falls back to an older compatible parent after the newest spare fails liveness', async () => {
    const f = fixture();
    const [newest] = await f.operations.parents();
    const older = {
        ...newest,
        sha: 'c'.repeat(40),
        builtAt: '2000-01-01T00:00:00.000Z',
    };
    const live = newInstance(
        path.join(home, 'warm/87654321-abc'),
        older.sha,
        'spare',
    );
    live.phase = 'ready';
    f.operations.instances = async () => [f.spare, live];
    f.operations.parents = async () => [newest, older];
    f.operations.instanceIsLive = async (instance) => instance.id === live.id;
    const claimed = await f.claim();
    assert.equal(claimed.id, live.id);
    assert.equal(claimed.parent, older.sha);
    assert.equal(f.spare.phase, 'failed');
    assert(f.events.includes('background pool fill --size 1'));
});

test('claim preserves an unverified spare when the liveness probe errors and still schedules refill', async () => {
    const f = fixture();
    f.operations.instanceIsLive = async () => {
        throw new Error('PM2 ownership cannot be verified');
    };
    await assert.rejects(f.claim(), /ownership cannot be verified/);
    assert.equal(f.spare.kind, 'spare');
    assert.equal(f.spare.phase, 'ready');
    assert.equal(f.saved.length, 0);
    assert.equal(
        f.events.some((event) => event.startsWith('git switch')),
        false,
    );
    assert(f.events.includes('background pool fill --size 1'));
});

function fillFixture() {
    const f = fixture();
    const registry = [f.spare];
    const dead = new Set<string>();
    const removed: string[] = [];
    let builds = 0;
    const stateOperations = {
        ...retirementTestHooks,
        protectReadyWorktree: async () => false,
        withLock: f.operations.withLock,
        instances: async () => registry,
        saveInstance: f.operations.saveInstance,
        alive: () => false,
        instanceIsLive: async (instance: Instance) => !dead.has(instance.id),
        spareBackendMode: async (instance: Instance) =>
            instance.id === f.spare.id ? f.state.backendMode : 'bundle',
        down: async (instance: Instance) => {
            removed.push(instance.id);
            registry.splice(
                registry.findIndex((item) => item.id === instance.id),
                1,
            );
        },
    };
    const operations: NonNullable<Parameters<typeof fillPool>[2]> = {
        backgroundWork: async (work) => work(),
        withLock: f.operations.withLock,
        yieldToForeground: async () => {},
        poolSettings: f.operations.poolSettings,
        writeJson: f.operations.writeJson,
        parents: f.operations.parents,
        localSecrets: async () => ({}),
        sweepStaleInstances: async () => {},
        retireStalePoolInstances: (parent, mode) =>
            retireStalePoolInstances(parent, stateOperations, mode),
        inspectReadySpares: (parent, mode) =>
            inspectReadySpares(parent, stateOperations, mode),
        diskGuard: async () => {},
        availableMemory: async () => 4 * 1024 ** 3,
        mkdir: async () => undefined,
        git: async () => '',
        up: async (directory, parent) => {
            builds += 1;
            assert(builds < 5, 'fill must reach the live target size');
            const instance = newInstance(directory, parent!, 'warming');
            instance.phase = 'ready';
            registry.push(instance);
            return instance;
        },
        publishSpare: (instance) => publishSpare(instance, stateOperations),
        ensurePoolMonitor: async () => {},
    };
    return { ...f, registry, dead, removed, operations, builds: () => builds };
}

test('fill replaces and retires a dead ready spare instead of counting it', async () => {
    const f = fillFixture();
    f.dead.add(f.spare.id);
    const result = await fillPool('/fixture/root', 1, f.operations);
    assert.equal(f.builds(), 1);
    assert.deepEqual(f.removed, [f.spare.id]);
    assert.equal(result.length, 1);
    assert.notEqual(result[0].id, f.spare.id);
    assert.equal(result[0].kind, 'spare');
    assert.equal(result[0].phase, 'ready');
});

test('fill retires an owned tsx spare before building the default bundle spare', async () => {
    const f = fillFixture();
    f.state.backendMode = 'tsx';
    const result = await fillPool('/fixture/root', 1, f.operations);
    assert.deepEqual(f.removed, [f.spare.id]);
    assert.equal(f.builds(), 1);
    assert.equal(result.length, 1);
    assert.notEqual(result[0].id, f.spare.id);
});

test('fill sweeps stale records before acquiring its fill lock', async () => {
    const f = fillFixture();
    let swept = false;
    f.operations.sweepStaleInstances = async () => {
        swept = true;
    };
    const originalLock = f.operations.withLock;
    f.operations.withLock = async (name, work, options) => {
        if (name === 'pool-fill') assert(swept);
        return originalLock(name, work, options);
    };
    await fillPool('/fixture/root', 1, f.operations);
    assert(swept);
});

test('a competing fill waits for publication and reuses the spare', async () => {
    const f = fillFixture();
    f.registry.length = 0;
    const locks = mutex();
    const entered = deferred();
    const competing = deferred();
    const release = deferred();
    const originalUp = f.operations.up;
    f.operations.withLock = async (name, work, options) => {
        if (name === 'pool-fill' && locks.held.has(name)) {
            competing.resolve();
            if (options?.timeoutMs !== null)
                throw new Error('ldenv is busy: pool-fill');
        }
        return locks.withLock(name, work, options);
    };
    f.operations.up = async (...args) => {
        entered.resolve();
        await release.promise;
        return originalUp(...args);
    };
    const first = fillPool('/fixture/root', 1, f.operations);
    await entered.promise;
    const second = fillPool('/fixture/root', null, f.operations);
    void second.catch(() => {});
    try {
        await competing.promise;
        release.resolve();
        const [initial, reused] = await Promise.all([first, second]);
        assert.equal(initial.length, 1);
        assert.equal(reused.length, 1);
        assert.equal(reused[0].id, initial[0].id);
        assert.equal(f.builds(), 1);
    } finally {
        release.resolve();
    }
});

test('fill recounts the live registry after publication when a claim consumes an initial spare', async () => {
    const f = fillFixture();
    const publish = f.operations.publishSpare;
    f.operations.publishSpare = async (instance) => {
        await publish(instance);
        if (f.builds() === 1) f.spare.kind = 'claimed';
    };
    const result = await fillPool('/fixture/root', 2, f.operations);
    assert.equal(f.builds(), 2);
    assert.equal(result.length, 2);
    assert(result.every((instance) => instance.kind === 'spare'));
    assert.equal(
        result.some((instance) => instance.id === f.spare.id),
        false,
    );
});

test('fill replaces a spare that dies during publication and returns only live records', async () => {
    const f = fillFixture();
    const publish = f.operations.publishSpare;
    f.operations.publishSpare = async (instance) => {
        await publish(instance);
        if (f.builds() === 1) f.dead.add(instance.id);
    };
    const result = await fillPool('/fixture/root', 2, f.operations);
    assert.equal(f.builds(), 2);
    assert.equal(f.removed.length, 1);
    assert(result.every((instance) => !f.dead.has(instance.id)));
});

test('fill inherits only the parent licence pair without replacing target flags', async () => {
    const f = fillFixture();
    f.registry.length = 0;
    const target = {
        LDENV_TRACING: 'true',
        AI_COPILOT_ENABLED: 'false',
        LDENV_STANDALONE_SCHEDULER: 'false',
    };
    f.operations.localSecrets = async (root): Promise<Record<string, string>> =>
        root === '/fixture/root'
            ? { ...target }
            : {
                  LIGHTDASH_LICENSE_KEY: 'parent-key',
                  LIGHTDASH_LICENSE_CERTIFICATE: 'parent-certificate',
                  LDENV_TRACING: 'false',
                  AI_COPILOT_ENABLED: 'true',
                  LDENV_STANDALONE_SCHEDULER: 'true',
              };
    const up = f.operations.up;
    f.operations.up = async (...args) => {
        assert.deepEqual(args[4], {
            ...target,
            LDENV_BACKEND: 'bundle',
            LIGHTDASH_LICENSE_KEY: 'parent-key',
            LIGHTDASH_LICENSE_CERTIFICATE: 'parent-certificate',
        });
        return up(...args);
    };
    await fillPool('/fixture/root', 1, f.operations);
    assert.equal(f.builds(), 1);
});

test('fill rehomes the pool monitor when an existing named spare already meets the target', async () => {
    const f = fillFixture();
    const parent = (await f.operations.parents())[0];
    f.spare.readyWorktree = {
        branch: 'ready/aaaaaaa-existing0000',
        head: parent.sha,
        parentBuiltAt: parent.builtAt,
    };
    let monitors = 0;
    f.operations.ensurePoolMonitor = async () => {
        monitors += 1;
    };
    const result = await fillPool('/fixture/root', 1, f.operations);
    assert.equal(result.length, 1);
    assert.equal(f.builds(), 0);
    assert.equal(monitors, 1);
});

test('a zero-sized pool retires a current named spare after ownership protection', async () => {
    const f = fixture();
    const parent = (await f.operations.parents())[0];
    f.spare.readyWorktree = {
        branch: 'ready/aaaaaaa-existing0000',
        head: parent.sha,
        parentBuiltAt: parent.builtAt,
    };
    const retired: string[] = [];
    let protectedCount = 0;
    await retireStalePoolInstances(
        parent.sha,
        {
            ...retirementTestHooks,
            withLock: f.operations.withLock,
            instances: async () => [f.spare],
            saveInstance: async () => {},
            down: async (instance) => {
                retired.push(instance.id);
            },
            alive: () => false,
            spareBackendMode: async () => 'bundle',
            protectReadyWorktree: async () => {
                protectedCount += 1;
                return false;
            },
        },
        'bundle',
        parent.builtAt,
        0,
    );
    assert.deepEqual(retired, [f.spare.id]);
    assert.equal(protectedCount, 3);
});

async function stableReadyFixture(branches: string[]) {
    const base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'ldenv-stable-pool-')),
    );
    const root = path.join(base, 'repo');
    await mkdir(root);
    const command = promisify(execFile);
    await command('git', ['init', '-q', '-b', 'main', root]);
    await writeFile(path.join(root, 'source.txt'), 'base\n');
    await git(root, ['add', 'source.txt']);
    await command('git', [
        '-C',
        root,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'base',
    ]);
    const head = await git(root, ['rev-parse', 'HEAD']);
    const parent = {
        ...(await fixture().operations.parents())[0],
        sha: head,
        path: root,
        builtAt: '2026-09-28T02:00:00.000Z',
    };
    const records: Instance[] = [];
    const healthy = new Set<string>();
    for (const [index, branch] of branches.entries()) {
        const directory = path.join(base, `warm-${index}`);
        await git(root, ['worktree', 'add', '--detach', directory, head]);
        await git(directory, ['switch', '-c', branch, head]);
        const instance = newInstance(directory, head, 'spare');
        instance.phase = 'ready';
        instance.readyAt = `2026-09-28T02:00:0${index}.000Z`;
        instance.readyWorktree = {
            branch,
            head,
            parentBuiltAt: parent.builtAt,
            publication: 'published',
            ...(branch.startsWith('ready/')
                ? {}
                : { suffix: `${head.slice(0, 7)}-${index}` }),
        };
        records.push(instance);
        healthy.add(instance.id);
    }
    let poolHeld = false;
    const locks: string[] = [];
    const operations: NonNullable<
        Parameters<typeof reconcileReadyBranches>[2]
    > = {
        withLock: async (name, work) => {
            if (name === 'pool') {
                assert.equal(poolHeld, false);
                poolHeld = true;
                try {
                    return await work();
                } finally {
                    poolHeld = false;
                }
            }
            assert.equal(poolHeld, true);
            locks.push(name);
            return work();
        },
        instances: async () => records,
        parents: async () => [parent],
        instanceIsLive: async (instance) => healthy.has(instance.id),
        protectReadyWorktree: async () => false,
        saveInstance: async () => {},
        git,
        assertReadyRenameOwnership: async () => {},
    };
    return { base, root, head, parent, records, healthy, locks, operations };
}

test('reconcile migrates two owned legacy refs before assigning one primary and one secondary', async () => {
    const f = await stableReadyFixture([
        'ready/legacy-old',
        'ready/legacy-next',
    ]);
    try {
        await reconcileReadyBranches(f.root, {}, f.operations);
        assert.deepEqual(
            f.records.map((instance) => instance.readyWorktree?.branch),
            ['ready', 'ready-2'],
        );
        assert.equal(
            await git(f.root, [
                'for-each-ref',
                '--format=%(refname)',
                'refs/heads/ready/',
            ]),
            '',
        );
        assert.deepEqual(
            f.locks.slice(0, 2).sort(),
            f.records.map((item) => item.id).sort(),
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('unknown legacy ref and mismatched owned HEAD abort migration without moving a ref', async () => {
    for (const mismatch of ['unowned', 'head']) {
        const f = await stableReadyFixture(['ready/legacy-owned']);
        try {
            if (mismatch === 'unowned')
                await git(f.root, ['branch', 'ready/unowned', f.head]);
            else f.records[0].readyWorktree!.head = 'b'.repeat(40);
            await assert.rejects(
                reconcileReadyBranches(f.root, {}, f.operations),
                /Unowned ready branch|ownership changed/,
            );
            assert.equal(
                await git(f.records[0].worktree, ['branch', '--show-current']),
                'ready/legacy-owned',
            );
            assert.equal(f.records[0].readyWorktree?.renaming, undefined);
        } finally {
            await rm(f.base, { recursive: true, force: true });
        }
    }
});

test('a same-SHA stale primary loses ready before the current generation is promoted', async () => {
    const f = await stableReadyFixture(['ready', 'ready-2']);
    try {
        f.records[0].readyWorktree!.parentBuiltAt = '2026-09-28T01:00:00.000Z';
        await reconcileReadyBranches(f.root, {}, f.operations);
        assert.match(f.records[0].readyWorktree!.branch, /^ldenv-spare\//);
        assert.equal(f.records[1].readyWorktree?.branch, 'ready');
        assert.equal(
            await git(f.records[0].worktree, ['branch', '--show-current']),
            f.records[0].readyWorktree?.branch,
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('claim observed during promotion restarts selection and assigns ready to the other spare', async () => {
    const f = await stableReadyFixture(['ready-2', 'ready-3']);
    try {
        let firstChecks = 0;
        f.operations.protectReadyWorktree = async (instance) => {
            if (instance.id !== f.records[0].id) return false;
            firstChecks += 1;
            if (firstChecks !== 2) return false;
            const work = claimedWorkBranch(instance);
            await git(instance.worktree, [
                'branch',
                '-m',
                instance.readyWorktree!.branch,
                work,
            ]);
            instance.kind = 'claimed';
            instance.claim = {
                at: '2026-09-28T02:00:01.000Z',
                reason: 'observed user activity',
                pid: 123,
            };
            return true;
        };
        await reconcileReadyBranches(f.root, {}, f.operations);
        assert.equal(f.records[0].kind, 'claimed');
        assert.equal(
            await git(f.records[0].worktree, ['branch', '--show-current']),
            claimedWorkBranch(f.records[0]),
        );
        assert.equal(f.records[1].readyWorktree?.branch, 'ready');
        assert.equal(
            await git(f.records[1].worktree, ['branch', '--show-current']),
            'ready',
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('retirement hides an old primary while a live replacement is promoted', async () => {
    const f = await stableReadyFixture(['ready', 'ready-2']);
    try {
        f.records[0].readyWorktree!.retiring = {
            branch: `ldenv-retiring/${f.records[0].readyWorktree!.suffix}`,
            at: '2026-09-28T02:00:01.000Z',
        };
        await reconcileReadyBranches(f.root, {}, f.operations);
        assert.match(
            await git(f.records[0].worktree, ['branch', '--show-current']),
            /^ldenv-retiring\//,
        );
        assert.equal(f.records[1].readyWorktree?.branch, 'ready');
        assert.equal(
            f.records[0].readyWorktree?.retiring?.hiddenAt !== undefined,
            true,
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('stable inventory reconciles without querying remote refs or missing claimed paths', async () => {
    const f = await stableReadyFixture(['ready', 'ready-2']);
    try {
        const historical = newInstance(
            path.join(f.base, 'already-removed'),
            f.head,
            'claimed',
        );
        historical.readyWorktree = {
            branch: 'ready-9',
            head: f.head,
            parentBuiltAt: f.parent.builtAt,
            publication: 'published',
            suffix: 'old-claim',
        };
        f.records.push(historical);
        f.operations.git = async (cwd, args) => {
            assert.notEqual(args[0], 'ls-remote');
            assert.notEqual(cwd, historical.worktree);
            return git(cwd, args);
        };
        await reconcileReadyBranches(f.root, {}, f.operations);
        assert.deepEqual(
            f.records.slice(0, 2).map((item) => item.readyWorktree?.branch),
            ['ready', 'ready-2'],
        );
    } finally {
        await rm(f.base, { recursive: true, force: true });
    }
});

test('normal claim moves the named branch before releasing the pool reservation', async () => {
    const f = fixture();
    const parent = (await f.operations.parents())[0];
    f.spare.readyWorktree = {
        branch: 'ready',
        head: parent.sha,
        parentBuiltAt: parent.builtAt,
        publication: 'published',
        suffix: 'stable-test',
    };
    f.state.branch = 'ready';
    const refs = new Map([['ready', parent.sha]]);
    const originalGit = f.operations.git;
    f.operations.git = async (cwd, args) => {
        if (args[0] === 'remote') return '';
        if (args[0] === 'for-each-ref')
            return [...refs.keys()]
                .filter((branch) =>
                    args[args.length - 1]?.startsWith('refs/heads/')
                        ? `refs/heads/${branch}` === args[args.length - 1]
                        : true,
                )
                .map((branch) => `refs/heads/${branch}`)
                .join('\n');
        if (
            args[0] === 'rev-parse' &&
            args[1] === '--verify' &&
            args[2]?.startsWith('refs/heads/') &&
            !args[2].includes('^{commit}')
        ) {
            const branch = args[2]?.replace('refs/heads/', '');
            if (branch && refs.has(branch)) return refs.get(branch)!;
            throw new Error(`Missing ref ${branch}`);
        }
        if (args[0] === 'branch' && args[1] === '-m') {
            assert.equal(f.spare.kind, 'spare');
            assert.equal(f.state.branch, args[2]);
            refs.set(args[3], refs.get(args[2])!);
            refs.delete(args[2]);
            f.state.branch = args[3];
            return '';
        }
        if (args[0] === 'update-ref') {
            assert.equal(args[1], '-d');
            assert.equal(
                refs.get(args[2].slice('refs/heads/'.length)),
                args[3],
            );
            refs.delete(args[2].slice('refs/heads/'.length));
            return '';
        }
        return originalGit(cwd, args);
    };
    const originalLock = f.operations.withLock;
    let reservationReleased = false;
    f.operations.withLock = async (name, work, options) => {
        const result = await originalLock(name, work, options);
        if (name === 'pool') {
            reservationReleased = true;
            assert.equal(f.spare.kind, 'claimed');
            assert.equal(f.spare.readyWorktree?.branch, 'work/stable-test');
            assert.equal(f.state.branch, 'work/stable-test');
            assert.equal(refs.has('ready'), false);
        }
        return result;
    };
    await f.claim();
    assert.equal(reservationReleased, true);
    assert.equal(f.state.branch, 'feature/test');
    assert.equal(f.spare.readyWorktree?.branch, 'feature/test');
    assert.equal(refs.has('work/stable-test'), false);
    assert.equal(refs.has('ready'), false);
});
