import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an empty chart slug history table without changing existing chart writes',
} as const;

const SavedQueriesTableName = 'saved_queries';
const SavedQuerySlugMappingsTableName = 'saved_query_slug_mappings';
const ProjectsTableName = 'projects';
const LockTimeout = '5s';
const MappingProjectSlugUnique =
    'saved_query_slug_mappings_project_uuid_slug_unique';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
    if (await knex.schema.hasTable(SavedQuerySlugMappingsTableName)) return;

    await knex.schema.createTable(SavedQuerySlugMappingsTableName, (table) => {
        table
            .uuid('saved_query_slug_mapping_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable(ProjectsTableName)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('saved_query_uuid')
            .notNullable()
            .references('saved_query_uuid')
            .inTable(SavedQueriesTableName)
            .onDelete('CASCADE')
            .index();
        table.string('slug', 255).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.unique(['project_uuid', 'slug'], {
            indexName: MappingProjectSlugUnique,
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
    await knex.schema.dropTableIfExists(SavedQuerySlugMappingsTableName);
}
