import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an empty dashboard slug history table without changing existing dashboard writes',
} as const;

const DashboardSlugMappingsTableName = 'dashboard_slug_mappings';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    if (await knex.schema.hasTable(DashboardSlugMappingsTableName)) return;

    await knex.schema.createTable(DashboardSlugMappingsTableName, (table) => {
        table
            .uuid('dashboard_slug_mapping_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('dashboard_uuid')
            .notNullable()
            .references('dashboard_uuid')
            .inTable('dashboards')
            .onDelete('CASCADE')
            .index();
        table.string('slug', 255).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'slug'], {
            indexName: 'dashboard_slug_mappings_project_uuid_slug_unique',
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(DashboardSlugMappingsTableName);
}
