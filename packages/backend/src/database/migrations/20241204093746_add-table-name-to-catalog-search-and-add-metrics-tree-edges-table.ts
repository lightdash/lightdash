import { Knex } from 'knex';

const CATALOG_SEARCH_TABLE = 'catalog_search';
const CACHED_EXPLORE_TABLE = 'cached_explore';
const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';

export async function up(knex: Knex): Promise<void> {
    // setting to nullable to allow for migration of existing data
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.text('table_name').nullable();
    });

    // backfill table_name with data from cached_explore
    await knex.raw(`
        UPDATE ${CATALOG_SEARCH_TABLE}
        SET table_name = ${CACHED_EXPLORE_TABLE}.explore->>'baseTable'
        FROM ${CACHED_EXPLORE_TABLE}
        WHERE ${CACHED_EXPLORE_TABLE}.cached_explore_uuid = ${CATALOG_SEARCH_TABLE}.cached_explore_uuid
    `);

    // make table_name not nullable
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.text('table_name').notNullable().alter();
    });

    // create metrics_tree_edges table
    await knex.schema.createTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table
            .uuid('source_metric_catalog_search_uuid')
            .notNullable()
            .references('catalog_search_uuid')
            .inTable(CATALOG_SEARCH_TABLE)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('target_metric_catalog_search_uuid')
            .notNullable()
            .references('catalog_search_uuid')
            .inTable(CATALOG_SEARCH_TABLE)
            .onDelete('CASCADE')
            .index();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');

        // Adding composite primary key
        table.primary([
            'source_metric_catalog_search_uuid',
            'target_metric_catalog_search_uuid',
        ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.dropColumn('table_name');
    });

    await knex.schema.dropTableIfExists(METRICS_TREE_EDGES_TABLE);
}
