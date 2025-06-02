import { DbQueryHistory } from '../../database/entities/queryHistory';

export enum ResultsCacheStatus {
    PENDING = 'pending',
    READY = 'ready',
}

export type CacheHitCacheResult = {
    cacheKey: string;
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
};

export type CreateCacheResult = CacheHitCacheResult | MissCacheResult;
