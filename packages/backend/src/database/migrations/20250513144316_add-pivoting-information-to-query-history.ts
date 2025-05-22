import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.jsonb('pivot_configuration').nullable();
        table.jsonb('pivot_values_columns').nullable();
        table.integer('pivot_total_column_count').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn('pivot_configuration');
        table.dropColumn('pivot_values_columns');
        table.dropColumn('pivot_total_column_count');
    });
}
