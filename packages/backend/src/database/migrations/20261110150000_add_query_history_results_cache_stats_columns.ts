import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable query history columns without a default or table rewrite; existing readers and writers remain compatible.',
} as const;

const TableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.text('request_chart_uuid').nullable();
        table.text('request_saved_sql_uuid').nullable();
        table.text('request_dashboard_uuid').nullable();
        table.text('metric_query_explore_name').nullable();
        table.double('warehouse_bytes_billed').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.dropColumn('request_chart_uuid');
        table.dropColumn('request_saved_sql_uuid');
        table.dropColumn('request_dashboard_uuid');
        table.dropColumn('metric_query_explore_name');
        table.dropColumn('warehouse_bytes_billed');
    });
}
