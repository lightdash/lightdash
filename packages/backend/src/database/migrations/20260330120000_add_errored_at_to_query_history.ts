import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const ERRORED_AT_COLUMN = 'errored_at';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.timestamp(ERRORED_AT_COLUMN, { useTz: false }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(ERRORED_AT_COLUMN);
    });
}
