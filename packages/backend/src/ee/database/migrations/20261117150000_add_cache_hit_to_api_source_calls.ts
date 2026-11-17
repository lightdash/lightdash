import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a NOT NULL boolean with a constant default, which Postgres stores as table metadata without rewriting rows; code that has not shipped yet keeps inserting without it.',
};

const ApiSourceCallsTable = 'api_source_calls';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw(
        `ALTER TABLE ${ApiSourceCallsTable}
         ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '60s'`);
    await knex.raw(
        `ALTER TABLE ${ApiSourceCallsTable} DROP COLUMN IF EXISTS cache_hit`,
    );
}
