import { Knex } from 'knex';

type DbGroupMembership = {
    group_uuid: string;
    user_id: number;
    organization_id: number;
    created_at: Date;
};

type DbGroupMembershipCreate = Pick<
    DbGroupMembership,
    'group_uuid' | 'user_id' | 'organization_id'
>;
export const GroupMembershipTableName = 'group_memberships';
export type GroupMembershipTable = Knex.CompositeTableType<
    DbGroupMembership,
    DbGroupMembershipCreate,
    never
>;
