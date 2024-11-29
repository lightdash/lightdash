import { Knex } from 'knex';

const CATALOG_SEARCH_TABLE = 'catalog_search';
const CACHED_EXPLORE_TABLE = 'cached_explore';

export async function up(knex: Knex): Promise<void> {
    // setting to nullable to allow for migration of existing data
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.text('table_name').nullable();
    });

    // backfill table_name with data from cached_explore
    await knex(CATALOG_SEARCH_TABLE).update({
        // @ts-ignore - we're doing something similar in 20240604094543_add_views_columns_to_chart_and_dashboards_tables.ts
        table_name: knex
            .select(knex.raw(`explore->>'baseTable'`))
            .from(CACHED_EXPLORE_TABLE)
            .whereRaw(
                `${CACHED_EXPLORE_TABLE}.cached_explore_uuid = ${CATALOG_SEARCH_TABLE}.cached_explore_uuid`,
            )
            .limit(1),
    });

    // make table_name not nullable and add unique constraint
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.text('table_name').notNullable().alter();
        table.unique(['table_name', 'name', 'project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CATALOG_SEARCH_TABLE, (table) => {
        table.dropColumn('table_name');
    });
}
