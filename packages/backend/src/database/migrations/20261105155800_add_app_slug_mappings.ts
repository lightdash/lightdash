import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an empty app slug history table without changing existing app writes',
} as const;

const AppSlugMappingsTableName = 'app_slug_mappings';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    if (await knex.schema.hasTable(AppSlugMappingsTableName)) return;

    await knex.schema.createTable(AppSlugMappingsTableName, (table) => {
        table
            .uuid('app_slug_mapping_uuid')
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
            .uuid('app_id')
            .notNullable()
            .references('app_id')
            .inTable('apps')
            .onDelete('CASCADE')
            .index();
        table.string('slug', 255).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'slug'], {
            indexName: 'app_slug_mappings_project_uuid_slug_unique',
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(AppSlugMappingsTableName);
}
