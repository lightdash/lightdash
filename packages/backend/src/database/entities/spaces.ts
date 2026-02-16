import { Knex } from 'knex';

export type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    is_private: boolean;
    created_at: Date;
    project_id: number;
    organization_uuid: string;
    created_by_user_id?: number;
    search_vector: string;
    slug: string;
    parent_space_uuid: string | null;
    path: string;
    inherit_parent_permissions: boolean;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
};

export type CreateDbSpace = Pick<
    DbSpace,
    | 'name'
    | 'project_id'
    | 'is_private'
    | 'created_by_user_id'
    | 'slug'
    | 'parent_space_uuid'
    | 'path'
    | 'inherit_parent_permissions'
>;

export type UpdateDbSpace = Partial<
    Pick<DbSpace, 'name' | 'is_private' | 'inherit_parent_permissions'>
>;

export type SpaceTable = Knex.CompositeTableType<
    DbSpace,
    CreateDbSpace,
    UpdateDbSpace | Pick<DbSpace, 'deleted_at' | 'deleted_by_user_uuid'>
>;
export const SpaceTableName = 'spaces';

export type DbSpaceUserAccess = {
    user_uuid: string;
    space_uuid: string;
    space_role: string;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbSpaceUserAccess = Pick<
    DbSpaceUserAccess,
    'user_uuid' | 'space_uuid' | 'space_role'
>;

export type SpaceUserAccessTable = Knex.CompositeTableType<
    DbSpaceUserAccess | CreateDbSpaceUserAccess
>;

export const SpaceUserAccessTableName = 'space_user_access';

export type DbSpaceGroupAccess = {
    group_uuid: string;
    space_uuid: string;
    space_role: string;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbSpaceGroupAccess = Pick<
    DbSpaceGroupAccess,
    'group_uuid' | 'space_uuid' | 'space_role'
>;

export type SpaceGroupAccessTable = Knex.CompositeTableType<
    DbSpaceGroupAccess | CreateDbSpaceGroupAccess
>;

export const SpaceGroupAccessTableName = 'space_group_access';
