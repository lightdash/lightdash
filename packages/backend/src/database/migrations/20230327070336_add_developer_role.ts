import { Knex } from 'knex';

const organizationMembershipsTableName = 'organization_memberships';
const organizationMembershipRolesTableName = 'organization_membership_roles';
const projectMembershipRolesTableName = 'project_membership_roles';
const projectMembershipsTableName = 'organization_memberships';

const developerRole = 'developer';
const editorRole = 'editor';

export async function up(knex: Knex): Promise<void> {
    await knex(projectMembershipRolesTableName).insert({
        role: developerRole,
    });
    await knex(organizationMembershipRolesTableName).insert({
        role: developerRole,
    });

    await knex(projectMembershipsTableName)
        .update('role', developerRole)
        .where('role', editorRole);
    await knex(organizationMembershipsTableName)
        .update('role', developerRole)
        .where('role', editorRole);
}

export async function down(knex: Knex): Promise<void> {
    await knex(projectMembershipsTableName)
        .update('role', editorRole)
        .where('role', developerRole);
    await knex(organizationMembershipsTableName)
        .update('role', editorRole)
        .where('role', developerRole);

    await knex(projectMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
    await knex(organizationMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
}
