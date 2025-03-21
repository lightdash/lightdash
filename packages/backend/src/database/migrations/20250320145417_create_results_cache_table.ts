import { Knex } from 'knex';

const RESULTS_CACHE_TABLE = 'results_cache';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(RESULTS_CACHE_TABLE, (table) => {
        table.string('cache_key').primary();
        table.uuid('project_uuid').notNullable();
        table.timestamp('cache_expires_at').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(RESULTS_CACHE_TABLE);
}
