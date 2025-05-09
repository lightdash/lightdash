import type { ResultRow } from '@lightdash/common';
import { S3ResultsFileStorageClient } from '../../clients/ResultsFileStorageClients/S3ResultsFileStorageClient';
import type {
    CacheHitCacheResult,
    CreateCacheResult,
    ResultsCacheStatus,
} from './types';

export interface ICacheService {
    storageClient: S3ResultsFileStorageClient;

    createOrGetExistingCache: (
        projectUuid: string,
        cacheIdentifiers: {
            sql: string;
            timezone?: string;
        },
        invalidateCache?: boolean,
    ) => Promise<CreateCacheResult>;
    getCachedResultsPage: (
        cacheKey: string,
        projectUuid: string,
        page: number,
        pageSize: number,
        formatter: (row: ResultRow) => ResultRow,
    ) => Promise<{
        rows: ResultRow[];
        totalRowCount: number;
        expiresAt: Date;
    }>;
    updateCache: (
        cacheKey: string,
        projectUuid: string,
        update: Partial<{
            total_row_count: number | null;
            expires_at: Date;
            updated_at: Date;
            status: ResultsCacheStatus;
        }>,
    ) => Promise<void>;
    deleteCache: (cacheKey: string, projectUuid: string) => Promise<void>;
    findCache: (
        cacheKey: string,
        projectUuid: string,
    ) => Promise<CacheHitCacheResult | undefined>;
}
