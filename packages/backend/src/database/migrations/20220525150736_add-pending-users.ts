import { Knex } from 'knex';

const INVITES_TABLE_NAME = 'invite_links';
const USERS_TABLE_NAME = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex(INVITES_TABLE_NAME).delete();
    await knex.schema.alterTable(INVITES_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('email');
        tableBuilder
            .uuid('user_uuid')
            .unique()
            .notNullable()
            .references('user_uuid')
            .inTable(USERS_TABLE_NAME)
            .onDelete('CASCADE');
    });
    await knex.schema.alterTable(USERS_TABLE_NAME, (tableBuilder) => {
        tableBuilder.boolean('is_active').defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(INVITES_TABLE_NAME).delete();
    await knex.schema.alterTable(INVITES_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('user_uuid');
        tableBuilder.text('email').notNullable();
    });
    await knex.schema.alterTable(USERS_TABLE_NAME, (tableBuilder) => {
        tableBuilder.dropColumn('is_active');
    });
}
