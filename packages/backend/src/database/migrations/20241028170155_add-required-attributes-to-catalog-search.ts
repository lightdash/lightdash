import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.jsonb('required_attributes').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.dropColumn('required_attributes');
    });
}
