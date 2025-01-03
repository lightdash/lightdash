import { Knex } from 'knex';

export type DbGroup = {
    organization_id: number;
    group_uuid: string;
    name: string;
    created_at: Date;
    created_by_user_uuid: string | null;
    updated_at: Date;
    updated_by_user_uuid: string | null;
};

type DbGroupCreate = Pick<
    DbGroup,
    'organization_id' | 'name' | 'created_by_user_uuid' | 'updated_by_user_uuid'
> &
    Partial<Pick<DbGroup, 'group_uuid'>>;
type DbGroupUpdate = Pick<
    DbGroup,
    'name' | 'updated_at' | 'updated_by_user_uuid'
>;

export const GroupTableName = 'groups';
export type GroupTable = Knex.CompositeTableType<
    DbGroup,
    DbGroupCreate,
    DbGroupUpdate
>;
