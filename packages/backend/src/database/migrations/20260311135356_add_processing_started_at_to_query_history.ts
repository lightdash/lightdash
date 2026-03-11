import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';
const PROCESSING_STARTED_AT_COLUMN = 'processing_started_at';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table
            .timestamp(PROCESSING_STARTED_AT_COLUMN, { useTz: false })
            .nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn(PROCESSING_STARTED_AT_COLUMN);
    });
}
