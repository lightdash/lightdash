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
};

export type CreateDbSpace = Pick<
    DbSpace,
    'name' | 'project_id' | 'is_private' | 'created_by_user_id'
>;

export type SpaceTable = Knex.CompositeTableType<DbSpace, CreateDbSpace>;
export const SpaceTableName = 'spaces';

export type DbSpaceShare = {
    space_id: number;
    user_id: number;
};

type CreateDbSpaceShare = Pick<DbSpaceShare, 'space_id' | 'user_id'>;

export type SpaceShareTable = Knex.CompositeTableType<
    DbSpaceShare,
    CreateDbSpaceShare
>;

export const SpaceShareTableName = 'space_share';
