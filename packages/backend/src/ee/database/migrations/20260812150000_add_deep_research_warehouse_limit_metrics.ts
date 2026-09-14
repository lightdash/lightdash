import type { Knex } from 'knex';

const tableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.integer('warehouse_limit_prevented_count').nullable();
        table.integer('warehouse_limit_retry_count').nullable();
        table.integer('warehouse_limit_recovered_count').nullable();
        table.integer('warehouse_limit_unrecovered_count').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumns(
            'warehouse_limit_prevented_count',
            'warehouse_limit_retry_count',
            'warehouse_limit_recovered_count',
            'warehouse_limit_unrecovered_count',
        );
    });
}
