import {
    ResultsCacheMissReason,
    type QueryHistory,
    type QueryResultProducer,
} from '@lightdash/common';
import { DbQueryHistory } from '../../database/entities/queryHistory';

export enum ResultsCacheStatus {
    PENDING = 'pending',
    READY = 'ready',
}

export type CacheHitCacheResult = {
    queryUuid?: string;
    queryHistory?: QueryHistory;
    resultProducer: QueryResultProducer | null;
    cacheKey: string;
    cacheGeneration: number;
    cacheHit: true;
    totalRowCount: number;
    fileName: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    columns: DbQueryHistory['columns'];
    originalColumns: DbQueryHistory['original_columns'];
    pivotValuesColumns: DbQueryHistory['pivot_values_columns'];
    pivotTotalColumnCount: DbQueryHistory['pivot_total_column_count'];
};

export type MissCacheResult = {
    cacheHit: false;
    updatedAt: undefined;
    expiresAt: undefined;
    // null: a valid result existed but a refresh was forced
    missReason: ResultsCacheMissReason | null;
};

export type CacheLookupMiss = {
    cacheHit: false;
    missReason: ResultsCacheMissReason;
};

export type CacheLookupResult = CacheHitCacheResult | CacheLookupMiss;

export type CreateCacheResult = CacheHitCacheResult | MissCacheResult;

export const cacheMiss = (
    missReason: ResultsCacheMissReason | null,
): MissCacheResult => ({
    cacheHit: false,
    updatedAt: undefined,
    expiresAt: undefined,
    missReason,
});
