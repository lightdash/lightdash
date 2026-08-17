import { Knex } from 'knex';

const SavedQueryVersionMergesTableName = 'saved_queries_version_merges';

const setSchemaVersionDefault = async (
    knex: Knex,
    schemaVersion: 1 | 2,
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

export async function up(knex: Knex): Promise<void> {
    await setSchemaVersionDefault(knex, 2);
}

export async function down(knex: Knex): Promise<void> {
    await setSchemaVersionDefault(knex, 1);
}
