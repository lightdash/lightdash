import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
    mkdtemp,
    readFile,
    rm,
    mkdir,
    writeFile,
    symlink,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitUntil } from './io';
import { json, newInstance } from './model';
import {
    canStartApiAlongsideWatchers,
    compilersSettled,
    stableReadiness,
    processEpoch,
    claimChangesApi,
    type CompilerState,
} from './readiness';

const require = createRequire(__filename);
const { compilerWatchArgs } = require('./compiler-watch-args.cjs') as {
    compilerWatchArgs: (args: string[], platform: string) => string[];
};

test('compiler watchers exclude dependency paths only on macOS', () => {
    const args = ['--build', '--watch', 'tsconfig.build.json'];
    assert.deepEqual(compilerWatchArgs(args, 'darwin'), [
        ...args,
        '--excludeDirectories',
        '**/node_modules',
        '--excludeFiles',
        '**/node_modules/**',
    ]);
    assert.deepEqual(compilerWatchArgs(args, 'linux'), args);
    assert.deepEqual(args, ['--build', '--watch', 'tsconfig.build.json']);
});

test('API overlap only skips package and route rebuild inputs', () => {
    assert.equal(canStartApiAlongsideWatchers([]), true);
    assert.equal(
        canStartApiAlongsideWatchers(['packages/frontend/src/App.tsx']),
        true,
    );
    assert.equal(
        canStartApiAlongsideWatchers(['packages/backend/src/services/User.ts']),
        true,
    );
    for (const file of [
        'packages/common/src/index.ts',
        'packages/warehouses/src/index.ts',
        'packages/formula/src/index.ts',
        'packages/backend/src/controllers/UserController.ts',
        'packages/backend/src/ee/services/x/controllers/y.ts',
        'packages/backend/src/generated/routes.ts',
        'pnpm-lock.yaml',
    ])
        assert.equal(canStartApiAlongsideWatchers([file]), false, file);
    assert.equal(
        canStartApiAlongsideWatchers([
            'packages/backend/src/ee/services/x/controllers/y.test.ts',
        ]),
        true,
    );
});

test('claim API changes match watched backend code and skip ignored or unrelated files', () => {
    for (const file of [
        'packages/backend/src/services/Service.ts',
        'packages/backend/src/generated/routes.ts',
        'packages/common/dist/cjs/.tsbuildinfo',
    ])
        assert.equal(claimChangesApi([file]), true, file);
    for (const file of [
        'packages/backend/src/generated/swagger.json',
        'packages/backend/src/services/Service.test.ts',
        'packages/backend/src/services/Service.test.tsx',
        'packages/backend/src/readme.md',
        'packages/backend/src/doc.mdx',
        'packages/backend/src/app.js.map',
        'packages/backend/src/sub/node_modules/dependency/index.js',
        'packages/frontend/src/App.tsx',
    ])
        assert.equal(claimChangesApi([file]), false, file);
    assert.equal(claimChangesApi([]), false);
});

test('process epoch falls back for legacy instances and remains independent of claim timing', () => {
    const instance = newInstance('/tmp/ldenv-epoch', 'a'.repeat(40));
    delete instance.processStartedAt;
    assert.equal(processEpoch(instance), instance.startedAt);
    instance.processStartedAt = instance.startedAt;
    instance.startedAt = 'next-claim';
    assert.notEqual(processEpoch(instance), instance.startedAt);
});

test('initial watcher work and the PM2 debounce must finish before readiness', () => {
    const settled: CompilerState = {
        epoch: 'current',
        state: 'settled',
        errors: 0,
        at: 1000,
    };
    assert.equal(
        compilersSettled([settled, settled, settled, null], 'current', 3000),
        false,
    );
    assert.equal(
        compilersSettled(
            [settled, settled, settled, { ...settled, epoch: 'old' }],
            'current',
            3000,
        ),
        false,
    );
    assert.equal(
        compilersSettled(
            [settled, settled, settled, { ...settled, state: 'building' }],
            'current',
            3000,
        ),
        false,
    );
    assert.equal(
        compilersSettled([settled, settled, settled, settled], 'current', 1500),
        false,
    );
    assert.equal(
        compilersSettled([settled, settled, settled, settled], 'current', 2000),
        true,
    );
    assert.throws(() =>
        compilersSettled(
            [settled, settled, settled, { ...settled, errors: 1 }],
            'current',
            3000,
        ),
    );
});

