import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    stat,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createBackendBuilder, type BuildEvent } from './backend-bundle.cjs';
import { BundleChild } from './bundle-child';
import { BundleSupervisor } from './bundle-runner';
import { apiProcessGeneration, type BundleState } from './bundle-state';
import { backendMode, newInstance } from './model';
import type { ProcessInfo } from './processes';

const root = path.resolve(__dirname, '../..');
const requireFixture = createRequire(__filename);

test('backend selection defaults to bundle and rejects unsupported modes', () => {
    assert.equal(backendMode(undefined), 'bundle');
    assert.equal(backendMode('tsx'), 'tsx');
    assert.equal(backendMode('bundle'), 'bundle');
    assert.throws(() => backendMode('bundel'));
});

test('incremental builds preserve assets, names and stacks and recover from errors', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-bundle-'));
    const entry = path.join(directory, 'entry.ts');
    const source = (value: number) =>
        `import fs from 'node:fs'; import path from 'node:path'; export class NamedFixture {}\nexport const value=${value}; export const literal='__dirname __filename'; export const asset=fs.readFileSync(path.join(__dirname,'asset.txt'),'utf8');\nexport function fail(){throw new Error('mapped-fixture');}\n`;
    const events: BuildEvent[] = [];
    const publications: BundleState[] = [];
    let nextPid = 100;
    const child = {
        pid: null as number | null,
        start: async () => {
            child.pid = ++nextPid;
        },
        stop: async () => {
            child.pid = null;
        },
    };
    const supervisor = new BundleSupervisor(
        bundleState(root),
        child,
        async (state) => {
            await delay(5);
            publications.push(state);
        },
    );
    await writeFile(path.join(directory, 'asset.txt'), 'asset contents');
    await writeFile(entry, source(1));
    const builder = await createBackendBuilder({
        root,
        outDir: path.join(directory, 'output'),
        entry,
        onBuildStart: () => supervisor.buildStarted(),
        onBuild: async (event) => {
            assert.equal(publications.at(-1)?.state, 'building');
            await supervisor.buildFinished(event);
            events.push(event);
        },
    });
    const read = () => {
        delete requireFixture.cache[requireFixture.resolve(builder.outfile)];
        return requireFixture(builder.outfile) as {
            asset: string;
            value: number;
            literal: string;
            NamedFixture: { name: string };
        };
    };
    try {
        await builder.rebuild();
        assert.deepEqual(
            publications.map((state) => state.state),
            ['building', 'ready'],
        );
        const firstPid = child.pid;
        assert.equal(read().asset, 'asset contents');
        assert.equal(read().NamedFixture.name, 'NamedFixture');
        assert.equal(read().literal, '__dirname __filename');
        const mapped = spawnSync(
            process.execPath,
            [
                '--enable-source-maps',
                '-e',
                `require(${JSON.stringify(builder.outfile)}).fail()`,
            ],
            { encoding: 'utf8' },
        );
        assert.notEqual(mapped.status, 0);
        assert.match(mapped.stderr, new RegExp(`${entry}:3:`));
        const good = await readFile(builder.outfile);
        await writeFile(entry, 'const = invalid;');
        await assert.rejects(builder.rebuild());
        assert.equal(events.at(-1)?.ok, false);
        assert.equal(publications.at(-1)?.state, 'failed');
        assert.equal(child.pid, firstPid);
        assert.deepEqual(await readFile(builder.outfile), good);
        await writeFile(entry, source(2));
        const corrected = await builder.rebuild();
        assert(corrected.ok);
        assert.equal(publications.at(-1)?.state, 'ready');
        assert.equal(publications.at(-1)?.error, null);
        assert.notEqual(child.pid, firstPid);
        const correctedPid = child.pid;
        assert.equal(read().value, 2);
        const before = (await stat(builder.outfile)).mtimeMs;
        await builder.rebuild();
        assert.equal((await stat(builder.outfile)).mtimeMs, before);
        const last = events.at(-1);
        assert(last?.ok);
        assert.equal(last.changed, false);
        assert.equal(last.revision, corrected.revision);
        assert.equal(last.revision, 2);
        assert.equal(child.pid, correctedPid);
        assert.deepEqual(
            publications.map((state) => state.state),
            [
                'building',
                'ready',
                'building',
                'failed',
                'building',
                'ready',
                'building',
                'ready',
            ],
        );
        await builder.watch();
        await delay(200);
        await writeFile(entry, source(3));
        const deadline = Date.now() + 10000;
        while (read().value !== 3 && Date.now() < deadline) await delay(25);
        assert.equal(read().value, 3);
    } finally {
        await builder.dispose();
        await rm(directory, { recursive: true });
    }
});

