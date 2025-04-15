import { Knex } from 'knex';

const RESULTS_CACHE_TABLE = 'results_cache';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(RESULTS_CACHE_TABLE, (table) => {
        table.dropColumn('updated_at');
    });
}
