import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { home } from './io';
import { newInstance, type Instance, type Parent } from './model';
import { claimInstance } from './pool';

const tracing = process.env.LDENV_TRACING;
before(() => {
    delete process.env.LDENV_TRACING;
});
after(() => {
    if (tracing === undefined) delete process.env.LDENV_TRACING;
    else process.env.LDENV_TRACING = tracing;
});

function fixture() {
    const parentSha = 'a'.repeat(40);
    const targetSha = 'b'.repeat(40);
    const worktree = path.join(home, 'warm', '12345678-abc');
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
        dirtyAfterFailure: false,
        switched: false,
        canonicalPath: worktree,
    };
    const events: string[] = [];
    const saved: Instance[] = [];
    const downKinds: Instance['kind'][] = [];
    const operations: NonNullable<Parameters<typeof claimInstance>[3]> = {
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
                    return state.deep ? 'package.json\0' : '';
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
        dotenv: async () => ({}),
        dependencies: async () => {
            throw new Error('unexpected dependencies');
        },
        runTiers: async () => {},
        changedFiles: async () => [],
        start: async () => {
            throw new Error('start failed');
        },
        cheapReady: async (instance) => {
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
