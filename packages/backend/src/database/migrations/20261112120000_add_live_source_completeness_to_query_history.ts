import { Knex } from 'knex';

const QueryHistoryTableName = 'query_history';

// A nullable column without a default: a catalog-only change, no rewrite.
export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.text('live_source_completeness').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(QueryHistoryTableName, (table) => {
        table.dropColumn('live_source_completeness');
    });
}
