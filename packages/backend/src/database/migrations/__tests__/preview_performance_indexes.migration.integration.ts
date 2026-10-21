import knex, { type Knex } from 'knex';
import * as prompts from '../../../ee/database/migrations/20261021120300_index_ai_prompt_saved_query_uuid';
import * as tabs from '../20261021120000_index_dashboard_tabs_dashboard_id';
import * as savedSql from '../20261021120100_index_saved_sql_dashboard_uuid';
import * as apps from '../20261021120200_index_apps_space_uuid';
import * as cache from '../20261021120400_index_query_history_cache_lookup';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const indexes = [
    {
        migration: tabs,
        table: 'dashboard_tabs',
        name: 'dashboard_tabs_dashboard_id_index',
        columns: 'dashboard_id',
    },
    {
        migration: savedSql,
        table: 'saved_sql',
        name: 'saved_sql_dashboard_uuid_index',
        columns: 'dashboard_uuid',
    },
    {
        migration: apps,
        table: 'apps',
        name: 'apps_space_uuid_index',
        columns: 'space_uuid',
    },
    {
        migration: prompts,
        table: 'ai_prompt',
        name: 'ai_prompt_saved_query_uuid_index',
        columns: 'saved_query_uuid',
    },
    {
        migration: cache,
        table: 'query_history',
        name: 'query_history_cache_key_project_uuid_created_at_index',
        columns: 'cache_key, project_uuid, created_at DESC',
    },
];

describe('preview deletion and cache indexes on the migrated schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('preview_indexes');
        database = knex({
            client: 'pg',
            connection: migrated.database.client.config.connection,
            pool: { min: 1, max: 1 },
        });
    });
    afterAll(async () => {
        await database?.destroy();
        await migrated?.destroy();
    });

    const state = async (name: string) => {
        const { rows } = await database.raw<{
            rows: { valid: boolean; definition: string }[];
        }>(
            'SELECT indisvalid AS valid, pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid=to_regclass(?)',
            [`public.${name}`],
        );
        return rows[0];
    };
    const settings = async () => {
        const { rows } = await database.raw<{
            rows: { statement: string; lock: string; pid: number }[];
        }>(
            "SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock,pg_backend_pid() AS pid",
        );
        return rows[0];
    };

    test.each(indexes)(
        '$name is valid, idempotent, reversible and restores session settings',
        async ({ migration, table, name, columns }) => {
            if (!(await database.schema.hasTable(table))) {
                expect(table).toBe('ai_prompt');
                expect(process.env.LIGHTDASH_LICENSE_KEY).toBeFalsy();
                return;
            }
            await database.raw("SET statement_timeout='37s'");
            await database.raw("SET lock_timeout='11s'");
            const before = await settings();
            await migration.up(database);
            await migration.up(database);
            expect(await state(name)).toEqual({
                valid: true,
                definition: `CREATE INDEX ${name} ON public.${table} USING btree (${columns})`,
            });
            expect(await settings()).toEqual(before);
            await migration.down(database);
            expect(await state(name)).toBeUndefined();
            await migration.down(database);
            await migration.up(database);
            expect((await state(name))?.valid).toBe(true);
            expect(await settings()).toEqual(before);
        },
    );

    test.each(indexes)(
        '$name recovers an interrupted build and restores timeouts after failure',
        async ({ migration, table, name }) => {
            if (!(await database.schema.hasTable(table))) return;
            await migration.down(database);
            const before = await settings();
            const blocker = await migrated.database.transaction();
            try {
                // The writer lock makes CIC wait after committing its invalid catalog entry.
                await blocker.raw('LOCK TABLE ?? IN ROW EXCLUSIVE MODE', [
                    table,
                ]);
                await expect(migration.up(database)).rejects.toMatchObject({
                    code: '55P03',
                });
                expect((await state(name))?.valid).toBe(false);
                expect(await settings()).toEqual(before);
            } finally {
                await blocker.rollback();
            }
            await migration.up(database);
            expect((await state(name))?.valid).toBe(true);
            expect(await settings()).toEqual(before);
        },
    );
});
