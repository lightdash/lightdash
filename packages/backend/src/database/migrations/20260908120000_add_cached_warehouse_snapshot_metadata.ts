import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable cache metadata columns without a backfill',
} as const;

const TABLE = 'cached_warehouse';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(TABLE, (table) => {
        table.timestamp('fetched_at', { useTz: true }).nullable();
        table.jsonb('missing_tables').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(TABLE, (table) => {
        table.dropColumns('fetched_at', 'missing_tables');
    });
}
