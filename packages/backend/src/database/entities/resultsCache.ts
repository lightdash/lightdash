import { Knex } from 'knex';

export type DbResultsCache = {
    cache_key: string;
    project_uuid: string;
    cache_expires_at: Date;
};

export type ResultsCacheTable = Knex.CompositeTableType<DbResultsCache>;

export const ResultsCacheTableName = 'results_cache';
