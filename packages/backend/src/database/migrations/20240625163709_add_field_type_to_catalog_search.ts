import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.text('field_type').nullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.dropColumn('field_type');
    });
}
