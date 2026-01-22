import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table
            .uuid('owner_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table.index('owner_user_uuid', 'idx_catalog_search_owner_user_uuid');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.dropColumn('owner_user_uuid');
    });
}
