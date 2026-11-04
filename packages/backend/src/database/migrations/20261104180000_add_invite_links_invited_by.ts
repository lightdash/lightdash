import { Knex } from 'knex';

const InviteLinksTableName = 'invite_links';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(InviteLinksTableName, (table) => {
        table
            .uuid('invited_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(InviteLinksTableName, (table) => {
        table.dropColumn('invited_by_user_uuid');
    });
}
