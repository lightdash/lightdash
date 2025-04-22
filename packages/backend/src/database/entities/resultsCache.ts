import { Knex } from 'knex';

export type DbResultsCache = {
    cache_key: string;
    project_uuid: string;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
    total_row_count: number | null;
};

export type DbResultsCacheIn = Omit<
    DbResultsCache,
    'created_at' | 'updated_at'
>;

export type DbResultsCacheUpdate =
    | Pick<DbResultsCache, 'total_row_count'>
    | Pick<DbResultsCache, 'expires_at' | 'updated_at'>;

export type ResultsCacheTable = Knex.CompositeTableType<
    DbResultsCache,
    DbResultsCacheIn,
    DbResultsCacheUpdate
>;

export const ResultsCacheTableName = 'results_cache';
