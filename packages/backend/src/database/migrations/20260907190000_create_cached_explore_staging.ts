import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an isolated staging table for atomic cached explore replacement',
} as const;

const CachedExploreStagingTableName = 'cached_explore_staging';
const ProjectsTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(CachedExploreStagingTableName, (table) => {
        table
            .uuid('cached_explore_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('save_uuid').notNullable();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(ProjectsTableName)
            .onDelete('CASCADE')
            .index();
        table.text('name').notNullable();
        table.specificType('table_names', 'TEXT[]').notNullable();
        table.jsonb('explore').notNullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.unique(['save_uuid', 'name', 'project_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable(CachedExploreStagingTableName);
}
