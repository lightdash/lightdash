import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';

export async function up(knex: Knex): Promise<void> {
    await knex(organizationMembershipRolesTableName).insert({ role: 'member' });
}

export async function down(knex: Knex): Promise<void> {
    await knex(organizationMembershipRolesTableName)
        .where('role', 'member')
        .delete();
}
