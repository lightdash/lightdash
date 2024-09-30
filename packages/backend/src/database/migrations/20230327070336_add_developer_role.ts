import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';
const projectMembershipRolesTableName = 'project_membership_roles';
const projectMembershipTableName = 'project_memberships';
const organizationMembershipTableName = 'organization_memberships';

const developerRole = 'developer';
const editorRole = 'editor';

export async function up(knex: Knex): Promise<void> {
    await knex(projectMembershipRolesTableName).insert({
        role: developerRole,
    });
    await knex(organizationMembershipRolesTableName).insert({
        role: developerRole,
    });
}

export async function down(knex: Knex): Promise<void> {
    // First delete all project memberships with the developer role which has a RESTRICT foreign key constraint
    await knex(projectMembershipTableName)
        .where('role', developerRole)
        .delete();
    await knex(organizationMembershipTableName)
        .where('role', developerRole)
        .delete();

    await knex(projectMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
    await knex(organizationMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
}
