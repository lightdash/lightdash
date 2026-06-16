import { Knex } from 'knex';

const ProjectCiStatusTableName = 'project_ci_status';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ProjectCiStatusTableName);
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ProjectCiStatusTableName))) {
        await knex.schema.createTable(ProjectCiStatusTableName, (table) => {
            table
                .uuid('project_ci_status_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('project_uuid')
                .notNullable()
                .unique()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .boolean('has_preview_deploy_workflow')
                .notNullable()
                .defaultTo(false);
            table.text('workflow_path').nullable();
            table.text('detected_commit_sha').nullable();
            table
                .timestamp('checked_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }
}
