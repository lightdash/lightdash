import { ResultColumns } from '@lightdash/common';
import { Knex } from 'knex';
import { ResultsCacheStatus } from '../../services/CacheService/types';

/**
 * Table and columns soon to be updated/migrated to not mention "cache"
 */

export type DbResultsCache = {
    cache_key: string;
    project_uuid: string;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
    total_row_count: number | null;
    status: ResultsCacheStatus;
    columns: ResultColumns | null;
};

export type DbResultsCacheIn = Omit<
    DbResultsCache,
    'created_at' | 'updated_at'
>;

export type DbResultsCacheUpdate = Partial<
    Pick<
        DbResultsCache,
        'total_row_count' | 'status' | 'expires_at' | 'updated_at' | 'columns'
    >
>;

export type ResultsCacheTable = Knex.CompositeTableType<
    DbResultsCache,
    DbResultsCacheIn,
    DbResultsCacheUpdate
>;

export const ResultsCacheTableName = 'results_cache';
