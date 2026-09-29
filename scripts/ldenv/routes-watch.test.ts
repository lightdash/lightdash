import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const fakeChokidar = `
const { EventEmitter } = require('node:events');
exports.watch = () => {
    const watcher = new EventEmitter();
    const handle = setInterval(() => {}, 1000);
    watcher.close = async () => clearInterval(handle);
    setTimeout(() => {
        for (const [event, file] of JSON.parse(process.env.FAKE_EVENTS)) {
            if (event === 'ready') watcher.emit('ready');
            else watcher.emit('all', event, file);
        }
    }, 20);
    return watcher;
};
`;

async function runWatcher(events: [string, string?][]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-routes-'));
    try {
        const cli = path.join(root, 'node_modules/chokidar-cli');
        const chokidar = path.join(cli, 'node_modules/chokidar');
        await mkdir(chokidar, { recursive: true });
        await mkdir(path.join(root, 'bin'));
        await writeFile(path.join(root, 'package.json'), '{"name":"backend"}');
        await writeFile(
            path.join(cli, 'package.json'),
            '{"name":"chokidar-cli","main":"index.js"}',
        );
        await writeFile(path.join(cli, 'index.js'), '');
        await writeFile(
            path.join(chokidar, 'package.json'),
            '{"name":"chokidar","main":"index.js"}',
        );
        await writeFile(path.join(chokidar, 'index.js'), fakeChokidar);
        const runs = path.join(root, 'runs.log');
        const pnpm = path.join(root, 'bin/pnpm');
        await writeFile(pnpm, `#!/bin/sh\necho "$@" >> '${runs}'\n`);
        await chmod(pnpm, 0o755);
        const stateFile = path.join(root, 'state/routes.json');
        const child = spawn(
            process.execPath,
            [path.join(__dirname, 'routes-watch.cjs'), stateFile, 'epoch-1'],
            {
                cwd: root,
                env: {
                    ...process.env,
                    PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
                    FAKE_EVENTS: JSON.stringify(events),
                },
                stdio: ['ignore', 'ignore', 'pipe'],
            },
        );
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk;
        });
        const exited = once(child, 'exit');
        await new Promise((resolve) => {
            setTimeout(resolve, 900);
        });
        assert.equal(child.exitCode, null, stderr);
        child.kill('SIGTERM');
        await exited;
        const generated = await readFile(runs, 'utf8').catch(() => '');
        const state = JSON.parse(await readFile(stateFile, 'utf8')) as {
            state: string;
        };
        return { runs: generated.trim().split('\n').filter(Boolean), state };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

test('routes watcher ignores events from the initial scan', async () => {
    const result = await runWatcher([
        ['add', 'src/ee/models/CLAUDE.md'],
        ['add', 'src/controllers/userController.ts'],
        ['ready'],
    ]);
    assert.deepEqual(result.runs, []);
    assert.equal(result.state.state, 'settled');
});

test('routes watcher ignores changes to non-controller files after ready', async () => {
    const result = await runWatcher([
        ['ready'],
        ['change', 'src/ee/services/ai/tools/SKILLS.md'],
        ['change', 'src/controllers/userController.test.ts'],
    ]);
    assert.deepEqual(result.runs, []);
    assert.equal(result.state.state, 'settled');
});

test('routes watcher regenerates routes once for controller changes after ready', async () => {
    const result = await runWatcher([
        ['ready'],
        ['change', 'src/controllers/userController.ts'],
        ['add', 'src/ee/controllers/newController.ts'],
    ]);
    assert.deepEqual(result.runs, ['run generate-api:build']);
    assert.equal(result.state.state, 'settled');
});
