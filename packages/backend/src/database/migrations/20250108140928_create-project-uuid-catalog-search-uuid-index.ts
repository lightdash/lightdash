import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.index(['project_uuid', 'catalog_search_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.dropIndex(['project_uuid', 'catalog_search_uuid']);
    });
}
