import knex from 'knex';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    createMigratedDatabase,
    getMigrationFingerprint,
    getPostgresServer,
    runAllMigrations,
    toConnectionUri,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { listMigrationFiles } from '../../migrationFiles';

describe('real-schema test database', () => {
    let first: MigratedDatabase;
    let second: MigratedDatabase;

    beforeAll(async () => {
        first = await createMigratedDatabase();
        second = await createMigratedDatabase();
    });

    afterAll(async () => {
        await first?.destroy();
        await second?.destroy();
    });

    test('applies every core and enterprise migration', async () => {
        const applied = await first
            .database('knex_migrations')
            .pluck<string[]>('name');

        expect(new Set(applied)).toEqual(
            new Set((await listMigrationFiles()).map(({ name }) => name)),
        );
    });

    test('applies the graphile worker migrations', async () => {
        const result = await first.database.raw<{ rowCount: number }>(
            `SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'graphile_worker' AND table_name = 'migrations'`,
        );

        expect(result.rowCount).toBe(1);
    });

    test('gives every caller its own database', async () => {
        await first.database('organizations').insert({
            organization_name: 'Real schema isolation',
        });

        await expect(
            second
                .database('organizations')
                .where('organization_name', 'Real schema isolation')
                .first(),
        ).resolves.toBeUndefined();
        expect(first.databaseName).not.toBe(second.databaseName);
    });

    test('an edited migration gets a new template', async () => {
        const files = await listMigrationFiles();
        const edited = files[files.length - 1];
        const directory = await mkdtemp(
            path.join(tmpdir(), 'edited-migration-'),
        );
        const editedCopy = path.join(directory, edited.name);
        await writeFile(
            editedCopy,
            `${await readFile(edited.filePath, 'utf8')}\nexport const probe = 'edited';\n`,
        );

        const original = await getMigrationFingerprint(files);
        const changed = await getMigrationFingerprint(
            files.map((file) =>
                file === edited ? { ...file, filePath: editedCopy } : file,
            ),
        );

        expect(changed).not.toBe(original);
        expect(await getMigrationFingerprint(files)).toBe(original);
    });

    test('stops the migrate process and frees its database when a build gives up', async () => {
        const server = getPostgresServer();
        const databaseName = `lightdash_abandoned_${randomUUID().replaceAll('-', '')}`;
        const admin = knex({
            client: 'pg',
            connection: toConnectionUri(server, server.adminDatabase),
            pool: { min: 0, max: 1 },
        });
        const connectionCount = async () =>
            Number(
                (
                    await admin.raw<{ rows: { count: string }[] }>(
                        'SELECT count(*) AS count FROM pg_stat_activity WHERE datname = ?',
                        [databaseName],
                    )
                ).rows[0].count,
            );
        try {
            await admin.raw('CREATE DATABASE ??', [databaseName]);
            let connectedWhileRunning = 0;
            const sampler = setInterval(() => {
                void connectionCount().then((count) => {
                    connectedWhileRunning = Math.max(
                        connectedWhileRunning,
                        count,
                    );
                });
            }, 250);

            await expect(
                runAllMigrations(toConnectionUri(server, databaseName), {
                    timeoutMs: 8000,
                }),
            ).rejects.toThrow('did not finish within 8000 ms');
            clearInterval(sampler);

            expect(connectedWhileRunning).toBeGreaterThan(0);
            const abandoned = knex({
                client: 'pg',
                connection: toConnectionUri(server, databaseName),
                pool: { min: 0, max: 1 },
            });
            const appliedMigrations = async () =>
                Number(
                    (
                        await abandoned.raw<{ rows: { count: string }[] }>(
                            'SELECT count(*) AS count FROM knex_migrations',
                        )
                    ).rows[0].count,
                );
            try {
                const appliedAtTimeout = await appliedMigrations();
                await new Promise((resolve) => {
                    setTimeout(resolve, 6000);
                });
                expect(await appliedMigrations()).toBe(appliedAtTimeout);
            } finally {
                await abandoned.destroy();
            }
            await expect
                .poll(connectionCount, { timeout: 10000, interval: 250 })
                .toBe(0);
            await admin.raw('DROP DATABASE ??', [databaseName]);
        } finally {
            await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                databaseName,
            ]);
            await admin.destroy();
        }
    });
});
