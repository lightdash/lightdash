import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds three empty join tables for additional custom-role assignments; existing role columns and writes are unchanged',
} as const;

const RolesTableName = 'roles';
const OrganizationMembershipsTableName = 'organization_memberships';
const ProjectMembershipsTableName = 'project_memberships';
const ProjectGroupAccessTableName = 'project_group_access';

const OrganizationMembershipCustomRolesTableName =
    'organization_membership_custom_roles';
const ProjectMembershipCustomRolesTableName = 'project_membership_custom_roles';
const ProjectGroupAccessCustomRolesTableName =
    'project_group_access_custom_roles';

const LockTimeout = '5s';

// Extra custom roles unioned on top of a membership's primary `role`/`role_uuid`
// slot. Rows cascade with the parent membership; referenced roles can't be deleted.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);

    if (
        !(await knex.schema.hasTable(
            OrganizationMembershipCustomRolesTableName,
        ))
    ) {
        await knex.schema.createTable(
            OrganizationMembershipCustomRolesTableName,
            (table) => {
                table.integer('organization_id').notNullable();
                table.integer('user_id').notNullable();
                table
                    .uuid('role_uuid')
                    .notNullable()
                    .references('role_uuid')
                    .inTable(RolesTableName)
                    .onDelete('RESTRICT')
                    .index();
                table
                    .timestamp('created_at')
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.primary(['organization_id', 'user_id', 'role_uuid']);
                table
                    .foreign(['organization_id', 'user_id'])
                    .references(['organization_id', 'user_id'])
                    .inTable(OrganizationMembershipsTableName)
                    .onDelete('CASCADE');
            },
        );
    }

    if (!(await knex.schema.hasTable(ProjectMembershipCustomRolesTableName))) {
        await knex.schema.createTable(
            ProjectMembershipCustomRolesTableName,
            (table) => {
                table.integer('project_id').notNullable();
                table.integer('user_id').notNullable();
                table
                    .uuid('role_uuid')
                    .notNullable()
                    .references('role_uuid')
                    .inTable(RolesTableName)
                    .onDelete('RESTRICT')
                    .index();
                table
                    .timestamp('created_at')
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.primary(['project_id', 'user_id', 'role_uuid']);
                // project_memberships primary key is (user_id, project_id)
                table
                    .foreign(['user_id', 'project_id'])
                    .references(['user_id', 'project_id'])
                    .inTable(ProjectMembershipsTableName)
                    .onDelete('CASCADE');
            },
        );
    }

    if (!(await knex.schema.hasTable(ProjectGroupAccessCustomRolesTableName))) {
        await knex.schema.createTable(
            ProjectGroupAccessCustomRolesTableName,
            (table) => {
                table.uuid('project_uuid').notNullable();
                table.uuid('group_uuid').notNullable();
                table
                    .uuid('role_uuid')
                    .notNullable()
                    .references('role_uuid')
                    .inTable(RolesTableName)
                    .onDelete('RESTRICT')
                    .index();
                table
                    .timestamp('created_at')
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.primary(['project_uuid', 'group_uuid', 'role_uuid']);
                table
                    .foreign(['project_uuid', 'group_uuid'])
                    .references(['project_uuid', 'group_uuid'])
                    .inTable(ProjectGroupAccessTableName)
                    .onDelete('CASCADE');
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LockTimeout}'`);
    await knex.schema.dropTableIfExists(ProjectGroupAccessCustomRolesTableName);
    await knex.schema.dropTableIfExists(ProjectMembershipCustomRolesTableName);
    await knex.schema.dropTableIfExists(
        OrganizationMembershipCustomRolesTableName,
    );
}
