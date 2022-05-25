import { Knex } from 'knex';

const INVITES_TABLE_NAME = 'invite_links';

export async function up(knex: Knex): Promise<void> {
    await knex(INVITES_TABLE_NAME).delete();
    await knex.schema.alterTable(INVITES_TABLE_NAME, (tableBuilder) => {
        tableBuilder.text('email').notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(INVITES_TABLE_NAME).delete();
    await knex.schema.alterTable(INVITES_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('email');
    });
}
