import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable text column without reading or rewriting existing rows',
} as const;

const QUERY_HISTORY_TABLE = 'query_history';
const ERROR_NAME_COLUMN = 'error_name';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.text(ERROR_NAME_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(ERROR_NAME_COLUMN);
    });
}
