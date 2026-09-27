import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runner } from './io';
import { json } from './model';

test('the ldenv ecosystem binds the inspector locally and watches the optional scheduler', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-processes-'));
    try {
        await mkdir(path.join(root, 'packages/backend'), { recursive: true });
        await writeFile(
            path.join(root, 'packages/backend/package.json'),
            JSON.stringify({
                scripts: { 'generate-api-dev': 'generate && watch' },
            }),
        );
        await writeFile(
            path.join(root, 'ecosystem.config.js'),
            `module.exports=${JSON.stringify({
                apps: [
                    {
                        name: 'test-api',
                        node_args: '--import tsx --inspect=0.0.0.0:9229',
                        env: {},
                        watch: ['src'],
                        ignore_watch: ['**/*.test.ts'],
                        watch_options: { followSymlinks: false },
                        watch_delay: 500,
                    },
                    { name: 'test-scheduler', watch: false },
                    { name: 'test-api-routes-watch' },
                ],
            })}`,
        );
        const wrapper = path.join(__dirname, 'ecosystem.config.cjs');
        const result = json<{
            apps: {
                node_args?: string;
                env?: { SCHEDULER_ENABLED: string };
                watch?: string[];
                args?: string[];
            }[];
        }>(
            await runner.run(
                process.execPath,
                [
                    '-e',
                    `process.stdout.write(JSON.stringify(require(${JSON.stringify(wrapper)})))`,
                ],
                { cwd: root, env: { LDENV_WORKTREE: root } },
            ),
        );
        assert.equal(
            result.apps[0].node_args,
            '--import tsx --inspect=127.0.0.1:9229',
        );
        assert.equal(result.apps[0].env?.SCHEDULER_ENABLED, 'true');
        assert.deepEqual(result.apps[1].watch, ['src']);
        assert.deepEqual(result.apps[2].args, ['exec', 'bash', '-c', 'watch']);
    } finally {
        await rm(root, { recursive: true });
    }
});
