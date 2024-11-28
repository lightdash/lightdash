import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(METRICS_TREE_EDGES_TABLE))) {
        await knex.schema.createTable(METRICS_TREE_EDGES_TABLE, (table) => {
            table
                .uuid('source_catalog_search_uuid')
                .notNullable()
                .references('catalog_search_uuid')
                .inTable(CATALOG_SEARCH_TABLE)
                .onDelete('CASCADE');

            table
                .uuid('target_catalog_search_uuid')
                .notNullable()
                .references('catalog_search_uuid')
                .inTable(CATALOG_SEARCH_TABLE)
                .onDelete('CASCADE');

            table.primary([
                'source_catalog_search_uuid',
                'target_catalog_search_uuid',
            ]);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(METRICS_TREE_EDGES_TABLE);
}
