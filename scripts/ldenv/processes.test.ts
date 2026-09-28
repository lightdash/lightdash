import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { runner } from './io';
import { json, newInstance, type Ports, type Instance } from './model';
import {
    checkClaimEndpoints,
    checkForegroundReady,
    paintVerificationUpdate,
    claimVerificationUpdate,
    verifyClaim,
    stableReady,
    stopClaimApi,
    startClaimApi,
    type ProcessInfo,
} from './processes';

function claimAttempt(): Instance {
    const instance = newInstance(
        '/tmp/ldenv-claim-verification',
        'a'.repeat(40),
        'claimed',
    );
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    instance.monitorPid = process.pid;
    instance.verification = {
        state: 'pending',
        checkedAt: null,
        error: null,
        timings: {},
    };
    return instance;
}

test('claim verification preserves independent errors and refuses stale state', () => {
    const attempt = claimAttempt();
    const update = (current: Instance, failure: string | null = null) =>
        claimVerificationUpdate(
            current,
            attempt,
            failure,
            { paint: 12, chart: 34 },
            new Date().toISOString(),
        );
    const degraded = {
        ...attempt,
        phase: 'degraded' as const,
        error: 'Startup tail failed',
    };
    const passed = update(degraded);
    assert.equal(passed?.phase, 'degraded');
    assert.equal(passed?.error, 'Startup tail failed');
    assert.equal(passed?.verification?.state, 'passed');
    const failed = update(degraded, 'chart failed');
    assert.match(failed?.error ?? '', /Startup tail failed.*chart failed/);
    assert.equal(failed?.monitorPid, null);
    for (const current of [
        { ...attempt, phase: 'stopped' as const },
        { ...attempt, startedAt: 'new-claim' },
        { ...attempt, processStartedAt: 'new-processes' },
        { ...attempt, readyAt: 'new-ready' },
        { ...attempt, monitorPid: process.pid + 1 },
        { ...attempt, monitorPid: null },
        {
            ...attempt,
            verification: {
                ...attempt.verification!,
                state: 'passed' as const,
            },
        },
    ])
        assert.equal(update(current), null);
});

