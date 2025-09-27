import { Knex } from 'knex';

const CATALOG_SEARCH_RELATIONS_TABLE_NAME = 'catalog_search_relations';
const CATALOG_SEARCH_TABLE_NAME = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        CATALOG_SEARCH_RELATIONS_TABLE_NAME,
        (table) => {
            // Reference to the explore (table item in catalog_search)
            table
                .uuid('explore_catalog_uuid')
                .notNullable()
                .references('catalog_search_uuid')
                .inTable(CATALOG_SEARCH_TABLE_NAME)
                .onDelete('CASCADE');

            // Reference to the field (field item in catalog_search)
            table
                .uuid('field_catalog_uuid')
                .notNullable()
                .references('catalog_search_uuid')
                .inTable(CATALOG_SEARCH_TABLE_NAME)
                .onDelete('CASCADE');

            // Primary key on the combination
            table.primary(['explore_catalog_uuid', 'field_catalog_uuid']);

            // Add indexes for efficient queries
            table.index('explore_catalog_uuid');
            table.index('field_catalog_uuid');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CATALOG_SEARCH_RELATIONS_TABLE_NAME);
}
