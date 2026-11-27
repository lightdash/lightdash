import knex, { type Knex } from 'knex';
import * as eeIndexes from '../../../ee/database/migrations/20261125120100_index_ee_user_delete_foreign_keys';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import * as coreIndexes from '../20261125120000_index_user_delete_foreign_keys';

const migrations = [
    {
        label: 'core',
        migration: coreIndexes,
        indexes: {
            saved_queries_versions_updated_by_user_uuid_index:
                'saved_queries_versions USING btree (updated_by_user_uuid)',
            group_memberships_user_id_organization_id_index:
                'group_memberships USING btree (user_id, organization_id)',
            scheduler_google_chat_target_scheduler_uuid_index:
                'scheduler_google_chat_target USING btree (scheduler_uuid)',
            emails_user_id_index: 'emails USING btree (user_id)',
        },
    },
    {
        label: 'ee',
        migration: eeIndexes,
        indexes: {
            mcp_tool_call_user_uuid_index:
                'mcp_tool_call USING btree (user_uuid)',
            ai_prompt_created_by_user_uuid_index:
                'ai_prompt USING btree (created_by_user_uuid)',
        },
    },
];

describe('user delete foreign key index migrations', () => {
    let migrated: MigratedDatabase;
    let database: Knex;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = knex({
            client: 'pg',
            connection: migrated.connectionUri,
            pool: { min: 1, max: 1 },
        });
    });

    afterAll(async () => {
        await database?.destroy();
        await migrated?.destroy();
    });

    const definition = async (name: string) => {
        const { rows } = await database.raw<{
            rows: { valid: boolean; definition: string }[];
        }>(
            'SELECT indisvalid AS valid, pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid = to_regclass(?)',
            [`public.${name}`],
        );
        return rows[0];
    };

    const timeouts = async () => {
        const { rows } = await database.raw<{
            rows: { statement: string; lock: string }[];
        }>(
            "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock",
        );
        return rows[0];
    };

    test.each(migrations)(
        '$label migration is idempotent, reversible and restores timeouts',
        async ({ migration, indexes }) => {
            await database.raw("SET statement_timeout = '37s'");
            await database.raw("SET lock_timeout = '11s'");
            const before = await timeouts();

            await migration.up(database);
            await migration.up(database);
            await Promise.all(
                Object.entries(indexes).map(async ([name, target]) => {
                    expect(await definition(name)).toEqual({
                        valid: true,
                        definition: `CREATE INDEX ${name} ON public.${target}`,
                    });
                }),
            );
            expect(await timeouts()).toEqual(before);

            await migration.down(database);
            await migration.down(database);
            await Promise.all(
                Object.keys(indexes).map(async (name) => {
                    expect(await definition(name)).toBeUndefined();
                }),
            );
            expect(await timeouts()).toEqual(before);

            await migration.up(database);
            await Promise.all(
                Object.keys(indexes).map(async (name) => {
                    expect((await definition(name))?.valid).toBe(true);
                }),
            );
        },
    );

    test('core migration replaces an invalid index left by an interrupted build', async () => {
        await coreIndexes.down(database);
        await database.raw(
            'CREATE INDEX emails_user_id_index ON emails (user_id)',
        );
        await database.raw(
            "UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'emails_user_id_index'::regclass",
        );
        expect((await definition('emails_user_id_index'))?.valid).toBe(false);

        await coreIndexes.up(database);

        expect((await definition('emails_user_id_index'))?.valid).toBe(true);
    });
});
