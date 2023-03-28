import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';
const projectMembershipRolesTableName = 'project_membership_roles';

export async function up(knex: Knex): Promise<void> {
    await knex(projectMembershipRolesTableName).insert({
        role: 'interactive_viewer',
    });
    await knex(organizationMembershipRolesTableName).insert({
        role: 'interactive_viewer',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(projectMembershipRolesTableName)
        .where('role', 'interactive_viewer')
        .delete();

    await knex(organizationMembershipRolesTableName)
        .where('role', 'interactive_viewer')
        .delete();
}
