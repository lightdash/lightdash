import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates an empty recency table and its indexes without scanning or altering historical analytics events.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('user_recent_content', (table) => {
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.text('content_type').notNullable();
        table.uuid('content_uuid').notNullable();
        table.timestamp('last_viewed_at', { useTz: true }).notNullable();
        table.check("content_type IN ('chart', 'dashboard')");
        table.primary([
            'user_uuid',
            'project_uuid',
            'content_type',
            'content_uuid',
        ]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('user_recent_content');
}
