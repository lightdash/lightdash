import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.jsonb('icon').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('catalog_search', (table) => {
        table.dropColumn('icon');
    });
}
