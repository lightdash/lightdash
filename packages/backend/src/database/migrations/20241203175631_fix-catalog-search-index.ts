import { Knex } from 'knex';

const CATALOG_SEARCH_TABLE = 'catalog_search';
const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';

// Explanation for commented code in: 20241203205321_delete_incorrect_catalog_changes_if_exist.ts

export async function up(knex: Knex): Promise<void> {
    // const wrongCatalogSearchUniqueIndexExists = await knex.raw(`
    //     SELECT 1
    //     FROM pg_indexes
    //     WHERE tablename = '${CATALOG_SEARCH_TABLE}'
    //     AND indexname = 'catalog_search_table_name_name_project_uuid_unique'
    // `);
    // // Fixing the wrong index added in 20241129140659_add-table-name-to-catalog-search.ts
    // // The index was created without the type column, which is required as fields could have the same name but be different types
    // if (wrongCatalogSearchUniqueIndexExists.rows.length > 0) {
    //     await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
    //         table.dropForeign([
    //             'source_metric_name',
    //             'source_metric_table_name',
    //             'project_uuid',
    //         ]);
    //         table.dropForeign([
    //             'target_metric_name',
    //             'target_metric_table_name',
    //             'project_uuid',
    //         ]);
    //         table.dropIndex([
    //             'source_metric_name',
    //             'source_metric_table_name',
    //             'project_uuid',
    //         ]);
    //         table.dropIndex([
    //             'target_metric_name',
    //             'target_metric_table_name',
    //             'project_uuid',
    //         ]);
    //         table.dropPrimary();
    //     });
    //     await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
    //         table.dropUnique(['table_name', 'name', 'project_uuid']);
    //         table.unique(['table_name', 'name', 'project_uuid', 'type']);
    //     });
    //     if (
    //         !(await knex.schema.hasColumn(
    //             METRICS_TREE_EDGES_TABLE,
    //             'source_metric_type',
    //         )) &&
    //         !(await knex.schema.hasColumn(
    //             METRICS_TREE_EDGES_TABLE,
    //             'target_metric_type',
    //         ))
    //     ) {
    //         await knex.schema.alterTable(METRICS_TREE_EDGES_TABLE, (table) => {
    //             table.string('source_metric_type').notNullable();
    //             table.string('target_metric_type').notNullable();
    //             table
    //                 .foreign([
    //                     'source_metric_name',
    //                     'source_metric_table_name',
    //                     'source_metric_type',
    //                     'project_uuid',
    //                 ])
    //                 .references(['name', 'table_name', 'type', 'project_uuid'])
    //                 .inTable(CATALOG_SEARCH_TABLE)
    //                 .onDelete('CASCADE');
    //             table
    //                 .foreign([
    //                     'target_metric_name',
    //                     'target_metric_table_name',
    //                     'target_metric_type',
    //                     'project_uuid',
    //                 ])
    //                 .references(['name', 'table_name', 'type', 'project_uuid'])
    //                 .inTable(CATALOG_SEARCH_TABLE)
    //                 .onDelete('CASCADE');
    //             table.index([
    //                 'source_metric_name',
    //                 'source_metric_table_name',
    //                 'source_metric_type',
    //                 'project_uuid',
    //             ]);
    //             table.index([
    //                 'target_metric_name',
    //                 'target_metric_table_name',
    //                 'target_metric_type',
    //                 'project_uuid',
    //             ]);
    //             table.primary([
    //                 'source_metric_name',
    //                 'source_metric_table_name',
    //                 'source_metric_type',
    //                 'target_metric_name',
    //                 'target_metric_table_name',
    //                 'target_metric_type',
    //                 'project_uuid',
    //             ]);
    //         });
    //     }
    // }
}

export async function down(knex: Knex): Promise<void> {
    // no-op
}
