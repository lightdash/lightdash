import { Knex } from 'knex';

// [DEMO - DO NOT MERGE] Contract step: drop organizations.impersonation_enabled.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.dropColumn('impersonation_enabled');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.boolean('impersonation_enabled').notNullable().defaultTo(false);
    });
}
