import { Knex } from 'knex';

const ContentAsCodeAppliedRevisionsTableName =
    'content_as_code_applied_revisions';

export const classification = {
    kind: 'safe',
    reason: 'Adds an expand-only table for last-applied content-as-code revisions',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.createTable(
        ContentAsCodeAppliedRevisionsTableName,
        (table) => {
            table
                .uuid('content_as_code_applied_revision_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE')
                .index();
            table.text('content_type').notNullable();
            table.text('slug').notNullable();
            table.jsonb('snapshot').notNullable();
            table.text('snapshot_hash').notNullable();
            table
                .timestamp('applied_at', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('applied_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table.unique(['project_uuid', 'content_type', 'slug']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(ContentAsCodeAppliedRevisionsTableName);
}
