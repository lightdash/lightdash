import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table and a partial unique index on it',
} as const;

const WorkspacesTableName = 'semantic_studio_workspaces';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.createTable(WorkspacesTableName, (table) => {
        table
            .uuid('semantic_studio_workspace_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('ai_thread_uuid')
            .notNullable()
            .unique()
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('CASCADE');
        table.text('name').notNullable();
        table.boolean('is_active').notNullable().defaultTo(false);
        table.text('pull_request_url').nullable();
        table.text('pull_request_state').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.timestamp('finished_at', { useTz: true }).nullable();
    });
    await knex.raw(
        `CREATE UNIQUE INDEX semantic_studio_workspaces_one_active ON ${WorkspacesTableName} (project_uuid, created_by_user_uuid) WHERE is_active`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(WorkspacesTableName);
}
