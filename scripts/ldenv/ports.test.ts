import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runner, readJson } from './io';

test('port claims batch listener checks and skip occupied and registered slots', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-ports-'));
    try {
        const registry = path.join(root, 'registry');
        await mkdir(registry);
        await writeFile(path.join(registry, 'other.json'), '{"slot":0}');
        const script = (
            await readFile(path.join(__dirname, '../dev-ports.sh'), 'utf8')
        ).replace(
            'REGISTRY_DIR="$HOME/.lightdash/dev-instances"',
            `REGISTRY_DIR="${registry}"`,
        );
        await writeFile(path.join(root, 'ports.sh'), script);
        await writeFile(
            path.join(root, 'lsof'),
            '#!/bin/bash\nprintf "%s\\n" "$*" >> "$PORT_TEST_LOG"\ncase "$1" in *8090*) exit 0;; *) exit 1;; esac\n',
            { mode: 0o700 },
        );
        await runner.run(
            'bash',
            ['ports.sh', 'claim', '--instance-id', 'test'],
            {
                cwd: root,
                env: {
                    PATH: `${root}:${process.env.PATH}`,
                    PORT_TEST_LOG: path.join(root, 'calls'),
                },
            },
        );
        assert.equal(
            (await readJson<{ slot: number }>(path.join(registry, 'test.json')))
                .slot,
            2,
        );
        const calls = (await readFile(path.join(root, 'calls'), 'utf8'))
            .trim()
            .split('\n');
        assert.equal(calls.length, 2);
        assert(
            calls.every(
                (call) => call.includes(',') && call.includes('-sTCP:LISTEN'),
            ),
        );
    } finally {
        await rm(root, { recursive: true });
    }
});

test('empty port values are omitted and lsof errors reject the slot', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-port-errors-'));
    try {
        const source = (
            await readFile(path.join(__dirname, '../dev-ports.sh'), 'utf8')
        ).split('# Main\n')[0];
        await writeFile(
            path.join(root, 'ports.sh'),
            `${source}\ncompute_ports() { PG_PORT=""; FRONTEND_PORT=3000; API_PORT=8080; SCHEDULER_PORT=""; DEBUG_PORT=9229; SDK_TEST_PORT=""; MAPLE_PORT=4320; PROMETHEUS_PORT=""; }\nvalidate_slot_ports 0\n`,
        );
        await writeFile(
            path.join(root, 'lsof'),
            '#!/bin/bash\nprintf "%s" "$1" > "$PORT_TEST_LOG"\n[ -z "$PORT_TEST_ERROR" ] || printf "%s" "$PORT_TEST_ERROR" >&2\nexit "$PORT_TEST_STATUS"\n',
            { mode: 0o700 },
        );
        const env = {
            PATH: `${root}:${process.env.PATH}`,
            PORT_TEST_LOG: path.join(root, 'calls'),
            PORT_TEST_STATUS: '1',
            PORT_TEST_ERROR: '',
        };
        await runner.run('bash', ['ports.sh'], { cwd: root, env });
        assert.equal(
            await readFile(path.join(root, 'calls'), 'utf8'),
            '-iTCP:3000,8080,9229,4320',
        );
        for (const [status, error] of [
            ['0', ''],
            ['2', ''],
            ['1', 'usage error'],
        ])
            await assert.rejects(
                runner.run('bash', ['ports.sh'], {
                    cwd: root,
                    env: {
                        ...env,
                        PORT_TEST_STATUS: status,
                        PORT_TEST_ERROR: error,
                    },
                }),
            );
    } finally {
        await rm(root, { recursive: true });
    }
});
