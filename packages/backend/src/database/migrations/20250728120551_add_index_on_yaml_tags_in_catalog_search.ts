import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.index('yaml_tags', 'catalog_search_yaml_tags_index', 'GIN');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.dropIndex(['yaml_tags']);
    });
}
