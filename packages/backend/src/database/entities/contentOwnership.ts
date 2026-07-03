import { Knex } from 'knex';

export const ContentOwnershipTableName = 'content_ownership';

export type DbContentOwnership = {
    content_ownership_uuid: string;
    content_type: string;
    content_uuid: string;
    project_uuid: string;
    owner_user_uuid: string | null;
    owner_group_uuid: string | null;
    assigned_by_user_uuid: string | null;
    assigned_at: Date;
};

export type CreateDbContentOwnership = Pick<
    DbContentOwnership,
    | 'content_type'
    | 'content_uuid'
    | 'project_uuid'
    | 'owner_user_uuid'
    | 'owner_group_uuid'
    | 'assigned_by_user_uuid'
>;

export type UpdateDbContentOwnership = Pick<
    DbContentOwnership,
    'owner_user_uuid' | 'owner_group_uuid' | 'assigned_by_user_uuid'
> & { assigned_at: Knex.Raw | Date };

export type ContentOwnershipTable = Knex.CompositeTableType<
    DbContentOwnership,
    CreateDbContentOwnership,
    UpdateDbContentOwnership
>;
