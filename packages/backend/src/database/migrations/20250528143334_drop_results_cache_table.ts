import { Knex } from 'knex';
import { ResultsCacheStatus } from '../../services/CacheService/types';

const PROJECTS_TABLE = 'projects';
const RESULTS_CACHE_TABLE = 'results_cache';
const QUERY_HISTORY_TABLE = 'query_history';

export async function up(knex: Knex): Promise<void> {
    // First remove the foreign key reference from query_history table but keep the column
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table.dropForeign('cache_key');
    });

    // Then drop the results_cache table
    await knex.schema.dropTable(RESULTS_CACHE_TABLE);
}

export async function down(knex: Knex): Promise<void> {
    // Recreate the results_cache table
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
        table.integer('total_row_count').nullable();
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .string('status')
            .notNullable()
            .defaultTo(ResultsCacheStatus.PENDING);
        table.jsonb('columns').nullable();
        table.jsonb('original_columns').nullable();
    });

    // Set all cache keys to null in the query_history table before setting the foreign key reference
    // @ts-ignore ignore update type error
    await knex(QUERY_HISTORY_TABLE).update({ cache_key: null });

    // Add back the foreign key reference to the existing cache_key column
    await knex.schema.alterTable(QUERY_HISTORY_TABLE, (table) => {
        table
            .foreign('cache_key')
            .references('cache_key')
            .inTable(RESULTS_CACHE_TABLE)
            .onDelete('SET NULL');
    });
}
