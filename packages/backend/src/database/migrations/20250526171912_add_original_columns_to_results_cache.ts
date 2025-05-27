import { Knex } from 'knex';

const RESULTS_CACHE_TABLE = 'results_cache';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table.jsonb('original_columns').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table.dropColumn('original_columns');
    });
}
