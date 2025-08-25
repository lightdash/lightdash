import { OrganizationMemberRole } from '@lightdash/common';
import { Knex } from 'knex';

export const OrganizationMembershipsTableName = 'organization_memberships';

export type DbOrganizationMembership = {
    organization_id: number;
    user_id: number;
    created_at: Date;
    role: OrganizationMemberRole;
    role_uuid?: string | null;
};

export type DbOrganizationMembershipIn = {
    user_id: number;
    organization_id: number;
    role: OrganizationMemberRole;
    role_uuid?: string | null;
};

export type DbOrganizationMembershipUpdate = {
    role?: OrganizationMemberRole;
    role_uuid?: string | null;
};

export type OrganizationMembershipsTable = Knex.CompositeTableType<
    DbOrganizationMembership,
    DbOrganizationMembershipIn,
    DbOrganizationMembershipUpdate
>;
