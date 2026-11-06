import { Knex } from 'knex';

const TableName = 'query_history';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.text('cache_miss_reason').nullable();
        table.boolean('cache_refresh_requested').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(TableName, (table) => {
        table.dropColumn('cache_miss_reason');
        table.dropColumn('cache_refresh_requested');
    });
}
