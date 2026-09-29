import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runner } from './io';
import { json } from './model';

const requireHere = createRequire(__filename);
test('dbt path update uses the parent project UUID without loading common and skips unchanged paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-dbt-path-'));
    const backend = path.join(root, 'packages/backend');
    const record = path.join(root, 'record.json');
    const uuid = '3675b69e-8324-4110-bdca-059031aa8da3';
    try {
        for (const directory of [
            'node_modules/pg',
            'node_modules/@lightdash/common',
            'src/utils/EncryptionUtil',
        ])
            await mkdir(path.join(backend, directory), { recursive: true });
        await writeFile(path.join(backend, 'package.json'), '{}');
        await writeFile(
            path.join(backend, 'node_modules/@lightdash/common/index.js'),
            "throw new Error('common barrel loaded');",
        );
        await writeFile(
            path.join(backend, 'src/utils/EncryptionUtil/EncryptionUtil.ts'),
            'export class EncryptionUtil { encrypt(value: string) { return Buffer.from(value); } decrypt(value: Buffer) { return value.toString(); } }',
        );
        await writeFile(
            record,
            JSON.stringify({
                updates: 0,
                dbt: {
                    project_dir: '/parent/dbt',
                    profiles_dir: '/parent/profiles',
                    target: 'dev',
                },
            }),
        );
        await writeFile(
            path.join(backend, 'node_modules/pg/index.js'),
            `
            const fs = require('node:fs');
            const file = ${JSON.stringify(record)};
            exports.Client = class {
                async connect() {}
                async end() {}
                async query(sql, values) {
                    const record = JSON.parse(fs.readFileSync(file));
                    if (sql.startsWith('SELECT')) {
                        if (values[0] !== ${JSON.stringify(uuid)}) throw new Error('wrong project');
                        return { rows: [{ project_id: 17, dbt_connection: Buffer.from(JSON.stringify(record.dbt)) }] };
                    }
                    if (values[1] !== 17) throw new Error('wrong row');
                    fs.writeFileSync(file, JSON.stringify({ updates: record.updates + 1, dbt: JSON.parse(values[0].toString()) }));
                    return { rows: [] };
                }
            };
        `,
        );
        const run = (seed: string | null) =>
            runner.run(
                process.execPath,
                [
                    '--import',
                    requireHere.resolve('tsx'),
                    path.join(__dirname, 'bridge.ts'),
                    'dbt-path',
                ],
                {
                    cwd: root,
                    env: {
                        LDENV_WORKTREE: root,
                        LIGHTDASH_SECRET: 'fixture-secret',
                        ...(seed ? { LDENV_SEED_PROJECT_UUID: seed } : {}),
                    },
                },
            );
        await assert.rejects(run(null), /common barrel loaded/);
        await run(uuid);
        await run(uuid);
        assert.deepEqual(json(await readFile(record, 'utf8')), {
            updates: 1,
            dbt: {
                project_dir: path.join(
                    root,
                    'examples/full-jaffle-shop-demo/dbt',
                ),
                profiles_dir: path.join(
                    root,
                    'examples/full-jaffle-shop-demo/profiles',
                ),
                target: 'dev',
            },
        });
        await assert.rejects(run('invalid'), /Invalid seeded project UUID/);
    } finally {
        await rm(root, { recursive: true });
    }
});
