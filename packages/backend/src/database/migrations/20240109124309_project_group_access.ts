import { Knex } from 'knex';

const PROJECTS_TABLE_NAME = 'projects';
const GROUPS_TABLE_NAME = 'groups';
const PROJECT_MEMBERSHIP_ROLES_TABLE_NAME = 'project_membership_roles';
const PROJECT_GROUP_ACCESS_TABLE_NAME = 'project_group_access';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(PROJECT_GROUP_ACCESS_TABLE_NAME))) {
        await knex.schema.createTable(
            PROJECT_GROUP_ACCESS_TABLE_NAME,
            (table) => {
                table
                    .integer('project_id')
                    .notNullable()
                    .references('project_id')
                    .inTable(PROJECTS_TABLE_NAME)
                    .onDelete('CASCADE');
                table
                    .uuid('group_uuid')
                    .notNullable()
                    .references('group_uuid')
                    .inTable(GROUPS_TABLE_NAME)
                    .onDelete('CASCADE');
                table
                    .text('role')
                    .references('role')
                    .inTable(PROJECT_MEMBERSHIP_ROLES_TABLE_NAME)
                    .notNullable()
                    .onDelete('RESTRICT')
                    .defaultTo('viewer');
                table.unique(['project_id', 'group_uuid']);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(PROJECT_GROUP_ACCESS_TABLE_NAME);
}
