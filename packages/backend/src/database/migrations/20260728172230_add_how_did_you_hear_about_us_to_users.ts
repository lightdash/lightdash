import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.text('how_did_you_hear_about_us').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('how_did_you_hear_about_us');
    });
}
