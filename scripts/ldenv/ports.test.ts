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
