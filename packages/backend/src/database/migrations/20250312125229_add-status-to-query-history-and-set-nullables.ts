import {
    DEFAULT_RESULTS_PAGE_SIZE,
    QueryHistoryStatus,
} from '@lightdash/common';
import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.integer('warehouse_execution_time_ms').nullable().alter();
        table.integer('total_row_count').nullable().alter();
        table.integer('default_page_size').nullable().alter();
        table
            .string('status')
            .notNullable()
            .defaultTo(QueryHistoryStatus.READY);
        table.string('error').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(QUERY_HISTORY_TABLE)
        .update({
            warehouse_execution_time_ms: 0,
        })
        .whereNull('warehouse_execution_time_ms');

    await knex(QUERY_HISTORY_TABLE)
        .update({
            total_row_count: 0,
        })
        .whereNull('total_row_count');

    await knex(QUERY_HISTORY_TABLE)
        .update({
            default_page_size: DEFAULT_RESULTS_PAGE_SIZE,
        })
        .whereNull('default_page_size');

    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.integer('warehouse_execution_time_ms').notNullable().alter();
        table.integer('total_row_count').notNullable().alter();
        table.integer('default_page_size').notNullable().alter();
        table.dropColumn('status');
        table.dropColumn('error');
    });
}
