import { Knex } from 'knex';

const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    // Ensure the column is indexed
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.index(['cache_key']);
    });

    // Second, update all null values to 'n/a'
    await knex(QUERY_HISTORY_TABLE)
        .update({
            // @ts-ignore ignore update type
            cache_key: 'n/a',
        })
        .whereNull('cache_key');

    // Then alter the column to be non-nullable
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string('cache_key').notNullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop the index
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropIndex(['cache_key']);
    });

    // Revert the column to be nullable
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.string('cache_key').nullable().alter();
    });
}
