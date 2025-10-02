import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.index(
            'cached_explore_uuid',
            'catalog_search_cached_explore_uuid_index',
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.dropIndex(
            'cached_explore_uuid',
            'catalog_search_cached_explore_uuid_index',
        );
    });
}
