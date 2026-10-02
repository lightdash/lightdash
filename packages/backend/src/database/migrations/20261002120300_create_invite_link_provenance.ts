import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an invite provenance table without changing existing invite rows',
} as const;

const TABLE = 'invite_link_provenance';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(TABLE, (table) => {
        table.text('invite_code_hash').primary();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('inviter_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.text('invitee_email').notNullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('expires_at', { useTz: true }).notNullable().index();
        table.timestamp('last_requested_at', { useTz: true }).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(TABLE);
}