test('owned API shutdown waits and kills a stubborn child without touching a neighbour', async () => {
    const neighbour = spawn(process.execPath, [
        '-e',
        'setInterval(()=>{},1000)',
    ]);
    await once(neighbour, 'spawn');
    let unexpectedExits = 0;
    const child = new BundleChild({
        executable: process.execPath,
        args: ['-e', 'process.on("SIGINT",()=>{}); setInterval(()=>{},1000)'],
        cwd: root,
        env: process.env,
        stopTimeout: 100,
        onExit: () => {
            unexpectedExits++;
        },
    });
    try {
        await child.start();
        const pid = child.pid;
        assert(pid);
        await delay(150);
        await child.stop();
        assert.equal(child.pid, null);
        assert.throws(() => process.kill(pid, 0));
        assert.doesNotThrow(() => process.kill(neighbour.pid!, 0));
        await child.start();
        assert.notEqual(child.pid, pid);
        await child.stop();
        assert.equal(unexpectedExits, 0);
    } finally {
        await child.stop();
        neighbour.kill();
        await once(neighbour, 'exit');
    }
});

test('bundles when the target tsx package cannot resolve a hoisted config parser', async () => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'ldenv-isolated-tsx-'),
    );
    const backend = path.join(directory, 'packages/backend');
    const targetTsx = path.join(directory, 'node_modules/tsx');
    await mkdir(path.join(targetTsx, 'node_modules'), { recursive: true });
    await mkdir(path.join(backend, 'node_modules'), { recursive: true });
    await mkdir(path.join(backend, 'src'), { recursive: true });
    await writeFile(path.join(targetTsx, 'package.json'), '{"name":"tsx"}');
    const installedTsx = createRequire(
        await realpath(path.join(root, 'node_modules/tsx/package.json')),
    );
    await symlink(
        path.dirname(installedTsx.resolve('esbuild/package.json')),
        path.join(targetTsx, 'node_modules/esbuild'),
        'dir',
    );
    const isolated = spawnSync(
        process.execPath,
        [
            '-e',
            `const { createRequire } = require('node:module'); const assert = require('node:assert/strict'); const isolated = createRequire(${JSON.stringify(path.join(targetTsx, 'package.json'))}); assert.throws(() => isolated.resolve('get-tsconfig'));`,
        ],
        { env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8' },
    );
    assert.equal(isolated.status, 0, isolated.stderr);
    await writeFile(
        path.join(backend, 'tsconfig.json'),
        '{"compilerOptions":{"target":"ES2022"}}',
    );
    await writeFile(
        path.join(backend, 'src/index.ts'),
        'export const value = 42;',
    );
    let builder: Awaited<ReturnType<typeof createBackendBuilder>> | undefined;
    try {
        builder = await createBackendBuilder({
            root: directory,
            outDir: path.join(directory, 'output'),
        });
        const result = await builder.rebuild();
        assert(result.ok);
        assert.equal(requireFixture(builder.outfile).value, 42);
    } finally {
        await builder?.dispose();
        await rm(directory, { recursive: true });
    }
});

function bundleState(worktree: string): BundleState {
    return {
        worktree,
        supervisorPid: 100,
        apiPid: null,
        state: 'building',
        error: null,
        generation: 0,
        launchedRevision: 0,
        buildMs: null,
        builtAt: null,
        apiStartedAt: null,
    };
}

