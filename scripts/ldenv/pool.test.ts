import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';
import { home } from './io';
import { newInstance, type Instance, type Parent } from './model';
import {
    claimInstance,
    publishSpare,
    retireStalePoolInstances,
    fillPool,
    inspectReadySpares,
} from './pool';

const tracing = process.env.LDENV_TRACING;
before(() => {
    delete process.env.LDENV_TRACING;
});
after(() => {
    if (tracing === undefined) delete process.env.LDENV_TRACING;
    else process.env.LDENV_TRACING = tracing;
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
        dotenv: async () => ({}),
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
    });
    assert.deepEqual(retired, [abandoned.id, 'dead']);
});

test('slow stale teardown leaves the pool available for claims and publication', async () => {
    const f = fixture();
    const stale = fixture('abcdef01-234').spare;
    stale.kind = 'warming';
    const warming = fixture('abcdef01-567').spare;
    warming.kind = 'warming';
    warming.monitorPid = 123;
    const registry = [f.spare, stale, warming];
    const locks = mutex();
    const entered = deferred();
    const release = deferred();
    const operations = {
        withLock: locks.withLock,
        instances: async () => registry,
        saveInstance: f.operations.saveInstance,
        alive: (pid: number | null) => pid === 123,
        down: async (instance: Instance) => {
            assert.equal(instance.id, stale.id);
            entered.resolve();
            await release.promise;
        },
    };
    const teardown = retireStalePoolInstances(f.spare.parent, operations);
    try {
        await entered.promise;
        assert.equal(stale.phase, 'failed');
        assert.equal(locks.held.has('pool'), false);
        assert.equal(locks.held.has(stale.id), true);
        f.operations.withLock = locks.withLock;
        f.operations.instances = operations.instances;
        assert.equal((await f.claim()).id, f.spare.id);
        await publishSpare(warming, operations);
        assert.equal(warming.kind, 'spare');
        assert.equal(locks.held.has(stale.id), true);
    } finally {
        release.resolve();
        await teardown;
    }
});

test('stale teardown rechecks generation and state after releasing the pool lock', async () => {
    for (const change of ['missing', 'phase', 'epoch', 'updated', 'kind']) {
        const f = fixture();
        f.spare.kind = 'warming';
        let registry: Instance[] = [f.spare];
        const locks = mutex();
        let acquired = 0;
        let removed = false;
        await retireStalePoolInstances(f.spare.parent, {
            withLock: async (name, work, options) => {
                if (name === f.spare.id && ++acquired === 2) {
                    assert.equal(locks.held.has('pool'), false);
                    assert.equal(f.spare.phase, 'failed');
                    const changed = structuredClone(f.spare);
                    if (change === 'phase') changed.phase = 'ready';
                    if (change === 'epoch') changed.startedAt = 'another-start';
                    if (change === 'updated')
                        changed.updatedAt = 'another-write';
                    if (change === 'kind') changed.kind = 'claimed';
                    registry = change === 'missing' ? [] : [changed];
                }
                return locks.withLock(name, work, options);
            },
            instances: async () => registry,
            saveInstance: f.operations.saveInstance,
            alive: () => false,
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
        withLock: f.operations.withLock,
        instances: async () => registry,
        saveInstance: f.operations.saveInstance,
        alive: () => false,
        instanceIsLive: async (instance: Instance) => !dead.has(instance.id),
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
        retireStalePoolInstances: (parent) =>
            retireStalePoolInstances(parent, stateOperations),
        inspectReadySpares: (parent) =>
            inspectReadySpares(parent, stateOperations),
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