test('claim verifier retries a real HTTP disconnect and API restart before publishing success', async () => {
    let generation = 'old';
    let restart: Promise<void> = Promise.resolve();
    let first = true;
    let port = 0;
    const server = createServer((request, response) => {
        if (request.url === '/api/v1/user' && first) {
            first = false;
            restart = (async () => {
                server.closeAllConnections();
                await new Promise<void>((resolve, reject) =>
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    ),
                );
                server.listen(port, '127.0.0.1');
                await once(server, 'listening');
                generation = 'new';
            })();
            return;
        }
        response.setHeader('Connection', 'close');
        response.end(
            request.url === '/api/v1/user'
                ? JSON.stringify({
                      status: 'ok',
                      results: { userUuid: 'seed-user' },
                  })
                : 'ok',
        );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    port = address.port;
    let current = claimAttempt();
    const attempt = structuredClone(current);
    let checks = 0;
    try {
        await verifyClaim(attempt, {
            lockedInstanceState: async (_id, work) => work(),
            currentState: async () => structuredClone(current),
            saveInstance: async (next) => {
                current = next;
            },
            apiGeneration: async () => generation,
            stableReady: (instance, check) =>
                stableReady(instance, check, {
                    waitForFrontend: async () => {},
                    settledApiGeneration: async () => {
                        await restart;
                        return generation;
                    },
                }),
            checkReady: async () => {
                checks += 1;
                await checkClaimEndpoints(
                    { api: port, frontend: port },
                    'test-token',
                );
            },
        });
        assert.equal(generation, 'new');
        assert.equal(checks, 2);
        assert.equal(current.verification?.state, 'passed');
        assert.equal(current.phase, 'ready');
    } finally {
        await restart;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

test('claim verifier retries a generation changed before publication and ignores a stopped instance', async () => {
    for (const change of ['changed', 'missing', 'stopped']) {
        const stop = change === 'stopped';
        let current = claimAttempt();
        const attempt = structuredClone(current);
        let generation: string | null = 'first';
        let checks = 0;
        let locks = 0;
        let writes = 0;
        await verifyClaim(attempt, {
            lockedInstanceState: async (_id, work) => {
                locks += 1;
                if (locks === 2) {
                    generation = change === 'missing' ? null : 'second';
                    if (stop) current.phase = 'stopped';
                }
                return work();
            },
            currentState: async () => structuredClone(current),
            saveInstance: async (next) => {
                writes += 1;
                current = next;
            },
            apiGeneration: async () => generation,
            stableReady: async (_instance, check) => {
                if (generation === null) generation = 'second';
                await check();
            },
            checkReady: async () => {
                checks += 1;
            },
        });
        assert.equal(checks, stop ? 1 : 2);
        assert.equal(writes, stop ? 0 : 1);
        assert.equal(current.phase, stop ? 'stopped' : 'ready');
    }
});

test('claim verifier publishes precheck and API inventory failures without leaving pending state', async () => {
    for (const precheck of [true, false]) {
        let current = claimAttempt();
        let checks = 0;
        let inventories = 0;
        let gates = 0;
        await verifyClaim(structuredClone(current), {
            lockedInstanceState: async (_id, work) => work(),
            currentState: async () => structuredClone(current),
            saveInstance: async (next) => {
                current = next;
            },
            stableReady: async (_instance, check) => {
                gates += 1;
                if (precheck) throw new Error('Frontend module warmup failed');
                await check();
            },
            apiGeneration: async () => {
                inventories += 1;
                if (inventories > 1) throw new Error('inventory failed');
                return 'api-generation';
            },
            checkReady: async () => {
                checks += 1;
            },
        });
        assert.equal(gates, 1);
        assert.equal(checks, precheck ? 0 : 1);
        assert.equal(inventories, precheck ? 0 : 2);
        assert.equal(current.phase, 'degraded');
        assert.equal(current.verification?.state, 'failed');
        assert.equal(current.monitorPid, null);
        assert.match(
            current.error ?? '',
            precheck ? /warmup failed/ : /inventory failed/,
        );
    }
});

test('API replacement deletes only the owned API and starts it after debounce and compilers', async () => {
    const instance = claimAttempt();
    const records: ProcessInfo[] = ['api', 'frontend', 'common-watch'].map(
        (name) => ({
            name: `${instance.id}-${name}`,
            pid: 123,
            monit: { memory: 0 },
            pm2_env: {
                pm_cwd: instance.worktree,
                pm_uptime: 1,
                status: 'online',
                watch_delay: 1500,
            },
        }),
    );
    const events: string[] = [];
    const debounce = await stopClaimApi(instance, {
        ownedProcesses: async () => records,
        pm2: async (args) => {
            assert.deepEqual(args, ['delete', `${instance.id}-api`]);
            events.push('delete-api');
            records.shift();
            return '';
        },
    });
    await startClaimApi(instance, debounce, {
        delay: async (ms) => {
            events.push(`delay-${ms}`);
        },
        waitForCompilers: async () => {
            events.push('compilers');
        },
        startProcesses: async (_instance, stage) => {
            events.push(`start-${stage}`);
        },
    });
    assert.deepEqual(events, [
        'delete-api',
        'delay-1500',
        'compilers',
        'start-api',
    ]);
    assert.equal(records.length, 2);
});

test('compiler and frontend gates retain the physical epoch across a shallow claim', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'ldenv-claim-epoch-'),
    );
    try {
        const script = `
            const path = require('node:path');
            const { home, writeJson } = require(${JSON.stringify(path.join(__dirname, 'io.ts'))});
            const { newInstance } = require(${JSON.stringify(path.join(__dirname, 'model.ts'))});
            const { compilerDirectory, compilerNames, waitForCompilers } = require(${JSON.stringify(path.join(__dirname, 'readiness.ts'))});
            const { waitForFrontend } = require(${JSON.stringify(path.join(__dirname, 'processes.ts'))});
            (async () => {
                const instance = newInstance(path.join(home, 'worktree'), 'a'.repeat(40));
                instance.processStartedAt = '2026-09-01T00:00:00.000Z';
                instance.startedAt = '2026-09-02T00:00:00.000Z';
                for (const name of compilerNames) await writeJson(path.join(compilerDirectory(instance), name + '.json'), {
                    epoch: instance.processStartedAt, state: 'settled', errors: 0, at: Date.now() - 2000,
                });
                await writeJson(path.join(compilerDirectory(instance), 'frontend.json'), {
                    pid: 123, status: 'ready', startedAt: Date.parse(instance.processStartedAt) + 100, modules: 1,
                });
                await waitForCompilers(instance);
                await waitForFrontend(instance, { ownedProcesses: async () => [{name: instance.id + '-frontend', pid: 123}] });
            })().catch(error => { console.error(error); process.exit(1); });
        `;
        await promisify(execFile)(
            process.execPath,
            ['--require', require.resolve('tsx/cjs'), '-e', script],
            {
                env: { ...process.env, LDENV_HOME: directory },
                timeout: 3000,
            },
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('cheap claims require live health, frontend and authenticated user responses', async () => {
    let failingPath: string | null = null;
    const server = createServer((request, response) => {
        response.statusCode = request.url === failingPath ? 503 : 200;
        if (request.url === '/api/v1/user') {
            if (request.headers.authorization !== 'ApiKey test-token')
                response.statusCode = 401;
            response.end(
                JSON.stringify({
                    status: 'ok',
                    results: { userUuid: 'seed-user' },
                }),
            );
        } else response.end('ok');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const ports = { api: address.port, frontend: address.port };
    try {
        await checkClaimEndpoints(ports, 'test-token');
        await assert.rejects(checkClaimEndpoints(ports, 'wrong-token'));
        for (const route of ['/', '/api/v1/health', '/api/v1/user']) {
            failingPath = route;
            await assert.rejects(checkClaimEndpoints(ports, 'test-token'));
        }
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
});

test('foreground readiness checks health, frontend HTTP and authenticated chart rows without paint', async () => {
    const chart = '12345678-1234-1234-1234-123456789abc';
    let chartStatus = 200;
    let chartRows: unknown[] = [{ id: 1 }];
    let token = 'test-token';
    let rootStatus = 200;
    const server = createServer((request, response) => {
        if (request.url === `/api/v1/saved/${chart}/results`) {
            response.statusCode =
                request.headers.authorization === `ApiKey ${token}`
                    ? chartStatus
                    : 401;
            response.end(
                JSON.stringify({
                    status: 'ok',
                    results: { rows: chartRows },
                }),
            );
            return;
        }
        response.statusCode = request.url === '/' ? rootStatus : 200;
        response.end('ok');
    });
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-foreground-'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const instance = newInstance(root, 'parent');
    instance.ports = {
        api: address.port,
        frontend: address.port,
    } as Ports;
    try {
        await writeFile(
            path.join(root, 'rainbow.toml'),
            await readFile(path.join(__dirname, '../../rainbow.toml')),
        );
        await writeFile(
            path.join(root, '.env.development.local'),
            'LDPAT=test-token\n',
        );
        await checkForegroundReady(instance, async () => chart);
        assert(instance.timings.backendHealth >= 0);
        assert(instance.timings.chart >= 0);
        assert(instance.timings.warm >= 0);
        assert.equal(instance.timings.paint, undefined);
        chartStatus = 401;
        await assert.rejects(
            checkForegroundReady(instance, async () => chart),
            /Seeded chart query did not return rows/,
        );
        chartStatus = 200;
        const recipe = await readFile(path.join(root, 'rainbow.toml'), 'utf8');
        assert(recipe.includes('routes = ["/", "/login"]'));
        await writeFile(
            path.join(root, 'rainbow.toml'),
            recipe.replace('routes = ["/", "/login"]', 'routes = []'),
        );
        rootStatus = 503;
        await assert.rejects(
            checkForegroundReady(instance, async () => chart),
            /Warm route \/ returned 503/,
        );
        rootStatus = 200;
        chartRows = [];
        await assert.rejects(
            checkForegroundReady(instance, async () => chart),
            /Seeded chart query did not return rows/,
        );
        chartRows = [{ id: 1 }];
        token = 'another-token';
        await assert.rejects(
            checkForegroundReady(instance, async () => chart),
            /Seeded chart query did not return rows/,
        );
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
        await rm(root, { recursive: true });
    }
});

test('paint failure degrades the active fork without changing its foreground ready time', () => {
    const instance = newInstance('/tmp/ldenv-paint-fork', 'parent');
    instance.phase = 'ready';
    instance.readyAt = '2026-09-28T12:00:00.000Z';
    instance.monitorPid = 12345;
    instance.timings = { chart: 17, ready: 28, timeToReady: 450 };
    instance.verification = {
        state: 'pending',
        checkedAt: null,
        error: null,
        timings: {},
    };
    const attempt = {
        id: instance.id,
        startedAt: instance.startedAt,
        readyAt: instance.readyAt,
        monitorPid: 12345,
    };
    const failed = paintVerificationUpdate(
        instance,
        attempt,
        'selector missing',
        900,
        '2026-09-28T12:00:01.000Z',
    );
    assert(failed);
    assert.equal(failed.phase, 'degraded');
    assert.equal(failed.verification?.state, 'failed');
    assert.match(failed.error ?? '', /selector missing/);
    assert.equal(failed.monitorPid, null);
    assert.equal(failed.timings.timeToReady, 450);
    assert.equal(failed.verification.timings.chart, 17);
    const tailDegraded = paintVerificationUpdate(
        {
            ...instance,
            phase: 'degraded',
            error: 'Startup tail failed: scheduler unavailable',
        },
        attempt,
        null,
        800,
        '2026-09-28T12:00:01.000Z',
    );
    assert(tailDegraded);
    assert.equal(tailDegraded.phase, 'degraded');
    assert.equal(tailDegraded.verification?.state, 'passed');
    assert.equal(
        tailDegraded.error,
        'Startup tail failed: scheduler unavailable',
    );
    assert.equal(
        tailDegraded.timings.timeToVerified,
        Date.parse('2026-09-28T12:00:01.000Z') - Date.parse(instance.startedAt),
    );
});

test('stale paint verification cannot resurrect a stopped or restarted fork', () => {
    const instance = newInstance('/tmp/ldenv-paint-stale', 'parent');
    instance.phase = 'ready';
    instance.readyAt = '2026-09-28T12:00:00.000Z';
    instance.monitorPid = 12345;
    instance.verification = {
        state: 'pending',
        checkedAt: null,
        error: null,
        timings: {},
    };
    const attempt = {
        id: instance.id,
        startedAt: instance.startedAt,
        readyAt: instance.readyAt,
        monitorPid: 12345,
    };
    const update = (current: typeof instance) =>
        paintVerificationUpdate(
            current,
            attempt,
            null,
            900,
            '2026-09-28T12:00:01.000Z',
        );
    assert.equal(update({ ...instance, phase: 'stopped' }), null);
    assert.equal(
        update({ ...instance, startedAt: '2026-09-28T12:00:02.000Z' }),
        null,
    );
    assert.equal(update({ ...instance, monitorPid: 54321 }), null);
    assert.equal(
        update({ ...instance, readyAt: '2026-09-28T12:00:02.000Z' }),
        null,
    );
    assert.equal(
        update({
            ...instance,
            verification: { ...instance.verification!, state: 'passed' },
        }),
        null,
    );
});

test('the ldenv ecosystem binds the inspector locally and watches the optional scheduler', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-processes-'));
    try {
        await mkdir(path.join(root, 'packages/backend'), { recursive: true });
        await writeFile(
            path.join(root, 'packages/backend/package.json'),
            JSON.stringify({
                scripts: { 'generate-api-dev': 'generate && watch' },
            }),
        );
        await writeFile(
            path.join(root, 'ecosystem.config.js'),
            `module.exports=${JSON.stringify({
                apps: [
                    {
                        name: 'test-api',
                        node_args: '--import tsx --inspect=0.0.0.0:9229',
                        env: {},
                        watch: ['src'],
                        ignore_watch: ['**/*.test.ts'],
                        watch_options: { followSymlinks: false },
                        watch_delay: 500,
                    },
                    { name: 'test-scheduler', watch: false },
                    { name: 'test-api-routes-watch' },
                ],
            })}`,
        );
        const wrapper = path.join(__dirname, 'ecosystem.config.cjs');
        const result = json<{
            apps: {
                node_args?: string;
                env?: { SCHEDULER_ENABLED: string; OTEL_SDK_DISABLED: string };
                watch?: string[];
                ignore_watch?: string[];
                args?: string[];
            }[];
        }>(
            await runner.run(
                process.execPath,
                [
                    '-e',
                    `process.stdout.write(JSON.stringify(require(${JSON.stringify(wrapper)})))`,
                ],
                { cwd: root, env: { LDENV_WORKTREE: root } },
            ),
        );
        assert.equal(
            result.apps[0].node_args,
            '--import tsx --inspect=127.0.0.1:9229',
        );
        assert.equal(result.apps[0].env?.SCHEDULER_ENABLED, 'true');
        assert(result.apps[0].ignore_watch?.includes('**/*.md'));
        assert(result.apps[0].ignore_watch?.includes('**/*.mdx'));
        assert.equal(result.apps[0].env?.OTEL_SDK_DISABLED, 'true');
        const traced = json<typeof result>(
            await runner.run(
                process.execPath,
                [
                    '-e',
                    `process.stdout.write(JSON.stringify(require(${JSON.stringify(wrapper)})))`,
                ],
                {
                    cwd: root,
                    env: { LDENV_WORKTREE: root, LDENV_TRACING: 'true' },
                },
            ),
        );
        assert.equal(traced.apps[0].env?.OTEL_SDK_DISABLED, 'false');
        assert.deepEqual(result.apps[1].watch, ['src']);
        assert.deepEqual(result.apps[2].args, ['exec', 'bash', '-c', 'watch']);
    } finally {
        await rm(root, { recursive: true });
    }
});
