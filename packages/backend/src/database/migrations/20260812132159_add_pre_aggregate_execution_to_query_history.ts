import { Knex } from 'knex';

const QueryHistoryTableName = 'query_history';
const ColumnName = 'pre_aggregate_execution';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        // Engine for pre_aggregate_compiled_sql: 'duckdb' | 'project_warehouse'
        table.string(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
