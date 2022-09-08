import { Knex } from 'knex';

const organizationMembershipsTableName = 'organization_memberships';
const organizationMembershipRolesTableName = 'organization_membership_roles';

export async function up(knex: Knex): Promise<void> {
    await knex(organizationMembershipRolesTableName).insert({ role: 'member' });
}

export async function down(knex: Knex): Promise<void> {
    await knex(organizationMembershipsTableName)
        .update('role', 'viewer')
        .where('role', 'member');
    await knex(organizationMembershipRolesTableName)
        .where('role', 'member')
        .delete();
}
