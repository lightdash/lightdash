import { Knex } from 'knex';

// Extra custom roles unioned on top of an organization membership's primary `role`/`role_uuid` slot.
export const OrganizationMembershipCustomRolesTableName =
    'organization_membership_custom_roles';

export type DbOrganizationMembershipCustomRole = {
    organization_id: number;
    user_id: number;
    role_uuid: string;
    created_at: Date;
};

export type DbOrganizationMembershipCustomRoleIn = Pick<
    DbOrganizationMembershipCustomRole,
    'organization_id' | 'user_id' | 'role_uuid'
>;

export type OrganizationMembershipCustomRolesTable = Knex.CompositeTableType<
    DbOrganizationMembershipCustomRole,
    DbOrganizationMembershipCustomRoleIn,
    never
>;
