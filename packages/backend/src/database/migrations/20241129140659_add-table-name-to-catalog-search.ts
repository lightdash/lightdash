import { Knex } from 'knex';

const CATALOG_SEARCH_TABLE = 'catalog_search';
const CACHED_EXPLORE_TABLE = 'cached_explore';

// Explanation for commented code in: 20241203205321_delete_incorrect_catalog_changes_if_exist.ts

export async function up(knex: Knex): Promise<void> {
    // setting to nullable to allow for migration of existing data
    // await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
    //     table.text('table_name').nullable();
    // });
    // // backfill table_name with data from cached_explore
    // await knex.raw(`
    //     UPDATE ${CATALOG_SEARCH_TABLE}
    //     SET table_name = ${CACHED_EXPLORE_TABLE}.explore->>'baseTable'
    //     FROM ${CACHED_EXPLORE_TABLE}
    //     WHERE ${CACHED_EXPLORE_TABLE}.cached_explore_uuid = ${CATALOG_SEARCH_TABLE}.cached_explore_uuid
    // `);
    // // make table_name not nullable and add unique constraint
    // await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
    //     table.text('table_name').notNullable().alter();
    //     // this index was created incorrectly, has to be fixed in 20241203175631_fix-catalog-search-index.ts and changed in this migration
    //     table.unique(['table_name', 'name', 'project_uuid', 'type']);
    // });
}

export async function down(knex: Knex): Promise<void> {
    // await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
    //     table.dropUnique(['table_name', 'name', 'project_uuid', 'type']);
    //     table.dropColumn('table_name');
    // });
}
