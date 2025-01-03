import { Knex } from 'knex';

const METRICS_TREE_EDGES_TABLE = 'metrics_tree_edges';
const CATALOG_SEARCH_TABLE = 'catalog_search';

// Explanation for commented code in: 20241203205321_delete_incorrect_catalog_changes_if_exist.ts

export async function up(knex: Knex): Promise<void> {
    // if (!(await knex.schema.hasTable(METRICS_TREE_EDGES_TABLE))) {
    //     await knex.schema.createTable(METRICS_TREE_EDGES_TABLE, (table) => {
    //         table.string('source_metric_name').notNullable();
    //         table.string('source_metric_table_name').notNullable();
    //         table.string('source_metric_type').notNullable();
    //         table.string('target_metric_name').notNullable();
    //         table.string('target_metric_table_name').notNullable();
    //         table.string('target_metric_type').notNullable();
    //         table.uuid('project_uuid').notNullable();
    //         // Create composite foreign keys
    //         table
    //             .foreign([
    //                 'source_metric_name',
    //                 'source_metric_table_name',
    //                 'source_metric_type',
    //                 'project_uuid',
    //             ])
    //             .references(['name', 'table_name', 'type', 'project_uuid'])
    //             .inTable(CATALOG_SEARCH_TABLE)
    //             .onDelete('CASCADE');
    //         table
    //             .foreign([
    //                 'target_metric_name',
    //                 'target_metric_table_name',
    //                 'target_metric_type',
    //                 'project_uuid',
    //             ])
    //             .references(['name', 'table_name', 'type', 'project_uuid'])
    //             .inTable(CATALOG_SEARCH_TABLE)
    //             .onDelete('CASCADE');
    //         // Adding indexes for foreign key lookups
    //         table.index([
    //             'source_metric_name',
    //             'source_metric_table_name',
    //             'source_metric_type',
    //             'project_uuid',
    //         ]);
    //         table.index([
    //             'target_metric_name',
    //             'target_metric_table_name',
    //             'target_metric_type',
    //             'project_uuid',
    //         ]);
    //         // Adding composite primary key
    //         table.primary([
    //             'source_metric_name',
    //             'source_metric_table_name',
    //             'source_metric_type',
    //             'target_metric_name',
    //             'target_metric_table_name',
    //             'target_metric_type',
    //             'project_uuid',
    //         ]);
    //         // Adding created_at and created_by_user_uuid columns
    //         table
    //             .timestamp('created_at', { useTz: false })
    //             .notNullable()
    //             .defaultTo(knex.fn.now());
    //         table
    //             .uuid('created_by_user_uuid')
    //             .nullable()
    //             .references('user_uuid')
    //             .inTable('users')
    //             .onDelete('SET NULL');
    //     });
    // }
}

export async function down(knex: Knex): Promise<void> {
    // await knex.schema.dropTableIfExists(METRICS_TREE_EDGES_TABLE);
}
