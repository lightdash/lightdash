import { Knex } from 'knex';

const PreAggregateDailyStatsTableName = 'pre_aggregate_daily_stats';
const ColumnName = 'fallback_count';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PreAggregateDailyStatsTableName, (table) => {
        // Matched queries whose pre-aggregate execution failed and were served from the warehouse
        table.integer(ColumnName).notNullable().defaultTo(0);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(PreAggregateDailyStatsTableName, (table) => {
        table.dropColumn(ColumnName);
    });
}
