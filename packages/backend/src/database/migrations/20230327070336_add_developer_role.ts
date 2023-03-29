import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';
const projectMembershipRolesTableName = 'project_membership_roles';

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
    await knex(projectMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
    await knex(organizationMembershipRolesTableName)
        .where('role', developerRole)
        .delete();
}
