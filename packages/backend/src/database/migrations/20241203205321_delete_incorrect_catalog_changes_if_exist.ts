import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';

/**
 * This migration deletes the metrics_tree_edges table and the table_name column from the catalog_search table
 * if they exist.
 *
 * It's a no-op if the tables/columns do not exist.
 *
 * Created with the purpose of undoing the changes introduced in
 * 20241129140659_add-table-name-to-catalog-search.ts
 * 20241129140724_add-metrics-tree-edges-table.ts
 * 20241203175631_fix-catalog-search-index.ts
 *
 * The changes were introduced to fix the wrong unique index created for the catalog_search table
 *
 * Code is commented as if the migration never happened. And this migrationwill remove the changes for the instances where the migrations were applied.
 */

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(METRICS_TREE_EDGES_TABLE)) {
        await knex.schema.dropTable(METRICS_TREE_EDGES_TABLE);
    }

    if (await knex.schema.hasColumn(CATALOG_SEARCH_TABLE, 'table_name')) {
        await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
            table.dropColumn('table_name');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    // no-op
}
