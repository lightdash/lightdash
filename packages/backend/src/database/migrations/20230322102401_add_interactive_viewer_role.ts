import { Knex } from 'knex';

const organizationMembershipsTableName = 'organization_memberships';
const organizationMembershipRolesTableName = 'organization_membership_roles';

export async function up(knex: Knex): Promise<void> {
    await knex(organizationMembershipRolesTableName).insert({
        role: 'interactive_viewer',
    });
    await knex(organizationMembershipsTableName)
        .update('role', 'interactive_viewer')
        .where('role', 'viewer');
}

export async function down(knex: Knex): Promise<void> {
    await knex(organizationMembershipsTableName)
        .update('role', 'viewer')
        .where('role', 'interactive_viewer');
    await knex(organizationMembershipRolesTableName)
        .where('role', 'interactive_viewer')
        .delete();
}
