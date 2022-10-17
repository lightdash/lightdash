import { Knex } from 'knex';

export const ShareTableName = 'share';

export type DbShareUrl = {
    nanoid: string;
    path: string;
    params: string;
    organization_id: string;
    created_by_user_id: string;
};

export type JobsTable = Knex.CompositeTableType<DbShareUrl>;
