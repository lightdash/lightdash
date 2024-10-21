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
};

export type CreateDbSpace = Pick<
    DbSpace,
    'name' | 'project_id' | 'is_private' | 'created_by_user_id' | 'slug'
>;

export type UpdateDbSpace = Partial<Pick<DbSpace, 'name' | 'is_private'>>;

export type SpaceTable = Knex.CompositeTableType<
    DbSpace,
    CreateDbSpace,
    UpdateDbSpace
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
