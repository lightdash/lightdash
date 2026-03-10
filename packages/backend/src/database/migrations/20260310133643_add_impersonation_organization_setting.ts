import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.boolean('impersonation_enabled').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.dropColumn('impersonation_enabled');
    });
}
