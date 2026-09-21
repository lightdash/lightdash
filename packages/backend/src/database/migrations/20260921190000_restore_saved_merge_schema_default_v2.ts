import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Restores the compatible default for new saved merge rows without changing existing data',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE saved_queries_version_merges ALTER COLUMN schema_version SET DEFAULT 2',
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE saved_queries_version_merges ALTER COLUMN schema_version SET DEFAULT 3',
    );
}
