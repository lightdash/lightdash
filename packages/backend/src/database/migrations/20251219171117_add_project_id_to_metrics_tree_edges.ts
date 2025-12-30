import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';
const PROJECTS_TABLE = 'projects';

export async function up(knex: Knex): Promise<void> {
    // 1. Add nullable column first to allow backfill
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.uuid('project_uuid').nullable();
    });

    // 2. Backfill project_uuid from catalog_search via source_metric
    // Only update rows where project_uuid IS NULL to handle concurrent inserts
    await knex.raw(`
        UPDATE ${METRICS_TREE_EDGES_TABLE} e
        SET project_uuid = c.project_uuid
        FROM ${CATALOG_SEARCH_TABLE} c
        WHERE e.source_metric_catalog_search_uuid = c.catalog_search_uuid
          AND e.project_uuid IS NULL
    `);

    // 3. Make column NOT NULL after backfill
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.uuid('project_uuid').notNullable().alter();
    });

    // 4. Add foreign key constraint with CASCADE delete
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable(PROJECTS_TABLE)
            .onDelete('CASCADE');
    });

    // 5. Add index for query performance
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.index('project_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
        table.dropColumn('project_uuid');
    });
}
