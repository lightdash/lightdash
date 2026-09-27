import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync } from 'node:fs';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { containers, dotenv, sql } from './infra';
import {
    home,
    runner,
    waitUntil,
    saveInstance,
    readJson,
    statePath,
    alive,
} from './io';
import {
    assertInstance,
    json,
    parseRecipe,
    type Instance,
    type Environment,
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
export async function startProcesses(
    instance: Instance,
    late: boolean,
): Promise<void> {
    await ownedProcesses(instance);
    const suffixes = late
        ? [
              'scheduler',
              'common-watch',
              'formula-watch',
              'warehouses-watch',
              'api-routes-watch',
              'maple',
          ]
        : ['api', 'frontend'];
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    await pm2(
        [
            'start',
            'ecosystem.config.js',
            '--only',
            suffixes.map((suffix) => `${instance.id}-${suffix}`).join(','),
        ],
        instance.worktree,
        env,
    );
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
        TMPDIR: path.join(home, 'cache/tmp'),
    };
    await mkdir(env.NODE_COMPILE_CACHE, { recursive: true });
    await mkdir(env.TMPDIR, { recursive: true });
    await runner.run('/bin/bash', ['-c', 'command -v dbt1.12'], {
        cwd: root,
        env,
    });
    return env;
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
export async function ready(instance: Instance): Promise<void> {
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
    instance.phase = 'ready';
    instance.readyAt = new Date().toISOString();
    instance.error = null;
    await saveInstance(instance);
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
        const schedulerPort = instance.ports!.scheduler;
        await waitUntil(() => health(schedulerPort), 60000, 'scheduler health');
        instance.timings.schedulerBoot = Date.now() - laterStart;
        instance.timings.rssBytes = await instanceRss(instance);
        instance.timings.total = Date.now() - Date.parse(instance.createdAt);
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
        !command.includes(`monitor ${instance.id}`)
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
