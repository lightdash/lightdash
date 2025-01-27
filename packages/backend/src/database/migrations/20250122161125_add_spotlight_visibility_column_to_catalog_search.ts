import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.boolean('spotlight_show').defaultTo(true).notNullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(CatalogTableName, 'spotlight_show')) {
        await knex.schema.alterTable(CatalogTableName, (table) => {
            table.dropColumn('spotlight_show');
        });
    }
}
