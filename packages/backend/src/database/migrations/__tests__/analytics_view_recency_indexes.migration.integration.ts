import knex, { type Knex } from 'knex';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
    createMigrateCliContext,
    runMigrateCli,
} from '../../../scripts/migrate/cli';
import { cleanupInvalidMigrationIndexes } from '../../../scripts/migrate/invalidMigrationIndexes';
import { getKnexMigrationState } from '../../../scripts/migrate/migrationState';
import { MigrationLeaseManager } from '../../migrationLease';
import * as chartMigration from '../20260914120000_index_analytics_chart_views_content_timestamp';
import * as dashboardMigration from '../20260914120100_index_analytics_dashboard_views_content_timestamp';

const fixtures = [
    {
        table: 'analytics_chart_views',
        uuidColumn: 'chart_uuid',
        index: 'analytics_chart_views_chart_uuid_timestamp_index',
        filename:
            '20260914120000_index_analytics_chart_views_content_timestamp',
        migration: chartMigration,
    },
    {
        table: 'analytics_dashboard_views',
        uuidColumn: 'dashboard_uuid',
        index: 'analytics_dashboard_views_dashboard_uuid_timestamp_index',
        filename:
            '20260914120100_index_analytics_dashboard_views_content_timestamp',
        migration: dashboardMigration,
    },
] as const;

type FixtureEvent = { event_uuid: string; timestamp: Date };

