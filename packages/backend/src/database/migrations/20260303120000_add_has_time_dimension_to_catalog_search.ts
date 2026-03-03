import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table
            .boolean('has_time_dimension')
            .defaultTo(false)
            .notNullable()
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(CatalogTableName, 'has_time_dimension')
    ) {
        await knex.schema.alterTable(CatalogTableName, (table) => {
            table.dropColumn('has_time_dimension');
        });
    }
}
