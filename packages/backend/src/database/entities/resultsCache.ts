import { Knex } from 'knex';

export type DbResultsCache = {
    cache_key: string;
    project_uuid: string;
    cache_expires_at: Date;
    total_row_count: number | null;
};

export type DbResultsCacheUpdate = Pick<DbResultsCache, 'total_row_count'>;

export type ResultsCacheTable = Knex.CompositeTableType<
    DbResultsCache,
    DbResultsCache,
    DbResultsCacheUpdate
>;

export const ResultsCacheTableName = 'results_cache';