test('a restart during browser paint forces all readiness checks to run again', async () => {
    let generation = 'first';
    let checks = 0;
    await stableReadiness(
        async () => {
            checks += 1;
            generation = 'restarted';
        },
        async () => generation,
    );
    assert.equal(checks, 2);
    await assert.rejects(
        stableReadiness(
            async () => {},
            async () => String(checks++),
        ),
        /keeps restarting/,
    );
});

test('compiler wrapper reports initial completion and later builds from split output', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-watcher-'));
    const marker = path.join(directory, 'state.json');
    const child = spawn(
        process.execPath,
        [
            path.join(__dirname, 'compiler-watch.cjs'),
            marker,
            'epoch',
            process.execPath,
            '-e',
            `
        process.stdout.write('Starting compilation in watch mode...\\n');
        process.stdin.on('data', data => {
            if (data.toString().trim() === 'ready') {
                process.stdout.write('Found 0 err');
                setTimeout(() => process.stdout.write('ors. Watching for file changes.\\n'), 20);
            } else process.stdout.write('File change detected. Starting incremental compilation...\\n');
        });
    `,
        ],
        { stdio: ['pipe', 'ignore', 'inherit'] },
    );
    const state = async () => {
        try {
            return json<CompilerState>(await readFile(marker, 'utf8'));
        } catch {
            return null;
        }
    };
    try {
        await waitUntil(
            async () => (await state())?.state === 'building',
            5000,
            'initial compiler marker',
        );
        child.stdin.write('ready\n');
        await waitUntil(
            async () => (await state())?.state === 'settled',
            5000,
            'completed compiler marker',
        );
        assert.equal((await state())?.epoch, 'epoch');
        child.stdin.write('change\n');
        await waitUntil(
            async () => (await state())?.state === 'building',
            5000,
            'incremental compiler marker',
        );
    } finally {
        child.kill('SIGTERM');
        await once(child, 'exit');
        await rm(directory, { recursive: true });
    }
});

test('an API restart during a failed chart request retries instead of failing the instance', async () => {
    let generation = 'initial';
    let checks = 0;
    await stableReadiness(
        async () => {
            checks += 1;
            if (checks === 1) {
                generation = 'restart';
                throw new Error('fetch failed');
            }
        },
        async () => generation,
    );
    assert.equal(checks, 2);
    await assert.rejects(
        stableReadiness(
            async () => {
                throw new Error('chart invalid');
            },
            async () => generation,
        ),
        /chart invalid/,
    );
});

test('route watcher scans without generating and reacts only to controller code changes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ldenv-routes-'));
    const marker = path.join(directory, 'state.json');
    const count = path.join(directory, 'generated');
    await mkdir(path.join(directory, 'node_modules'), { recursive: true });
    await mkdir(path.join(directory, 'src/controllers'), { recursive: true });
    await mkdir(path.join(directory, 'bin'));
    await writeFile(path.join(directory, 'package.json'), '{}');
    const backend = createRequire(
        path.resolve(__dirname, '../../packages/backend/package.json'),
    );
    await symlink(
        path.dirname(backend.resolve('chokidar-cli/package.json')),
        path.join(directory, 'node_modules/chokidar-cli'),
    );
    await writeFile(
        path.join(directory, 'bin/pnpm'),
        `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(count)}, 'generated')`,
        { mode: 0o755 },
    );
    const controller = path.join(directory, 'src/controllers/Example.ts');
    await writeFile(controller, 'export const value = 1;');
    const child = spawn(
        process.execPath,
        [path.join(__dirname, 'routes-watch.cjs'), marker, 'epoch'],
        {
            cwd: directory,
            env: {
                ...process.env,
                PATH: `${directory}/bin:${process.env.PATH}`,
            },
            stdio: 'ignore',
        },
    );
    const state = async () => {
        try {
            return json<CompilerState>(await readFile(marker, 'utf8'));
        } catch {
            return null;
        }
    };
    try {
        await waitUntil(
            async () => (await state())?.state === 'settled',
            5000,
            'route watcher scan',
        );
        await assert.rejects(readFile(count), { code: 'ENOENT' });
        await writeFile(
            path.join(directory, 'src/controllers/CLAUDE.md'),
            'documentation',
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        await assert.rejects(readFile(count), { code: 'ENOENT' });
        await writeFile(controller, 'export const value = 2;');
        await waitUntil(
            async () =>
                readFile(count).then(
                    () => true,
                    () => false,
                ),
            5000,
            'route generation after edit',
        );
    } finally {
        child.kill('SIGTERM');
        await once(child, 'exit');
        await rm(directory, { recursive: true });
    }
});
