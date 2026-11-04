import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import * as migration from '../20261102120000_index_query_history_project_explore_created_at';

const IndexName = 'query_history_project_explore_created_at_idx';

describe('Query history concurrent explore index', () => {
    let migrated: MigratedDatabase;
    let migrationDatabase: Knex;
    let organizationUuid: string;
    let existingQueryUuid: string;

    const queryRow = () => ({
        query_uuid: randomUUID(),
        organization_uuid: organizationUuid,
        context: QueryExecutionContext.EXPLORE,
        compiled_sql: 'SELECT 1',
        metric_query: { exploreName: 'orders' },
        fields: {},
        request_parameters: {},
        status: QueryHistoryStatus.READY,
        cache_key: randomUUID(),
    });

    const expectRestoredTimeouts = async () => {
        const { rows } = await migrationDatabase.raw<{
            rows: { lock_timeout: string; statement_timeout: string }[];
        }>(
            `SELECT current_setting('lock_timeout') AS lock_timeout,
                    current_setting('statement_timeout') AS statement_timeout`,
        );
        expect(rows).toEqual([
            { lock_timeout: '175ms', statement_timeout: '750ms' },
        ]);
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 3 });
        migrationDatabase = knex({
            client: 'pg',
            connection: {
                connectionString: migrated.connectionUri,
                options: '-c lock_timeout=100 -c statement_timeout=1000',
            },
            pool: { min: 0, max: 1 },
            acquireConnectionTimeout: 3000,
        });
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Query history index migration' })
            .returning('organization_uuid');
        organizationUuid = organization.organization_uuid;
        const row = queryRow();
        existingQueryUuid = row.query_uuid;
        await migrated.database('query_history').insert(row);
    });

    beforeEach(async () => {
        await migrationDatabase.raw(
            "SET lock_timeout = '175ms'; SET statement_timeout = '750ms'",
        );
        await migration.down(migrationDatabase);
    });

    afterAll(async () => {
        await migrationDatabase?.destroy();
        await migrated?.destroy();
    });

    test('waits beyond five seconds for an old snapshot while reads and writes continue', async () => {
        const blocker = await migrated.database.transaction({
            isolationLevel: 'repeatable read',
        });
        await blocker('query_history').select('query_uuid');

        const build = migration.up(migrationDatabase).then(
            () => ({ error: null }),
            (error: unknown) => ({ error }),
        );
        try {
            await expect
                .poll(
                    async () => {
                        const { rows } = await migrated.database.raw<{
                            rows: { phase: string }[];
                        }>(
                            `SELECT phase FROM pg_stat_progress_create_index
                             WHERE relid = 'query_history'::regclass
                               AND datname = current_database()`,
                        );
                        return rows[0]?.phase ?? null;
                    },
                    { timeout: 10000, interval: 25 },
                )
                .toBe('waiting for old snapshots');
            await delay(6000);

            await migrated.database.transaction(async (trx) => {
                await trx.raw("SET LOCAL statement_timeout = '1s'");
                expect(
                    await trx('query_history')
                        .where('query_uuid', existingQueryUuid)
                        .first(),
                ).toBeDefined();
                const row = queryRow();
                await trx('query_history').insert(row);
                expect(
                    await trx('query_history')
                        .where('query_uuid', row.query_uuid)
                        .update({ compiled_sql: 'SELECT 2' }),
                ).toBe(1);
                expect(
                    await trx('query_history')
                        .where('query_uuid', row.query_uuid)
                        .delete(),
                ).toBe(1);
            });
        } finally {
            await blocker.rollback();
            await build;
        }
        expect(await build).toEqual({ error: null });
        await expectRestoredTimeouts();

        const { rows } = await migrated.database.raw<{
            rows: { indisvalid: boolean }[];
        }>(
            'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass(?)',
            [IndexName],
        );
        expect(rows).toEqual([{ indisvalid: true }]);
        await migration.up(migrationDatabase);
        await migration.down(migrationDatabase);
        await migration.down(migrationDatabase);
        await expectRestoredTimeouts();
    });

    test('restores previous timeouts and releases the connection when a build fails', async () => {
        await migrationDatabase.raw('SET search_path = pg_catalog');
        try {
            await expect(migration.up(migrationDatabase)).rejects.toMatchObject(
                {
                    code: '42P01',
                },
            );
            await expectRestoredTimeouts();
        } finally {
            await migrationDatabase.raw('RESET search_path');
        }
        await expect(migration.up(migrationDatabase)).resolves.toBeUndefined();
        await expectRestoredTimeouts();
    });
});
