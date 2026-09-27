import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitUntil } from './io';
import { json } from './model';
import {
    compilersSettled,
    stableReadiness,
    type CompilerState,
} from './readiness';

test('initial watcher work and the PM2 debounce must finish before readiness', () => {
    const settled: CompilerState = {
        epoch: 'current',
        state: 'settled',
        errors: 0,
        at: 1000,
    };
    assert.equal(
        compilersSettled([settled, settled, null], 'current', 3000),
        false,
    );
    assert.equal(
        compilersSettled(
            [settled, settled, { ...settled, epoch: 'old' }],
            'current',
            3000,
        ),
        false,
    );
    assert.equal(
        compilersSettled(
            [settled, settled, { ...settled, state: 'building' }],
            'current',
            3000,
        ),
        false,
    );
    assert.equal(
        compilersSettled([settled, settled, settled], 'current', 1500),
        false,
    );
    assert.equal(
        compilersSettled([settled, settled, settled], 'current', 2000),
        true,
    );
    assert.throws(() =>
        compilersSettled(
            [settled, settled, { ...settled, errors: 1 }],
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
