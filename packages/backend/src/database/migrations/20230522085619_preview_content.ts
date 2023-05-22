import { Knex } from 'knex';

const PreviewContentTableName = 'preview_content';
const ProjectsTableName = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(PreviewContentTableName))) {
        await knex.schema.createTable(PreviewContentTableName, (table) => {
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .notNullable()
                .onDelete('CASCADE');
            table
                .uuid('preview_project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .notNullable()
                .onDelete('CASCADE');
            table.jsonb('content_mapping').notNullable();

            table.index(['project_uuid', 'preview_project_uuid']);
        });

        await knex.schema.alterTable(ProjectsTableName, (table) => {
            table
                .uuid('copied_from_project_uuid')
                .references('project_uuid')
                .inTable('projects')
                .nullable()
                .onDelete('SET NULL');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PreviewContentTableName);

    await knex.schema.alterTable(ProjectsTableName, (table) => {
        table.dropColumn('copied_from_project_uuid');
    });
}
