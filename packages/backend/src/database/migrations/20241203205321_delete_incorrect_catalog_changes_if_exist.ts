import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';
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
