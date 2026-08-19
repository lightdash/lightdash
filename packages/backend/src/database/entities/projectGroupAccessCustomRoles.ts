import { Knex } from 'knex';

// Extra custom roles unioned on top of a project group access row's primary `role`/`role_uuid` slot.
export const ProjectGroupAccessCustomRolesTableName =
    'project_group_access_custom_roles';

export type DbProjectGroupAccessCustomRole = {
    project_uuid: string;
    group_uuid: string;
    role_uuid: string;
    created_at: Date;
};

export type DbProjectGroupAccessCustomRoleIn = Pick<
    DbProjectGroupAccessCustomRole,
    'project_uuid' | 'group_uuid' | 'role_uuid'
>;

export type ProjectGroupAccessCustomRolesTable = Knex.CompositeTableType<
    DbProjectGroupAccessCustomRole,
    DbProjectGroupAccessCustomRoleIn,
    never
>;
