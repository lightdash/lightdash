import { ResultColumns } from '@lightdash/common';

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
    columns: ResultColumns;
    originalColumns: ResultColumns;
};

export type MissCacheResult = {
    cacheHit: false;
    updatedAt: undefined;
    expiresAt: undefined;
};

export type CreateCacheResult = CacheHitCacheResult | MissCacheResult;
