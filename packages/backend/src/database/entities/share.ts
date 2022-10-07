import { Knex } from 'knex';

export const ShareTableName = 'share';

export type DbShareUrl = {
    nanoid: string;
    path: string;
    params: string;
};

export type JobsTable = Knex.CompositeTableType<DbShareUrl>;
