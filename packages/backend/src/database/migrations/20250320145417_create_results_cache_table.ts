import { Knex } from 'knex';

const RESULTS_CACHE_TABLE = 'results_cache';
const PROJECTS_TABLE = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(RESULTS_CACHE_TABLE, (table) => {
        table.string('cache_key').primary();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table
            .uuid('project_uuid')
            .nullable()
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('SET NULL');

        table.timestamp('expires_at').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTable(RESULTS_CACHE_TABLE);
}
