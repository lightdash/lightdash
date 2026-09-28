import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { apiProcessGeneration } from './bundle-state';
import { writeInstanceEnv } from './env';
import { containers, dotenv, sql } from './infra';
import {
    home,
    runner,
    waitUntil,
    saveInstance,
    readJson,
    statePath,
    alive,
    withLock,
} from './io';
import { queueReadyGc } from './maintenance';
import {
    assertInstance,
    backendMode,
    savedBackendMode,
    json,
    parseRecipe,
    type Instance,
    type Environment,
    type Ports,
} from './model';
import {
    compilerDirectory,
    processEpoch,
    stableReadiness,
    waitForCompilers,
} from './readiness';
import { markTimeline, traced } from './timeline';

const controlRoot = path.resolve(__dirname, '../..');
const requireRoot = createRequire(path.join(controlRoot, 'package.json'));
export type ProcessInfo = {
    name: string;
    pid: number;
    monit: { memory: number };
    pm2_env: {
        pm_cwd: string;
        status: string;
        pm_uptime: number;
        watch_delay?: number;
        LDENV_BACKEND?: string;
    };
};
export async function pm2(
    args: string[],
    root = controlRoot,
    env: Environment = {},
): Promise<string> {
    return runner.run(
        process.execPath,
        [requireRoot.resolve('pm2/bin/pm2'), ...args],
        { cwd: root, env },
    );
}
export async function ownedProcesses(
    instance: Instance,
): Promise<ProcessInfo[]> {
    assertInstance(instance);
    const output = await pm2(['jlist']);
    const start = output.search(/\[\s*(?:\{|\])/);
    if (start < 0) throw new Error('PM2 inventory is not JSON');
    const all = json<ProcessInfo[]>(output.slice(start));
    const owned = all.filter((item) => item.name.startsWith(`${instance.id}-`));
    if (
        owned.some(
            (item) =>
                item.pm2_env.pm_cwd !== instance.worktree &&
                !item.pm2_env.pm_cwd.startsWith(
                    `${instance.worktree}${path.sep}`,
                ),
        )
    )
        throw new Error(
            'PM2 prefix belongs to another worktree; refusing to change it',
        );
    return owned.map(({ name, pid, monit, pm2_env }) => ({
        name,
        pid,
        monit: { memory: monit?.memory ?? 0 },
        pm2_env: {
            pm_cwd: pm2_env.pm_cwd,
            status: pm2_env.status,
            pm_uptime: pm2_env.pm_uptime,
            watch_delay: pm2_env.watch_delay,
            LDENV_BACKEND: pm2_env.LDENV_BACKEND,
        },
    }));
}
export async function instanceRss(instance: Instance): Promise<number> {
    const roots = new Set(
        (await ownedProcesses(instance))
            .map((item) => item.pid)
            .filter(Boolean),
    );
    const output = await runner.run('ps', ['-axo', 'pid=,ppid=,rss='], {
        cwd: controlRoot,
    });
    const rows = output
        .split('\n')
        .map((line) => line.trim().split(/\s+/).map(Number))
        .filter((row) => row.length === 3);
    let previousSize = -1;
    while (previousSize !== roots.size) {
        previousSize = roots.size;
        rows.forEach(([pid, parent]) => {
            if (roots.has(parent)) roots.add(pid);
        });
    }
    return rows
        .filter(([pid]) => roots.has(pid))
        .reduce((sum, row) => sum + row[2] * 1024, 0);
}

export async function stopProcesses(
    instance: Instance,
    remove: boolean,
): Promise<void> {
    for (const process of await ownedProcesses(instance))
        await pm2([remove ? 'delete' : 'stop', process.name]);
    const remaining = await ownedProcesses(instance);
    if (
        remove
            ? remaining.length > 0
            : remaining.some((item) => item.pm2_env.status === 'online')
    )
        throw new Error('PM2 teardown verification failed');
}
export async function processPriority(
    instance: Instance,
    low: boolean,
): Promise<void> {
    const roots = new Set(
        (await ownedProcesses(instance))
            .map((item) => item.pid)
            .filter(Boolean),
    );
    const rows = (
        await runner.run('ps', ['-axo', 'pid=,ppid='], { cwd: controlRoot })
    )
        .trim()
        .split('\n')
        .map((row) => row.trim().split(/\s+/).map(Number));
    let count = -1;
    while (count !== roots.size) {
        count = roots.size;
        rows.forEach(([pid, parent]) => {
            if (roots.has(parent)) roots.add(pid);
        });
    }
    await Promise.all(
        [...roots].map(async (pid) => {
            try {
                if (process.platform === 'darwin')
                    await runner.run(
                        '/usr/sbin/taskpolicy',
                        [low ? '-b' : '-B', '-p', String(pid)],
                        { cwd: controlRoot },
                    );
                else if (process.getuid?.() === 0)
                    os.setPriority(pid, low ? 10 : 0);
            } catch (error) {
                if (alive(pid)) throw error;
            }
        }),
    );
}
const pendingStartEnvironments = new Map<string, Promise<Environment>>();
export async function processStartEnvironment(
    instance: Instance,
    requested: NodeJS.ProcessEnv = process.env,
    operations = { ownedProcesses, dotenv, writeInstanceEnv },
): Promise<Environment> {
    const previous =
        pendingStartEnvironments.get(instance.id) ?? Promise.resolve();
    const pending = previous
        .catch(() => {})
        .then(async () => {
            const processes = await operations.ownedProcesses(instance);
            const env = await operations.dotenv(
                path.join(instance.worktree, '.env.development.local'),
            );
            const running = processes.filter(
                (item) => item.pm2_env.status === 'online',
            );
            const selected =
                requested.LDENV_BACKEND !== undefined
                    ? backendMode(requested.LDENV_BACKEND)
                    : running.length
                      ? savedBackendMode(env.LDENV_BACKEND)
                      : backendMode(env.LDENV_BACKEND);
            const api = running.find(
                (item) => item.name === `${instance.id}-api`,
            );
            const runningMode = savedBackendMode(
                api ? api.pm2_env.LDENV_BACKEND : env.LDENV_BACKEND,
            );
            if (running.length && selected !== runningMode)
                throw new Error(
                    'Stop this instance before changing backend mode',
                );
            const updated: Environment = { ...env, LDENV_BACKEND: selected };
            if (requested.LDENV_TRACING !== undefined) {
                updated.LDENV_TRACING = requested.LDENV_TRACING;
                updated.OTEL_SDK_DISABLED =
                    requested.LDENV_TRACING === 'true' ? 'false' : 'true';
            }
            if (
                Object.entries(updated).some(
                    ([key, value]) => value !== env[key],
                )
            )
                await operations.writeInstanceEnv(instance, updated);
            return updated;
        });
    pendingStartEnvironments.set(instance.id, pending);
    try {
        return await pending;
    } finally {
        if (pendingStartEnvironments.get(instance.id) === pending)
            pendingStartEnvironments.delete(instance.id);
    }
}
export async function startProcesses(
    instance: Instance,
    stage: 'frontend' | 'watchers' | 'api',
    operations = { processStartEnvironment, pm2, processPriority },
): Promise<void> {
    const env = await operations.processStartEnvironment(instance);
    const suffixes =
        stage === 'watchers'
            ? [
                  ...(env.LDENV_STANDALONE_SCHEDULER === 'true'
                      ? ['scheduler']
                      : []),
                  'common-watch',
                  'formula-watch',
                  'warehouses-watch',
                  'api-routes-watch',
                  'maple',
              ]
            : [stage];
    await operations.pm2(
        [
            'start',
            path.join(controlRoot, 'scripts/ldenv/ecosystem.config.cjs'),
            '--only',
            suffixes.map((suffix) => `${instance.id}-${suffix}`).join(','),
        ],
        instance.worktree,
        {
            ...env,
            LDENV_WORKTREE: instance.worktree,
            LDENV_HOME: home,
            LDENV_WATCH_STATE_DIR: compilerDirectory(instance),
            LDENV_START_EPOCH: processEpoch(instance),
            LDENV_VITE_WARM_MARKER: path.join(
                compilerDirectory(instance),
                'frontend.json',
            ),
        },
    );
    if (instance.kind === 'warming')
        await operations.processPriority(instance, true);
}
export async function stopClaimApi(
    instance: Instance,
    operations = { ownedProcesses, pm2 },
): Promise<number> {
    const api = (await operations.ownedProcesses(instance)).find(
        (item) => item.name === `${instance.id}-api`,
    );
    if (!api) throw new Error('Claim API process is missing');
    await operations.pm2(['delete', api.name]);
    if (
        (await operations.ownedProcesses(instance)).some(
            (item) => item.name === api.name,
        )
    )
        throw new Error('Claim API teardown verification failed');
    return Math.max(1000, api.pm2_env.watch_delay ?? 500);
}

export async function startClaimApi(
    instance: Instance,
    debounceMs: number,
    operations = {
        delay: (ms: number) => delay(ms),
        waitForCompilers,
        startProcesses,
    },
): Promise<void> {
    await operations.delay(debounceMs);
    await operations.waitForCompilers(instance);
    await operations.startProcesses(instance, 'api');
}
export async function dbtEnvironment(root: string): Promise<Environment> {
    const cache = path.join(os.homedir(), '.lightdash/dev-venv-1.12/bin/dbt');
    const bin = path.join(home, 'bin');
    await mkdir(bin, { recursive: true });
    if (existsSync(cache) && !existsSync(path.join(bin, 'dbt1.12')))
        await symlink(cache, path.join(bin, 'dbt1.12'));
    const venv = path.join(root, 'venv');
    const shared = path.join(os.homedir(), '.lightdash/dev-venv');
    if (!existsSync(venv) && existsSync(shared)) await symlink(shared, venv);
    const env = {
        PATH: `${bin}:${path.join(root, 'venv/bin')}:${process.env.PATH ?? ''}`,
        NODE_COMPILE_CACHE: path.join(home, 'cache/node'),
    };
    await mkdir(env.NODE_COMPILE_CACHE, { recursive: true });
    await runner.run('/bin/bash', ['-c', 'command -v dbt1.12'], {
        cwd: root,
        env,
    });
    return env;
}
export async function warmCompileCache(
    root: string,
    env: Environment,
): Promise<void> {
    await runner.run(
        path.join(root, 'node_modules/node/bin/node'),
        [
            '--import',
            'tsx',
            '-e',
            "require('./src/App'); require('./src/ee'); require('node:module').flushCompileCache(); process.exit(0)",
        ],
        {
            cwd: path.join(root, 'packages/backend'),
            env: {
                ...env,
                OTEL_SDK_DISABLED:
                    env.LDENV_TRACING === 'true' ? 'false' : 'true',
            },
            log: path.join(
                home,
                'logs',
                `compile-warm-${path.basename(root)}.log`,
            ),
        },
    );
}
export async function seedProjectUuid(root: string): Promise<string> {
    const value = await runner.run(
        process.execPath,
        [
            '-e',
            "const { createRequire } = require('node:module'); const path = require('node:path'); const local = createRequire(path.join(process.argv[1], 'packages/backend/package.json')); process.stdout.write(local('@lightdash/common').SEED_PROJECT.project_uuid);",
            root,
        ],
        { cwd: root },
    );
    if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            value,
        )
    )
        throw new Error('Invalid seeded project UUID');
    return value;
}
export async function bridge(
    instance: Instance,
    operation: string,
    extra: Environment = {},
): Promise<void> {
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    await runner.run(
        process.execPath,
        [
            '--import',
            requireRoot.resolve('tsx'),
            path.join(controlRoot, 'scripts/ldenv/bridge.ts'),
            operation,
        ],
        {
            cwd: instance.worktree,
            env: { ...env, ...extra, LDENV_WORKTREE: instance.worktree },
            timeout: 150000,
            log: path.join(home, 'logs', `${instance.id}-${operation}.log`),
        },
    );
}
export async function health(port: number): Promise<boolean> {
    try {
        return (
            (
                await fetch(`http://localhost:${port}/api/v1/health`, {
                    signal: AbortSignal.timeout(2000),
                })
            ).status === 200
        );
    } catch {
        return false;
    }
}
export async function checkForegroundReady(
    instance: Instance,
    seededChart: (instance: Instance) => Promise<string> = (current) =>
        sql(
            controlRoot,
            'SELECT saved_query_uuid FROM saved_queries WHERE deleted_at IS NULL ORDER BY saved_query_id LIMIT 1;',
            current.database,
        ),
): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const total = Date.now();
    await checkBasicReady(instance);
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    const recipe = parseRecipe(
        await readFile(path.join(instance.worktree, 'rainbow.toml'), 'utf8'),
    );
    const chartStart = Date.now();
    const chart = await seededChart(instance);
    if (!/^[a-f0-9-]{36}$/.test(chart))
        throw new Error('No seeded chart to query');
    if (!env.LDPAT) throw new Error('Seeded chart API key is missing');
    const result = await fetch(
        `http://localhost:${instance.ports.api}/api/v1/saved/${chart}/results`,
        {
            method: 'POST',
            headers: {
                Authorization: `ApiKey ${env.LDPAT}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
            signal: AbortSignal.timeout(30000),
        },
    );
    const body = json<{ status: string; results?: { rows?: unknown[] } }>(
        await result.text(),
    );
    if (!result.ok || body.status !== 'ok' || !body.results?.rows?.length)
        throw new Error(
            `Seeded chart query did not return rows (HTTP ${result.status})`,
        );
    instance.timings.chart = Date.now() - chartStart;
    const warmStart = Date.now();
    await Promise.all(
        [...new Set(['/', ...recipe.warm])].map(async (route) => {
            if (!route.startsWith('/') || route.startsWith('//'))
                throw new Error('Warm route must be local');
            const response = await fetch(
                `http://localhost:${instance.ports!.frontend}${route}`,
                { signal: AbortSignal.timeout(30000) },
            );
            if (!response.ok)
                throw new Error(
                    `Warm route ${route} returned ${response.status}`,
                );
            await response.arrayBuffer();
        }),
    );
    instance.timings.warm = Date.now() - warmStart;
    instance.timings.ready = Date.now() - total;
}
export async function checkBasicReady(instance: Instance): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const started = Date.now();
    markTimeline(instance.timings, 'backendHealth', 'start', started);
    let backendHealthAttempts = 0;
    await waitUntil(
        () => {
            backendHealthAttempts += 1;
            return health(instance.ports!.api);
        },
        120000,
        'backend health',
    );
    instance.timings.backendHealth = Date.now() - started;
    markTimeline(instance.timings, 'backendHealth', 'end');
    if (process.env.LDENV_TIMELINE === '1')
        instance.timings['trace:backendHealth:attempts'] =
            backendHealthAttempts;
    const frontendStarted = Date.now();
    markTimeline(
        instance.timings,
        'frontendResponse',
        'start',
        frontendStarted,
    );
    await waitUntil(
        async () => {
            try {
                const response = await fetch(
                    `http://localhost:${instance.ports!.frontend}/`,
                    { signal: AbortSignal.timeout(2000) },
                );
                if (!response.ok) return false;
                await response.arrayBuffer();
                return true;
            } catch {
                return false;
            }
        },
        120000,
        'frontend response',
    );
    instance.timings.frontendResponse = Date.now() - frontendStarted;
    markTimeline(instance.timings, 'frontendResponse', 'end');
}
export async function checkPaintReady(instance: Instance): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    const recipe = parseRecipe(
        await readFile(path.join(instance.worktree, 'rainbow.toml'), 'utf8'),
    );
    const browserContainers = await containers(
        controlRoot,
        'label=com.docker.compose.service=headless-browser',
    );
    const browser = browserContainers.find(
        (item) =>
            item.Config.Labels['com.docker.compose.project'] === 'ld-shared',
    );
    const gateway = browser
        ? Object.values(browser.NetworkSettings.Networks)[0]?.Gateway
        : null;
    const browserHost =
        process.platform === 'darwin' ? 'host.docker.internal' : gateway;
    const started = Date.now();
    await bridge(instance, 'paint', {
        LDENV_CDP_URL: `ws://localhost:${env.HEADLESS_BROWSER_PORT}/`,
        LDENV_PAINT_URL: `http://${browserHost ?? '127.0.0.1'}:${instance.ports.frontend}`,
        LDENV_PAINT_SELECTOR: recipe.paint.selector,
        LDENV_PAINT_TIMEOUT: String(recipe.paint.timeout),
    });
    instance.timings.paint = Date.now() - started;
}
export async function checkReady(instance: Instance): Promise<void> {
    const started = Date.now();
    await checkForegroundReady(instance);
    await checkPaintReady(instance);
    instance.timings.ready = Date.now() - started;
}
export async function waitForFrontend(
    instance: Instance,
    operations = { ownedProcesses },
): Promise<void> {
    const started = Date.now();
    const frontend = (await operations.ownedProcesses(instance)).find(
        (item) => item.name === `${instance.id}-frontend`,
    );
    if (!frontend) throw new Error('Frontend process is missing');
    await waitUntil(
        async () => {
            const marker = await readJson<{
                pid: number;
                status: string;
                startedAt: number;
                modules: number;
            }>(path.join(compilerDirectory(instance), 'frontend.json')).catch(
                (error: NodeJS.ErrnoException) => {
                    if (error.code === 'ENOENT') return null;
                    throw error;
                },
            );
            if (
                !marker ||
                marker.pid !== frontend.pid ||
                marker.startedAt < Date.parse(processEpoch(instance))
            )
                return false;
            if (marker.status === 'failed')
                throw new Error(
                    'Frontend module warmup failed; inspect its PM2 log',
                );
            instance.timings.viteWarmModules = marker.modules;
            return marker.status === 'ready';
        },
        120000,
        'frontend module warmup',
    );
    instance.timings.viteWarmWait = Date.now() - started;
}
export async function apiGeneration(
    instance: Instance,
    operations = { ownedProcesses, apiProcessGeneration },
): Promise<string | null> {
    const api = (await operations.ownedProcesses(instance)).find(
        (item) => item.name === `${instance.id}-api`,
    );
    return operations.apiProcessGeneration(instance, api);
}
export async function settledApiGeneration(
    instance: Instance,
    operations = {
        waitForCompilers,
        ownedProcesses,
        apiProcessGeneration,
        health,
        waitUntil,
    },
): Promise<string> {
    const timings = instance.timings;
    const check = (timings['trace:generationChecks'] ?? 0) + 1;
    if (process.env.LDENV_TIMELINE === '1')
        timings['trace:generationChecks'] = check;
    return traced(timings, `generationCheck${check}`, async () => {
        await traced(timings, `generation${check}:compilers`, () =>
            operations.waitForCompilers(instance),
        );
        let generation: string | null = null;
        let attempts = 0;
        await operations.waitUntil(
            async () => {
                attempts += 1;
                const api = await traced(
                    timings,
                    `generation${check}:inventory`,
                    async () =>
                        (await operations.ownedProcesses(instance)).find(
                            (item) => item.name === `${instance.id}-api`,
                        ),
                );
                const before = await traced(
                    timings,
                    `generation${check}:before`,
                    () => operations.apiProcessGeneration(instance, api),
                );
                if (!before) return false;
                const healthy = await traced(
                    timings,
                    `generation${check}:health`,
                    () => operations.health(instance.ports!.api),
                );
                if (!healthy) return false;
                generation = await traced(
                    timings,
                    `generation${check}:after`,
                    () => operations.apiProcessGeneration(instance, api),
                );
                return generation === before;
            },
            120000,
            'settled backend health',
        );
        if (process.env.LDENV_TIMELINE === '1')
            timings[`trace:generation${check}:attempts`] = attempts;
        return generation!;
    });
}
export async function stableReady(
    instance: Instance,
    check: () => Promise<void>,
    operations = { waitForFrontend, settledApiGeneration },
    waitForVite = true,
): Promise<void> {
    if (waitForVite) await operations.waitForFrontend(instance);
    await stableReadiness(check, () =>
        operations.settledApiGeneration(instance),
    );
}
function markReady(instance: Instance, verified: boolean): void {
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    instance.timings.timeToReady =
        Date.parse(instance.readyAt) -
        Date.parse(instance.startedAt ?? instance.createdAt);
    instance.error = null;
    instance.verification = {
        state: verified ? 'passed' : 'pending',
        checkedAt: verified ? instance.readyAt : null,
        error: null,
        timings: verified
            ? {
                  paint: instance.timings.paint,
                  chart: instance.timings.chart,
                  ready: instance.timings.ready,
              }
            : {},
    };
}
export async function ready(instance: Instance): Promise<void> {
    await stableReady(instance, () => checkReady(instance));
    markReady(instance, true);
}
export async function checkClaimEndpoints(
    ports: Pick<Ports, 'api' | 'frontend'>,
    token: string,
): Promise<Record<string, number>> {
    const timings: Record<string, number> = {};
    const started = Date.now();
    const measured = async <T>(name: string, check: Promise<T>): Promise<T> => {
        const result = await check;
        timings[name] = Date.now() - started;
        return result;
    };
    const [healthy, frontend, auth] = await Promise.all([
        measured('claimHealth', health(ports.api)),
        measured(
            'claimFrontend',
            fetch(`http://localhost:${ports.frontend}/`, {
                signal: AbortSignal.timeout(2000),
            }),
        ),
        measured(
            'claimAuth',
            fetch(`http://localhost:${ports.api}/api/v1/user`, {
                headers: { Authorization: `ApiKey ${token}` },
                signal: AbortSignal.timeout(2000),
            }),
        ),
    ]);
    const user = json<{ status: string; results?: { userUuid?: string } }>(
        await auth.text(),
    );
    await frontend.arrayBuffer();
    if (
        !healthy ||
        !frontend.ok ||
        !auth.ok ||
        user.status !== 'ok' ||
        !user.results?.userUuid
    )
        throw new Error(
            'Warm claim health, frontend or authentication check failed',
        );
    return timings;
}
export async function cheapReady(
    instance: Instance,
    settleApi = false,
): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const ports = instance.ports;
    const started = Date.now();
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    const check = async () =>
        Object.assign(
            instance.timings,
            await checkClaimEndpoints(ports, env.LDPAT),
        );
    if (settleApi)
        await stableReady(instance, async () => {
            await check();
        });
    else {
        const generation = await apiGeneration(instance);
        if (!generation) throw new Error('Warm claim API is not ready');
        await check();
        if (generation !== (await apiGeneration(instance)))
            throw new Error('Warm claim API changed during readiness checks');
    }
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    instance.timings.cheapGate = Date.now() - started;
    instance.timings.timeToReady =
        Date.parse(instance.readyAt) - Date.parse(instance.startedAt);
    instance.verification = {
        state: 'pending',
        checkedAt: null,
        error: null,
        timings: {},
    };
    instance.error = null;
    await saveInstance(instance);
    await queueReadyGc(instance);
}
export function claimVerificationUpdate(
    current: Instance,
    attempt: Instance,
    failure: string | null,
    timings: Record<string, number>,
    checkedAt: string,
): Instance | null {
    if (
        current.id !== attempt.id ||
        current.startedAt !== attempt.startedAt ||
        processEpoch(current) !== processEpoch(attempt) ||
        current.readyAt !== attempt.readyAt ||
        current.monitorPid !== attempt.monitorPid ||
        !['ready', 'degraded'].includes(current.phase) ||
        current.verification?.state !== 'pending'
    )
        return null;
    return {
        ...current,
        phase:
            failure || current.error || current.phase === 'degraded'
                ? 'degraded'
                : 'ready',
        error: failure
            ? [
                  current.error,
                  `Background readiness verification failed: ${failure}`,
              ]
                  .filter(Boolean)
                  .join('; ')
            : current.error,
        monitorPid: null,
        timings: {
            ...current.timings,
            timeToVerified:
                Date.parse(checkedAt) - Date.parse(current.startedAt),
        },
        verification: {
            state: failure ? 'failed' : 'passed',
            checkedAt,
            error: failure,
            timings: {
                paint: timings.paint ?? 0,
                chart: timings.chart ?? 0,
                ready: timings.ready ?? 0,
            },
        },
    };
}
const claimVerificationOperations = {
    stableReady,
    checkReady,
    apiGeneration,
    lockedInstanceState,
    currentState,
    saveInstance,
};
export async function verifyClaim(
    instance: Instance,
    operations = claimVerificationOperations,
): Promise<void> {
    const attempt = await operations.lockedInstanceState(
        instance.id,
        async () => {
            const current = await operations.currentState(instance.id);
            if (
                !current ||
                current.startedAt !== instance.startedAt ||
                current.monitorPid !== process.pid ||
                !['ready', 'degraded'].includes(current.phase) ||
                current.verification?.state !== 'pending'
            )
                return null;
            return current;
        },
    );
    if (!attempt) return;
    for (let pass = 0; pass < 4; pass += 1) {
        let failure: string | null = null;
        let generation: string | null = null;
        const probe = { ...attempt, timings: {} as Record<string, number> };
        try {
            await operations.stableReady(probe, async () => {
                generation = await operations.apiGeneration(probe);
                await operations.checkReady(probe);
            });
        } catch (error) {
            failure = runner.redact(
                error instanceof Error ? error.message : String(error),
            );
        }
        let retry = false;
        await operations.lockedInstanceState(instance.id, async () => {
            const current = await operations.currentState(instance.id);
            if (
                !current ||
                !claimVerificationUpdate(
                    current,
                    attempt,
                    failure,
                    probe.timings,
                    new Date().toISOString(),
                )
            )
                return;
            if (generation !== null) {
                let changed = false;
                try {
                    changed =
                        generation !==
                        (await operations.apiGeneration(current));
                } catch (error) {
                    failure = [
                        failure,
                        `Cannot inspect API generation: ${runner.redact(String(error))}`,
                    ]
                        .filter(Boolean)
                        .join('; ');
                }
                if (changed) {
                    if (pass < 3) {
                        retry = true;
                        return;
                    }
                    failure = [
                        failure,
                        'API keeps restarting before readiness can be published',
                    ]
                        .filter(Boolean)
                        .join('; ');
                }
            }
            const updated = claimVerificationUpdate(
                current,
                attempt,
                failure,
                probe.timings,
                new Date().toISOString(),
            );
            if (updated) await operations.saveInstance(updated);
        });
        if (!retry) return;
    }
}
type PaintAttempt = Pick<Instance, 'id' | 'startedAt' | 'readyAt'> & {
    monitorPid: number;
};
export function paintVerificationUpdate(
    current: Instance,
    attempt: PaintAttempt,
    failure: string | null,
    paintMs: number,
    checkedAt: string,
): Instance | null {
    if (
        current.id !== attempt.id ||
        current.startedAt !== attempt.startedAt ||
        current.readyAt !== attempt.readyAt ||
        current.monitorPid !== attempt.monitorPid ||
        !['ready', 'degraded'].includes(current.phase) ||
        current.verification?.state !== 'pending'
    )
        return null;
    return {
        ...current,
        phase: failure || current.phase === 'degraded' ? 'degraded' : 'ready',
        error: failure
            ? [
                  current.error,
                  `Background paint verification failed: ${failure}`,
              ]
                  .filter(Boolean)
                  .join('; ')
            : current.error,
        monitorPid: null,
        timings: {
            ...current.timings,
            paint: paintMs,
            timeToVerified:
                Date.parse(checkedAt) - Date.parse(current.startedAt),
        },
        verification: {
            state: failure ? 'failed' : 'passed',
            checkedAt,
            error: failure,
            timings: {
                paint: paintMs,
                chart: current.timings.chart ?? 0,
                ready: current.timings.ready ?? 0,
            },
        },
    };
}
async function lockedInstanceState<T>(
    id: string,
    update: () => Promise<T>,
): Promise<T> {
    let result: T;
    await waitUntil(
        async () => {
            try {
                result = await withLock(id, update);
                return true;
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.startsWith(`ldenv is busy: ${id}.`)
                )
                    return false;
                throw error;
            }
        },
        90000,
        'instance state lock',
    );
    return result!;
}
async function publishMonitorStart(
    instance: Instance,
): Promise<Instance | null> {
    return lockedInstanceState(instance.id, async () => {
        const current = await currentState(instance.id);
        if (
            !current ||
            current.startedAt !== instance.startedAt ||
            current.monitorPid !== process.pid ||
            current.phase !== 'starting'
        )
            return null;
        const next: Instance = {
            ...current,
            phase: instance.phase,
            readyAt: instance.readyAt,
            error: instance.error,
            verification: instance.verification,
            timings: { ...current.timings, ...instance.timings },
            monitorPid: process.pid,
        };
        await saveInstance(next);
        return next;
    });
}
async function mergeMonitorTail(instance: Instance): Promise<void> {
    await lockedInstanceState(instance.id, async () => {
        const current = await currentState(instance.id);
        if (
            !current ||
            current.startedAt !== instance.startedAt ||
            current.readyAt !== instance.readyAt ||
            current.monitorPid !== process.pid ||
            !['ready', 'degraded'].includes(current.phase)
        )
            return;
        current.timings = { ...current.timings, ...instance.timings };
        if (instance.error) {
            current.phase =
                instance.kind === 'worktree' ? 'degraded' : 'failed';
            current.error = instance.error;
        }
        if (instance.kind !== 'worktree') current.monitorPid = null;
        await saveInstance(current);
    });
}
async function collectStartTail(
    instance: Instance,
    env: Environment,
    started: number,
): Promise<string | null> {
    let failure: string | null = null;
    try {
        if (env.LDENV_STANDALONE_SCHEDULER === 'true') {
            const schedulerPort = instance.ports!.scheduler;
            await waitUntil(
                () => health(schedulerPort),
                60000,
                'scheduler health',
            );
            instance.timings.schedulerBoot = Date.now() - started;
        }
        instance.timings.rssBytes = await instanceRss(instance);
    } catch (error) {
        failure = runner.redact(
            error instanceof Error ? error.message : String(error),
        );
        instance.phase = instance.kind === 'worktree' ? 'degraded' : 'failed';
        instance.error = `Startup tail failed: ${failure}`;
    } finally {
        instance.timings.total =
            Date.now() - Date.parse(instance.startedAt ?? instance.createdAt);
    }
    return failure;
}
export async function verifyPaint(instance: Instance): Promise<void> {
    await waitUntil(
        async () => {
            const current = await currentState(instance.id);
            return (
                !current ||
                current.startedAt !== instance.startedAt ||
                !['ready', 'degraded'].includes(current.phase) ||
                current.verification?.state !== 'pending' ||
                current.monitorPid === process.pid
            );
        },
        15000,
        'paint verifier registration',
    );
    const registered = await currentState(instance.id);
    if (
        !registered ||
        registered.startedAt !== instance.startedAt ||
        !['ready', 'degraded'].includes(registered.phase) ||
        registered.verification?.state !== 'pending' ||
        registered.monitorPid !== process.pid
    )
        return;
    const attempt: PaintAttempt = {
        id: registered.id,
        startedAt: registered.startedAt,
        readyAt: registered.readyAt,
        monitorPid: process.pid,
    };
    const probe: Instance = { ...registered, timings: {} };
    const started = Date.now();
    let failure: string | null = null;
    try {
        await checkPaintReady(probe);
    } catch (error) {
        failure = runner.redact(
            error instanceof Error ? error.message : String(error),
        );
    }
    const paintMs = Date.now() - started;
    await lockedInstanceState(instance.id, async () => {
        const current = await currentState(instance.id);
        if (!current) return;
        const updated = paintVerificationUpdate(
            current,
            attempt,
            failure,
            paintMs,
            new Date().toISOString(),
        );
        if (updated) await saveInstance(updated);
    });
}
export async function finishStart(
    instance: Instance,
    inlineBackgroundVerification = false,
): Promise<void> {
    markTimeline(
        instance.timings,
        'monitorProcess',
        'start',
        Math.floor(performance.timeOrigin),
    );
    markTimeline(instance.timings, 'finishStart', 'start');
    try {
        const apiStarted = Date.now();
        markTimeline(instance.timings, 'bootToHealth', 'start', apiStarted);
        let bootHealthAttempts = 0;
        const apiHealth = waitUntil(
            () => {
                bootHealthAttempts += 1;
                return health(instance.ports!.api);
            },
            120000,
            'backend health',
        ).then(() => {
            instance.timings.bootToHealth = Date.now() - apiStarted;
            markTimeline(instance.timings, 'bootToHealth', 'end');
            if (process.env.LDENV_TIMELINE === '1')
                instance.timings['trace:bootHealth:attempts'] =
                    bootHealthAttempts;
        });
        const watcherStarted = Date.now();
        markTimeline(
            instance.timings,
            'monitorCompilers',
            'start',
            watcherStarted,
        );
        const compilers =
            instance.timings.watchersLaunch && !instance.timings.watchersSettle
                ? waitForCompilers(instance).then(() => {
                      instance.timings.watchersWait =
                          Date.now() - watcherStarted;
                      instance.timings.watchersSettle =
                          instance.timings.watchersLaunch +
                          instance.timings.watchersWait;
                      markTimeline(instance.timings, 'monitorCompilers', 'end');
                  })
                : Promise.resolve().then(() => {
                      markTimeline(instance.timings, 'monitorCompilers', 'end');
                  });
        await Promise.all([apiHealth, compilers]);
        const laterStart = Date.now();
        if (instance.kind === 'worktree') {
            await traced(instance.timings, 'readyCheck', () =>
                stableReady(
                    instance,
                    () => checkBasicReady(instance),
                    undefined,
                    false,
                ),
            );
            markReady(instance, false);
        } else
            await traced(instance.timings, 'readyCheck', () => ready(instance));
        const published = inlineBackgroundVerification
            ? await traced(instance.timings, 'publishReady', () =>
                  publishMonitorStart(instance),
              )
            : null;
        if (inlineBackgroundVerification && !published) return;
        if (!inlineBackgroundVerification) await saveInstance(instance);
        await queueReadyGc(published ?? instance);
        const env = await dotenv(
            path.join(instance.worktree, '.env.development.local'),
        );
        const tailFailure = await collectStartTail(instance, env, laterStart);
        if (inlineBackgroundVerification) {
            await mergeMonitorTail(instance);
            if (instance.kind === 'worktree') await verifyClaim(published!);
        } else await saveInstance(instance);
        if (!inlineBackgroundVerification && instance.kind === 'worktree') {
            try {
                instance.monitorPid = await background(
                    ['verify', instance.id],
                    `${instance.id}-verifier`,
                );
                await saveInstance(instance);
            } catch (error) {
                const failure = runner.redact(
                    error instanceof Error ? error.message : String(error),
                );
                instance.phase = 'degraded';
                instance.error = [
                    instance.error,
                    `Background readiness verification failed: ${failure}`,
                ]
                    .filter(Boolean)
                    .join('; ');
                instance.verification = {
                    state: 'failed',
                    checkedAt: new Date().toISOString(),
                    error: failure,
                    timings: {
                        chart: instance.timings.chart ?? 0,
                        ready: instance.timings.ready ?? 0,
                    },
                };
                instance.monitorPid = null;
                await saveInstance(instance);
            }
        }
        if (tailFailure && instance.kind !== 'worktree')
            throw new Error(tailFailure);
    } catch (error) {
        const failure = runner.redact(
            error instanceof Error ? error.message : String(error),
        );
        if (inlineBackgroundVerification) {
            await lockedInstanceState(instance.id, async () => {
                const current = await currentState(instance.id);
                if (
                    !current ||
                    current.startedAt !== instance.startedAt ||
                    current.monitorPid !== process.pid ||
                    !['starting', 'ready', 'degraded'].includes(current.phase)
                )
                    return;
                current.phase =
                    current.phase === 'starting' ? 'failed' : 'degraded';
                current.error = [current.error, failure]
                    .filter(Boolean)
                    .join('; ');
                current.monitorPid = null;
                if (current.phase === 'degraded')
                    current.verification = {
                        state: 'failed',
                        checkedAt: new Date().toISOString(),
                        error: failure,
                        timings: current.verification?.timings ?? {},
                    };
                await saveInstance(current);
            });
        } else {
            instance.phase = 'failed';
            instance.error = failure;
            instance.monitorPid = null;
            await saveInstance(instance);
        }
        throw error;
    }
}
export async function background(
    args: string[],
    name: string,
): Promise<number> {
    const logs = path.join(home, 'logs');
    await mkdir(logs, { recursive: true });
    const fd = openSync(path.join(logs, `${name}.log`), 'a', 0o600);
    try {
        const child = spawn(
            process.execPath,
            [
                '--import',
                requireRoot.resolve('tsx'),
                path.join(controlRoot, 'scripts/ldenv/index.ts'),
                ...args,
            ],
            {
                cwd: controlRoot,
                env: { ...process.env, LDENV_HOME: home },
                detached: true,
                stdio: ['ignore', fd, fd],
            },
        );
        await new Promise<void>((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', reject);
        });
        child.unref();
        return child.pid!;
    } finally {
        closeSync(fd);
    }
}
export async function cancelMonitor(instance: Instance): Promise<void> {
    if (!alive(instance.monitorPid)) return;
    const command = await runner.run(
        'ps',
        ['-p', String(instance.monitorPid), '-o', 'command='],
        { cwd: controlRoot },
    );
    if (
        !command.includes('scripts/ldenv/index.ts') ||
        (!command.includes(`monitor ${instance.id}`) &&
            !command.includes(`verify ${instance.id}`) &&
            !command.includes(`verify-paint ${instance.id}`))
    )
        throw new Error('Monitor PID no longer belongs to this instance');
    process.kill(-instance.monitorPid!, 'SIGTERM');
    await waitUntil(
        async () => !alive(instance.monitorPid),
        10000,
        'readiness monitor exit',
    );
}
export async function currentState(id: string): Promise<Instance | null> {
    return existsSync(statePath(id)) ? readJson<Instance>(statePath(id)) : null;
}
