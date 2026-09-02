import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable jsonb column without reading or rewriting existing rows',
} as const;

const QUERY_HISTORY_TABLE = 'query_history';
const USED_PARAMETERS_COLUMN = 'used_parameters';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.jsonb(USED_PARAMETERS_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(USED_PARAMETERS_COLUMN);
    });
}
