import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    // First update all null values to 'n/a'
    await knex(QUERY_HISTORY_TABLE)
        .update({
            // @ts-ignore ignore update typing
            cache_key: 'n/a',
        })
        .whereNull('cache_key');

    // Then alter the column to be non-nullable with default value
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string('cache_key').notNullable().defaultTo('n/a').alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Revert the column to be nullable
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string('cache_key').nullable().alter();
    });
}