describe('Analytics recency indexes on real PostgreSQL', () => {
    let admin: Knex;
    let database: Knex;
    let heartbeatDatabase: Knex;
    let migrationDirectory: string;
    const schema = `recency_indexes_${process.pid}_${randomUUID().replaceAll('-', '')}`;
    const contentUuid = '00000000-0000-4000-8000-000000000001';
    const rowCount = 500_000;
    let connectionUri: string;

    const connect = (max = 1, options = '', targetSchema = schema) =>
        knex({
            client: 'pg',
            connection: {
                connectionString: connectionUri,
                options,
            },
            searchPath: [targetSchema, 'public'],
            pool: { min: 0, max },
            acquireConnectionTimeout: 3000,
            migrations: {
                directory: migrationDirectory,
                loadExtensions: ['.js'],
                schemaName: schema,
                tableName: 'knex_migrations',
            },
        });

    const indexState = async (index: string, targetSchema = schema) => {
        const result = await admin.raw<{
            rows: { valid: boolean; definition: string }[];
        }>(
            `SELECT i.indisvalid AS valid, pg_get_indexdef(i.indexrelid) AS definition
             FROM pg_index i WHERE i.indexrelid = to_regclass(?)`,
            [`${targetSchema}.${index}`],
        );
        return result.rows[0];
    };

    const expectResetTimeouts = async () => {
        const result = await database.raw<{
            rows: { statement_timeout: string; lock_timeout: string }[];
        }>(`SELECT current_setting('statement_timeout') AS statement_timeout,
                   current_setting('lock_timeout') AS lock_timeout`);
        expect(result.rows[0]).toEqual({
            statement_timeout: '250ms',
            lock_timeout: '37ms',
        });
        expect(await database.raw('SELECT 1')).toBeDefined();
    };

    const waitForBuild = async (table: string, phase?: string) => {
        const deadline = Date.now() + 10_000;
        const poll = async (): Promise<{ pid: number; phase: string }> => {
            if (Date.now() >= deadline)
                throw new Error(
                    `No active concurrent build for ${table} (${phase})`,
                );
            const result = await admin.raw<{
                rows: { pid: number; phase: string }[];
            }>(
                'SELECT pid, phase FROM pg_stat_progress_create_index WHERE relid = ?::regclass',
                [`${schema}.${table}`],
            );
            const build = result.rows[0];
            if (build && (!phase || build.phase === phase)) return build;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 25);
            });
            return poll();
        };
        return poll();
    };

    const runRunner = async (
        migrateOne = async (name: string) => {
            await database.migrate.up({ name });
        },
        migrationMaxAttempts = 2,
    ) => {
        const config = database.client.config.migrations!;
        const context = createMigrateCliContext({
            leaseManager: new MigrationLeaseManager({ database }),
            heartbeatLeaseManager: new MigrationLeaseManager({
                database: heartbeatDatabase,
            }),
            identity: {
                hostname: 'recency-index-test',
                podName: null,
                appVersion: 'test',
            },
            getMigrationState: () => getKnexMigrationState(database, config),
            // Capacity/preflight and Graphile are separate from the index mechanics under test.
            runPreflight: async () => ({
                schemaVersion: '1',
                decision: 'proceed',
                force: false,
                strict: false,
                summary: { red: 0, yellow: 0, info: 0 },
                checks: [],
            }),
            cleanupInvalidIndexes: (pendingMigrationNames) =>
                cleanupInvalidMigrationIndexes({
                    database,
                    migrationConfig: config,
                    pendingMigrationNames,
                    log: () => {},
                }),
            migrateOne,
            isKnexLockHeld: async () => {
                if (!(await database.schema.hasTable('knex_migrations_lock')))
                    return false;
                const lock = await database('knex_migrations_lock').first();
                return lock?.is_locked === 1;
            },
            clearKnexLock: () => database.migrate.forceFreeMigrationsLock(),
            runGraphileMigrations: async () => {},
            onLeaseLost: (error) => {
                throw error;
            },
            log: () => {},
            logError: () => {},
            warn: () => {},
            migrationMaxAttempts,
            migrationRetryDelayMs: 25,
        });
        await runMigrateCli(['up'], context);
    };

    beforeAll(async () => {
        connectionUri = process.env.PGCONNECTIONURI ?? '';
        if (
            !connectionUri ||
            !['localhost', '127.0.0.1', '[::1]'].includes(
                new URL(connectionUri).hostname,
            )
        ) {
            throw new Error(
                'Set PGCONNECTIONURI to an isolated local PostgreSQL instance',
            );
        }
        migrationDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'recency-index-migrations-'),
        );
        await promisify(execFile)('pnpm', [
            'exec',
            'tsc',
            '--ignoreConfig',
            '--target',
            'ES2022',
            '--module',
            'commonjs',
            '--skipLibCheck',
            '--outDir',
            migrationDirectory,
            ...fixtures.map((fixture) =>
                path.resolve(__dirname, '..', `${fixture.filename}.ts`),
            ),
        ]);
        admin = connect(4);
        await admin.raw('CREATE SCHEMA ??', [schema]);
        database = connect(1, '-c statement_timeout=250 -c lock_timeout=37');
        heartbeatDatabase = connect();
        await Promise.all(
            fixtures.map(async (fixture) => {
                await admin.schema.createTable(fixture.table, (table) => {
                    table
                        .uuid('event_uuid')
                        .primary()
                        .defaultTo(admin.raw('gen_random_uuid()'));
                    table.uuid(fixture.uuidColumn).notNullable().index();
                    table.uuid('user_uuid').nullable();
                    table.jsonb('context').nullable();
                    table.timestamp('timestamp').notNullable();
                    table.index(['user_uuid', 'timestamp']);
                });
                await admin.raw(
                    `INSERT INTO ?? (??, timestamp)
                 SELECT CASE WHEN n % 1000 = 0 THEN ?::uuid ELSE md5((n % 1000)::text)::uuid END,
                        timestamp '2026-01-01' + n * interval '1 second'
                 FROM generate_series(1, ?) AS n`,
                    [fixture.table, fixture.uuidColumn, contentUuid, rowCount],
                );
            }),
        );
        console.info(
            `PostgreSQL fixtures: ${rowCount} events per table; compiled JS; pool max 1`,
        );
    });

    beforeEach(async () => {
        await Promise.all(
            fixtures.map((fixture) =>
                admin.raw('DROP INDEX IF EXISTS ??', [
                    `${schema}.${fixture.index}`,
                ]),
            ),
        );
        await Promise.all(
            [
                'knex_migrations',
                'knex_migrations_lock',
                'migration_run_ledger',
                'migration_lease',
            ].map((table) =>
                admin.schema.withSchema(schema).dropTableIfExists(table),
            ),
        );
    });

    afterAll(async () => {
        await database?.destroy();
        await heartbeatDatabase?.destroy();
        if (admin) {
            await admin.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
            await admin.destroy();
        }
        if (migrationDirectory)
            await fs.rm(migrationDirectory, { recursive: true, force: true });
    });

    describe.each(fixtures)('$table', (fixture) => {
        it('also builds and reverses an index on an empty table', async () => {
            const emptySchema = `${schema}_empty`;
            await admin.raw('CREATE SCHEMA ??', [emptySchema]);
            const emptyDatabase = connect(1, '', emptySchema);
            try {
                await admin.raw('CREATE TABLE ?? (LIKE ?? INCLUDING ALL)', [
                    `${emptySchema}.${fixture.table}`,
                    `${schema}.${fixture.table}`,
                ]);
                await fixture.migration.up(emptyDatabase);
                expect(
                    (await indexState(fixture.index, emptySchema))?.valid,
                ).toBe(true);
                await fixture.migration.down(emptyDatabase);
                expect(
                    await indexState(fixture.index, emptySchema),
                ).toBeUndefined();
            } finally {
                await emptyDatabase.destroy();
                await admin.raw('DROP SCHEMA ?? CASCADE', [emptySchema]);
            }
        });

        it('works for a non-superuser table owner', async () => {
            const role = `recency_owner_${process.pid}_${fixture.uuidColumn}`;
            await admin.raw('CREATE ROLE ??', [role]);
            const ownerDatabase = connect(1, `-c role=${role}`);
            try {
                await admin.raw('GRANT USAGE, CREATE ON SCHEMA ?? TO ??', [
                    schema,
                    role,
                ]);
                await admin.raw('ALTER TABLE ?? OWNER TO ??', [
                    fixture.table,
                    role,
                ]);
                await fixture.migration.up(ownerDatabase);
                expect((await indexState(fixture.index))?.valid).toBe(true);
                await fixture.migration.down(ownerDatabase);
                expect(await indexState(fixture.index)).toBeUndefined();
            } finally {
                await ownerDatabase.destroy();
                await admin.raw('ALTER TABLE ?? OWNER TO CURRENT_USER', [
                    fixture.table,
                ]);
                await admin.raw('REVOKE ALL ON SCHEMA ?? FROM ??', [
                    schema,
                    role,
                ]);
                await admin.raw('DROP ROLE ??', [role]);
            }
        });

        it('builds the correct valid index, preserves events, and is idempotent', async () => {
            await fixture.migration.up(database);
            await fixture.migration.up(database);
            const state = await indexState(fixture.index);
            expect(state?.valid).toBe(true);
            expect(state?.definition).toContain(
                `(${fixture.uuidColumn}, "timestamp" DESC)`,
            );
            expect(
                (
                    await admin(fixture.table)
                        .count<{ count: string }>('* AS count')
                        .first()
                )?.count,
            ).toBe(String(rowCount));
            await expectResetTimeouts();
        });

        it('rolls back and reapplies without deleting events', async () => {
            await fixture.migration.up(database);
            await fixture.migration.down(database);
            await fixture.migration.down(database);
            expect(await indexState(fixture.index)).toBeUndefined();
            await fixture.migration.up(database);
            expect((await indexState(fixture.index))?.valid).toBe(true);
            await expectResetTimeouts();
        });

        it('allows reads and writes while a concurrent build waits for an old snapshot', async () => {
            const reader = await admin.transaction({
                isolationLevel: 'repeatable read',
            });
            let finished = false;
            await reader(fixture.table).first();
            const build = fixture.migration.up(database).finally(() => {
                finished = true;
            });
            void build.catch(() => {});
            const eventUuid = randomUUID();
            try {
                await waitForBuild(fixture.table, 'waiting for old snapshots');
                await admin.transaction(async (writer) => {
                    await writer.raw("SET LOCAL lock_timeout = '500ms'");
                    await writer<FixtureEvent>(fixture.table).insert({
                        event_uuid: eventUuid,
                        [fixture.uuidColumn]: contentUuid,
                        timestamp: new Date('2026-09-14T12:00:00Z'),
                    });
                    await writer<FixtureEvent>(fixture.table)
                        .where('event_uuid', eventUuid)
                        .update({
                            timestamp: new Date('2026-09-14T13:00:00Z'),
                        });
                    await writer(fixture.table)
                        .where('event_uuid', eventUuid)
                        .first();
                    const deletedUuid = randomUUID();
                    await writer<FixtureEvent>(fixture.table).insert({
                        event_uuid: deletedUuid,
                        [fixture.uuidColumn]: contentUuid,
                        timestamp: new Date('2026-09-14T12:00:00Z'),
                    });
                    await writer(fixture.table)
                        .where('event_uuid', deletedUuid)
                        .delete();
                });
                expect(finished).toBe(false);
            } finally {
                await reader.rollback();
                await build;
            }
            expect((await indexState(fixture.index))?.valid).toBe(true);
            expect(
                (
                    await admin<FixtureEvent>(fixture.table)
                        .where(fixture.uuidColumn, contentUuid)
                        .orderBy('timestamp', 'desc')
                        .first()
                )?.event_uuid,
            ).toBe(eventUuid);
            await admin(fixture.table).where('event_uuid', eventUuid).delete();
            await expectResetTimeouts();
        });

        it('fails within the bounded lock wait and resets/reuses the session', async () => {
            const blocker = await admin.transaction();
            await blocker.raw('LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE', [
                fixture.table,
            ]);
            const started = Date.now();
            try {
                await expect(
                    fixture.migration.up(database),
                ).rejects.toMatchObject({ code: '55P03' });
                expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
                expect(Date.now() - started).toBeLessThan(9000);
                await expectResetTimeouts();
            } finally {
                await blocker.rollback();
            }
        });

        it('uses the bounded lock wait during rollback rather than the inherited statement timeout', async () => {
            await fixture.migration.up(database);
            const blocker = await admin.transaction();
            await blocker.raw('LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE', [
                fixture.table,
            ]);
            const started = Date.now();
            try {
                await expect(
                    fixture.migration.down(database),
                ).rejects.toMatchObject({ code: '55P03' });
                expect(Date.now() - started).toBeGreaterThanOrEqual(4500);
                expect(Date.now() - started).toBeLessThan(9000);
                await expectResetTimeouts();
            } finally {
                await blocker.rollback();
            }
        });

        it('recovers a genuinely cancelled concurrent build through the production-style runner', async () => {
            const reader = await admin.transaction({
                isolationLevel: 'repeatable read',
            });
            await reader(fixture.table).first();
            const build = fixture.migration.up(database);
            void build.catch(() => {});
            try {
                const progress = await waitForBuild(
                    fixture.table,
                    'waiting for old snapshots',
                );
                await admin.raw('SELECT pg_cancel_backend(?)', [progress.pid]);
                await expect(build).rejects.toMatchObject({ code: '57014' });
            } finally {
                await reader.rollback();
            }
            expect((await indexState(fixture.index))?.valid).toBe(false);
            await expectResetTimeouts();
            await runRunner();
            expect(
                await Promise.all(
                    fixtures.map(
                        async (item) => (await indexState(item.index))?.valid,
                    ),
                ),
            ).toEqual([true, true]);
            expect(
                (
                    await getKnexMigrationState(
                        database,
                        database.client.config.migrations!,
                    )
                ).pending,
            ).toEqual([]);
            await runRunner();
        });
    });

    it('retries a lock-timeout failure using the real lease/ledger/Knex path', async () => {
        const blocker = await admin.transaction();
        await blocker.raw(
            'LOCK TABLE analytics_chart_views IN ACCESS EXCLUSIVE MODE',
        );
        let failures = 0;
        try {
            await runRunner(async (name) => {
                try {
                    await database.migrate.up({ name });
                } catch (error) {
                    failures += 1;
                    await blocker.rollback();
                    throw error;
                }
            });
        } finally {
            if (!blocker.isCompleted()) await blocker.rollback();
        }
        expect(failures).toBe(1);
        expect(
            await admin('migration_run_ledger')
                .orderBy('attempt')
                .pluck('outcome'),
        ).toEqual(['retrying', 'succeeded']);
        expect(
            await Promise.all(
                fixtures.map(
                    async (fixture) => (await indexState(fixture.index))?.valid,
                ),
            ),
        ).toEqual([true, true]);
    });
});
