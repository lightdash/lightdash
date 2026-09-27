import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { containers, dotenv, sql } from './infra';
import {
    home,
    atomicWrite,
    runner,
    waitUntil,
    saveInstance,
    readJson,
    statePath,
    alive,
} from './io';
import {
    assertInstance,
    dotenvText,
    json,
    parseRecipe,
    type Instance,
    type Environment,
    type Ports,
} from './model';

const controlRoot = path.resolve(__dirname, '../..');
const requireRoot = createRequire(path.join(controlRoot, 'package.json'));
export type ProcessInfo = {
    name: string;
    pid: number;
    monit: { memory: number };
    pm2_env: { pm_cwd: string; status: string; pm_uptime: number };
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
export async function startProcesses(
    instance: Instance,
    late: boolean,
): Promise<void> {
    await ownedProcesses(instance);
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    if (process.env.LDENV_TRACING !== undefined) {
        env.LDENV_TRACING = process.env.LDENV_TRACING;
        env.OTEL_SDK_DISABLED = env.LDENV_TRACING === 'true' ? 'false' : 'true';
        await atomicWrite(
            path.join(instance.worktree, '.env.development.local'),
            dotenvText(env),
        );
    }
    const suffixes = late
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
        : ['api', 'frontend'];
    await pm2(
        [
            'start',
            path.join(controlRoot, 'scripts/ldenv/ecosystem.config.cjs'),
            '--only',
            suffixes.map((suffix) => `${instance.id}-${suffix}`).join(','),
        ],
        instance.worktree,
        { ...env, LDENV_WORKTREE: instance.worktree },
    );
    if (instance.kind === 'warming') await processPriority(instance, true);
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
export async function checkReady(instance: Instance): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const total = Date.now();
    const started = Date.now();
    await waitUntil(
        () => health(instance.ports!.api),
        120000,
        'backend health',
    );
    instance.timings.backendHealth = Date.now() - started;
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
    const paintStarted = Date.now();
    await bridge(instance, 'paint', {
        LDENV_CDP_URL: `ws://localhost:${env.HEADLESS_BROWSER_PORT}/`,
        LDENV_PAINT_URL: `http://${browserHost ?? '127.0.0.1'}:${instance.ports.frontend}`,
        LDENV_PAINT_SELECTOR: recipe.paint.selector,
        LDENV_PAINT_TIMEOUT: String(recipe.paint.timeout),
    });
    instance.timings.paint = Date.now() - paintStarted;
    const chartStart = Date.now();
    const chart = await sql(
        controlRoot,
        'SELECT saved_query_uuid FROM saved_queries WHERE deleted_at IS NULL ORDER BY saved_query_id LIMIT 1;',
        instance.database,
    );
    if (!/^[a-f0-9-]{36}$/.test(chart))
        throw new Error('No seeded chart to query');
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
        recipe.warm.map(async (route) => {
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
export async function ready(instance: Instance): Promise<void> {
    await checkReady(instance);
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    instance.timings.timeToReady =
        Date.parse(instance.readyAt) -
        Date.parse(instance.startedAt ?? instance.createdAt);
    instance.error = null;
    instance.verification = {
        state: 'passed',
        checkedAt: instance.readyAt,
        error: null,
        timings: {
            paint: instance.timings.paint,
            chart: instance.timings.chart,
            ready: instance.timings.ready,
        },
    };
    await saveInstance(instance);
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
export async function cheapReady(instance: Instance): Promise<void> {
    if (!instance.ports) throw new Error('Instance has no ports');
    const started = Date.now();
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    Object.assign(
        instance.timings,
        await checkClaimEndpoints(instance.ports, env.LDPAT),
    );
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
}
export async function verifyClaim(instance: Instance): Promise<void> {
    let failure: string | null = null;
    const probe = { ...instance, timings: {} as Record<string, number> };
    try {
        await checkReady(probe);
    } catch (error) {
        failure = runner.redact(
            error instanceof Error ? error.message : String(error),
        );
    }
    const current = await currentState(instance.id);
    if (
        !current ||
        current.startedAt !== instance.startedAt ||
        !['ready', 'degraded'].includes(current.phase)
    )
        return;
    current.verification = {
        state: failure ? 'failed' : 'passed',
        checkedAt: new Date().toISOString(),
        error: failure,
        timings: {
            paint: probe.timings.paint ?? 0,
            chart: probe.timings.chart ?? 0,
            ready: probe.timings.ready ?? 0,
        },
    };
    if (failure) {
        current.phase = 'degraded';
        current.error = `Background readiness verification failed: ${failure}`;
    } else {
        current.phase = 'ready';
        current.error = null;
    }
    current.monitorPid = null;
    await saveInstance(current);
}
export async function finishStart(instance: Instance): Promise<void> {
    try {
        const apiStarted = Date.now();
        await waitUntil(
            () => health(instance.ports!.api),
            120000,
            'backend health',
        );
        instance.timings.bootToHealth = Date.now() - apiStarted;
        const laterStart = Date.now();
        await startProcesses(instance, true);
        await ready(instance);
        const env = await dotenv(
            path.join(instance.worktree, '.env.development.local'),
        );
        if (env.LDENV_STANDALONE_SCHEDULER === 'true') {
            const schedulerPort = instance.ports!.scheduler;
            await waitUntil(
                () => health(schedulerPort),
                60000,
                'scheduler health',
            );
            instance.timings.schedulerBoot = Date.now() - laterStart;
        }
        instance.timings.rssBytes = await instanceRss(instance);
        instance.timings.total =
            Date.now() - Date.parse(instance.startedAt ?? instance.createdAt);
        instance.monitorPid = null;
        await saveInstance(instance);
    } catch (error) {
        instance.phase = 'failed';
        instance.error = runner.redact(
            error instanceof Error ? error.message : String(error),
        );
        instance.monitorPid = null;
        await saveInstance(instance);
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
            !command.includes(`verify ${instance.id}`))
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
