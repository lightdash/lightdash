import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable column with its foreign key and index to projects; older binaries never read the column',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('projects', (table) => {
        table
            .uuid('last_compiled_as_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('last_compiled_as_user_uuid');
    });
}
