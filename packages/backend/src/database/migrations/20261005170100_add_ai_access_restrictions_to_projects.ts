import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('projects', (table) => {
        table.boolean('ai_access_restrictions').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('ai_access_restrictions');
    });
}
