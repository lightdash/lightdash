import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.index(
            'joined_tables',
            'catalog_search_joined_tables_index',
            'GIN',
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.dropIndex(['joined_tables']);
    });
}
