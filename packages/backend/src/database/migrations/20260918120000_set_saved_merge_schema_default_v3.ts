import { Knex } from 'knex';

const SavedQueryVersionMergesTableName = 'saved_queries_version_merges';

const setSchemaVersionDefault = async (
    knex: Knex,
    schemaVersion: 2 | 3,
): Promise<void> => {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${SavedQueryVersionMergesTableName} ALTER COLUMN schema_version SET DEFAULT ${schemaVersion}`,
    );
};

export const classification = {
    kind: 'safe',
    reason: 'Changes only the default for newly inserted saved merge rows',
} as const;

// Schema v3 stores the merge as a pipeline. Existing v2 rows are read and
// rewritten on load; nothing is backfilled.
export async function up(knex: Knex): Promise<void> {
    await setSchemaVersionDefault(knex, 3);
}

export async function down(knex: Knex): Promise<void> {
    await setSchemaVersionDefault(knex, 2);
}
