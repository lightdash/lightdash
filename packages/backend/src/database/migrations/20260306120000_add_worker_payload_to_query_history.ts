import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.text('pre_aggregate_compiled_sql').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn('pre_aggregate_compiled_sql');
    });
}
