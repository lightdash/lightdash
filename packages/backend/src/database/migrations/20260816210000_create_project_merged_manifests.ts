import { type Knex } from 'knex';

const ProjectMergedManifestsTableName = 'project_merged_manifests';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(ProjectMergedManifestsTableName, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.binary('manifest').notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(ProjectMergedManifestsTableName);
}
