import { Knex } from 'knex';

type DbGroup = {
    group_uuid: string;
    name: string;
    created_at: Date;
    organization_id: number;
};

type DbGroupCreate = Pick<DbGroup, 'organization_id' | 'name'>;
type DbGroupUpdate = Pick<DbGroup, 'name'>;

export const GroupTableName = 'groups';
export type GroupTable = Knex.CompositeTableType<
    DbGroup,
    DbGroupCreate,
    DbGroupUpdate
>;
