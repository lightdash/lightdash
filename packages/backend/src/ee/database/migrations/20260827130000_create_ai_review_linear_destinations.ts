import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty project-scoped Linear destination table',
} as const;

const tableName = 'ai_agent_review_linear_destinations';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.createTable(tableName, (table) => {
        table
            .uuid('ai_review_linear_destination_uuid')
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .primary();
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
            .unique()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('linear_team_id').nullable();
        table.text('linear_project_id').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(tableName);
}
