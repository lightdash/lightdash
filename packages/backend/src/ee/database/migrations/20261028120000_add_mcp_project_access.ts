import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a defaulted access mode and an empty project allow-list; existing organizations retain access to all projects.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.alterTable('ai_organization_settings', (table) => {
            table
                .text('mcp_project_access_mode')
                .notNullable()
                .defaultTo('all');
            table.check(
                "mcp_project_access_mode IN ('all', 'selected')",
                [],
                'ai_org_settings_mcp_project_access_mode_check',
            );
        });
        await knex.schema.createTable(
            'ai_organization_mcp_projects',
            (table) => {
                table
                    .uuid('organization_uuid')
                    .notNullable()
                    .references('organization_uuid')
                    .inTable('organizations')
                    .onDelete('CASCADE');
                table
                    .uuid('project_uuid')
                    .notNullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE');
                table
                    .timestamp('created_at')
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.primary(['organization_uuid', 'project_uuid']);
                table.index('project_uuid');
            },
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTable('ai_organization_mcp_projects');
        await knex.schema.alterTable('ai_organization_settings', (table) => {
            table.dropColumn('mcp_project_access_mode');
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
