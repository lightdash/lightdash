import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table
            .uuid('default_project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .nullable()
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('organizations', (table) => {
        table.dropColumn('default_project_uuid');
    });
}
