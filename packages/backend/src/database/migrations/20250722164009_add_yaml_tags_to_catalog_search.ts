import { Knex } from 'knex';

const TABLE_NAME = 'catalog_search';
const COLUMN_NAME = 'yaml_tags';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.specificType(COLUMN_NAME, 'TEXT[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn(COLUMN_NAME);
    });
}
