import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a timestamp with a stable default through metadata and normalizes future creation defaults without rewriting existing rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`ALTER TABLE query_history
        ADD COLUMN query_created_at_utc timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`ALTER TABLE query_history
        DROP COLUMN query_created_at_utc,
        ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`);
}
