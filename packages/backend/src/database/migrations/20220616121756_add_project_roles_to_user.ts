import { Knex } from 'knex';

const projectMembershipRolesTableName = 'project_membership_roles';
const projectMembershipsTableName = 'project_memberships';
const usersTable = 'users';
const projectsTable = 'projects';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(projectMembershipRolesTableName))) {
        await knex.schema.createTable(
            projectMembershipRolesTableName,
            (tableBuilder) => {
                tableBuilder.text('role').primary();
            },
        );
        await knex(projectMembershipRolesTableName).insert(
            ['viewer', 'editor', 'admin'].map((role) => ({ role })),
        );
    }
    await knex.schema.createTable(
        projectMembershipsTableName,
        (tableBuilder) => {
            tableBuilder
                .text('role')
                .references('role')
                .inTable(projectMembershipRolesTableName)
                .notNullable()
                .onDelete('RESTRICT')
                .defaultTo('viewer');
            tableBuilder
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            tableBuilder
                .integer('user_id')
                .references('user_id')
                .inTable(usersTable)
                .notNullable()
                .onDelete('CASCADE');
            tableBuilder
                .integer('project_id')
                .references('project_id')
                .inTable(projectsTable)
                .notNullable()
                .onDelete('CASCADE');
            tableBuilder.unique(['project_id', 'user_id']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(projectMembershipsTableName);
    await knex.schema.dropTableIfExists(projectMembershipRolesTableName);
}
