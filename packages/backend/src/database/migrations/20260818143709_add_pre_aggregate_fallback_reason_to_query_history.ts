import { Knex } from 'knex';

const QueryHistoryTableName = 'query_history';
const ColumnName = 'pre_aggregate_fallback_reason';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        // 'duckdb_execution_error' | 'external_execution_error'
        // non-null ⇒ pre-aggregate matched but results were served from the source warehouse
        table.string(ColumnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
