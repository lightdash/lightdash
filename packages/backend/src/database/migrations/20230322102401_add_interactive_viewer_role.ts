import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';
const projectMembershipRolesTableName = 'project_membership_roles';
const projectMembershipTableName = 'project_memberships';
const organizationMembershipTableName = 'organization_memberships';

export async function up(knex: Knex): Promise<void> {
    await knex(projectMembershipRolesTableName).insert({
        role: 'interactive_viewer',
    });
    await knex(organizationMembershipRolesTableName).insert({
        role: 'interactive_viewer',
    });
}

export async function down(knex: Knex): Promise<void> {
    // First delete all project memberships with the interactive_viewer role which has a RESTRICT foreign key constraint
    await knex(projectMembershipTableName)
        .where('role', 'interactive_viewer')
        .delete();
    await knex(organizationMembershipTableName)
        .where('role', 'interactive_viewer')
        .delete();

    await knex(projectMembershipRolesTableName)
        .where('role', 'interactive_viewer')
        .delete();

    await knex(organizationMembershipRolesTableName)
        .where('role', 'interactive_viewer')
        .delete();
}
