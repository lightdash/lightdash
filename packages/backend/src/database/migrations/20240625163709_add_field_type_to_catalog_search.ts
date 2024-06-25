import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.text('field_type').nullable().index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.dropColumn('field_type');
    });
}
