import { Knex } from 'knex';

// Extra custom roles unioned on top of a direct project membership's primary `role`/`role_uuid` slot.
export const ProjectMembershipCustomRolesTableName =
    'project_membership_custom_roles';

export type DbProjectMembershipCustomRole = {
    project_id: number;
    user_id: number;
    role_uuid: string;
    created_at: Date;
};

export type DbProjectMembershipCustomRoleIn = Pick<
    DbProjectMembershipCustomRole,
    'project_id' | 'user_id' | 'role_uuid'
>;

export type ProjectMembershipCustomRolesTable = Knex.CompositeTableType<
    DbProjectMembershipCustomRole,
    DbProjectMembershipCustomRoleIn,
    never
>;