test('bundle generation rejects stale ownership, nonready builds and dead children while preserving legacy tsx', async () => {
    const instance = newInstance('/fixture/bundle-generation', 'a'.repeat(40));
    const started = instance.startedAt;
    const api: ProcessInfo = {
        name: `${instance.id}-api`,
        pid: 100,
        monit: { memory: 0 },
        pm2_env: {
            status: 'online',
            pm_cwd: instance.worktree,
            pm_uptime: Date.parse(started),
            LDENV_BACKEND: 'bundle',
        },
    };
    const ready: BundleState = {
        ...bundleState(instance.worktree),
        state: 'ready',
        apiPid: 101,
        generation: 1,
        launchedRevision: 1,
        apiStartedAt: started,
    };
    let state = ready;
    const operations = {
        bundleStatus: async () => state,
        alive: (pid: number | null) => pid === 100 || pid === 101,
    };
    const initial = await apiProcessGeneration(instance, api, operations);
    assert(initial);
    instance.startedAt = new Date(Date.parse(started) + 1000).toISOString();
    assert.equal(
        await apiProcessGeneration(instance, api, operations),
        initial,
    );
    state = { ...ready, launchedRevision: 0 };
    assert.equal(
        await apiProcessGeneration(instance, api, operations),
        `100:${api.pm2_env.pm_uptime}:101:${started}:0:1`,
    );
    for (const delta of [
        { state: 'building' as const },
        { state: 'failed' as const },
        { state: 'stopped' as const },
        { apiPid: null },
        { apiPid: 999 },
        { apiPid: 100 },
        { supervisorPid: 999 },
        { worktree: '/another/worktree' },
        { launchedRevision: -1 },
        { generation: 0 },
        { apiStartedAt: null },
        { apiStartedAt: 'invalid' },
        { apiStartedAt: new Date(0).toISOString() },
    ]) {
        state = { ...ready, ...delta };
        assert.equal(
            await apiProcessGeneration(instance, api, operations),
            null,
            JSON.stringify(delta),
        );
    }
    state = ready;
    assert.equal(
        await apiProcessGeneration(
            instance,
            { ...api, pm2_env: { ...api.pm2_env, status: 'stopped' } },
            operations,
        ),
        null,
    );
    assert.equal(
        await apiProcessGeneration(
            instance,
            {
                ...api,
                pm2_env: { ...api.pm2_env, pm_cwd: '/another/worktree' },
            },
            operations,
        ),
        null,
    );
    assert.equal(
        await apiProcessGeneration(instance, api, {
            ...operations,
            alive: () => false,
        }),
        null,
    );
    const legacy = {
        ...api,
        pm2_env: { ...api.pm2_env, LDENV_BACKEND: undefined },
    };
    assert.equal(
        await apiProcessGeneration(instance, legacy, {
            ...operations,
            bundleStatus: async () => {
                throw new Error('must not read bundle');
            },
        }),
        `100:${api.pm2_env.pm_uptime}`,
    );
    delete instance.processStartedAt;
    assert.equal(await apiProcessGeneration(instance, api, operations), null);
});

test('bundle supervisor closes an in-flight child start without publishing stale ready', async () => {
    let release!: () => void;
    let starting!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const began = new Promise<void>((resolve) => {
        starting = resolve;
    });
    const child = {
        pid: null as number | null,
        start: async () => {
            starting();
            await gate;
            child.pid = 101;
        },
        stop: async () => {
            child.pid = null;
        },
    };
    const states: BundleState[] = [];
    const supervisor = new BundleSupervisor(
        bundleState('/fixture'),
        child,
        async (state) => {
            states.push(state);
        },
    );
    await supervisor.buildStarted();
    const finished = supervisor.buildFinished({
        ok: true,
        generation: 1,
        revision: 1,
        changed: true,
        seconds: 0.1,
        outfile: '/fixture/api.cjs',
        inputs: 1,
        esbuildVersion: 'fixture',
    });
    await began;
    const closing = supervisor.close();
    release();
    await Promise.all([finished, closing]);
    await supervisor.buildStarted();
    assert.deepEqual(
        states.map((state) => state.state),
        ['building', 'stopped'],
    );
    assert.equal(child.pid, null);
    assert.equal(states.at(-1)?.launchedRevision, 0);
});
