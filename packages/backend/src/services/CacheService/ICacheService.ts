import type { ResultRow } from '@lightdash/common';
import type { IResultsCacheStorageClient } from '../../clients/ResultsCacheStorageClients/ResultsCacheStorageClient';
import type { CreateCacheResult } from './types';

export interface ICacheService {
    createOrGetExistingCache: (
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
        storageClient: IResultsCacheStorageClient,
        invalidateCache: boolean,
    ) => Promise<CreateCacheResult>;
    getCachedResultsPage: (
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
        storageClient: IResultsCacheStorageClient,
        formatter: (row: ResultRow) => ResultRow,
    ) => Promise<{
        rows: ResultRow[];
        totalRowCount: number;
        expiresAt: Date;
    }>;
}
