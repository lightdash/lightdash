import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('emails', (table) => {
        table.boolean('is_verified').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('emails', (table) => {
        table.dropColumn('is_verified');
    });
}
