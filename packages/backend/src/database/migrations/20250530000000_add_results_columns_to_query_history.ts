import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string('results_file_name').nullable();
        table.timestamp('results_created_at', { useTz: false }).nullable();
        table.timestamp('results_updated_at', { useTz: false }).nullable();
        table.timestamp('results_expires_at', { useTz: false }).nullable();
        table.jsonb('columns').nullable();
        table.jsonb('original_columns').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropColumn('results_file_name');
        table.dropColumn('results_created_at');
        table.dropColumn('results_updated_at');
        table.dropColumn('results_expires_at');
        table.dropColumn('columns');
        table.dropColumn('original_columns');
    });
}
