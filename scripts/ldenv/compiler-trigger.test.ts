import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitUntil } from './io';

test('compiler trigger ignores dependencies and rebuilds for referenced package source', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-trigger-'));
    const countFile = path.join(root, 'builds.log');
    const compiler = path.join(root, 'compiler.cjs');
    const common = path.join(root, 'packages/common/src');
    const warehouses = path.join(root, 'packages/warehouses/src');
    const dependencies = path.join(root, 'packages/warehouses/node_modules');
    await Promise.all([
        mkdir(common, { recursive: true }),
        mkdir(warehouses, { recursive: true }),
        mkdir(dependencies, { recursive: true }),
    ]);
    await writeFile(
        compiler,
        `require('node:fs').appendFileSync(process.env.LDENV_TEST_BUILDS, 'build\\n');`,
    );
    const child = spawn(
        process.execPath,
        [
            path.join(__dirname, 'compiler-trigger.cjs'),
            'warehouses',
            root,
            process.execPath,
            compiler,
        ],
        {
            env: { ...process.env, LDENV_TEST_BUILDS: countFile },
            stdio: ['ignore', 'pipe', 'inherit'],
        },
    );
    const exited = once(child, 'exit');
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
    });
    const builds = async () =>
        (await readFile(countFile, 'utf8').catch(() => '')).match(/^build$/gm)
            ?.length ?? 0;
    try {
        await waitUntil(
            async () => (await builds()) === 1,
            5000,
            'initial build',
        );
        await writeFile(path.join(dependencies, 'ignored.d.ts'), 'export {};');
        await writeFile(path.join(common, 'ignored.md'), 'No compile input');
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(await builds(), 1);
        await writeFile(
            path.join(common, 'index.ts'),
            'export type Changed = string;',
        );
        await waitUntil(
            async () => (await builds()) >= 2,
            5000,
            'referenced package rebuild',
        );
        assert.match(output, /Found 0 errors\. Watching for file changes\./);
        assert.match(
            output,
            /File change detected\. Starting incremental compilation/,
        );
    } finally {
        child.kill('SIGTERM');
        await exited;
        await rm(root, { recursive: true });
    }
});
